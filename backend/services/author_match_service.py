"""
AI-powered author matching and enrichment.

- match: given a name + optional context, find candidates from DB
- enrich: collect linked papers, fetch Semantic Scholar profile, run a live
          web search via OpenAI, then extract structured profile updates
"""

import asyncio
import json
import logging
import os
from typing import Optional

import httpx

from agents.llm import get_model, get_openai_client, get_async_openai_client, is_new_api_model, completion_params
from agents.prompts import AUTHOR_ENRICHMENT

from models.author import Author
from services import author_service

logger = logging.getLogger(__name__)

_SEMANTIC_SCHOLAR_SEARCH = (
    "https://api.semanticscholar.org/graph/v1/author/search"
)
_SS_FIELDS = "name,affiliations,homepage,paperCount,hIndex,externalIds"
_SS_HEADERS = {"User-Agent": "researchos/1.0 (academic research tool)"}


async def _fetch_semantic_scholar_profile(name: str) -> Optional[list[dict]]:
    """Search Semantic Scholar for up to 3 author profiles matching *name*.

    Returns a list of candidate dicts, or None if the request fails or
    returns no results.  Failures are logged at WARNING — the caller must
    handle None gracefully so enrichment still works when the API is down.
    """
    params = {"query": name, "fields": _SS_FIELDS, "limit": 3}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                _SEMANTIC_SCHOLAR_SEARCH,
                params=params,
                headers=_SS_HEADERS,
            )
        if resp.status_code != 200:
            logger.warning(
                "Semantic Scholar returned HTTP %s for author search '%s'",
                resp.status_code,
                name,
            )
            return None

        candidates = resp.json().get("data", [])
        if not candidates:
            return None

        return [
            {
                "name": c.get("name"),
                "affiliations": [
                    a.get("name") for a in c.get("affiliations", []) if a.get("name")
                ],
                "homepage": c.get("homepage") or None,
                "paper_count": c.get("paperCount"),
                "h_index": c.get("hIndex"),
                "orcid": (c.get("externalIds") or {}).get("ORCID") or None,
                "semantic_scholar_id": c.get("authorId"),
            }
            for c in candidates
        ]
    except Exception:
        logger.warning(
            "Semantic Scholar lookup failed for author '%s'", name, exc_info=True
        )
        return None


async def _web_search_author(
    name: str,
    paper_titles: list[str],
    api_key: str,
) -> tuple[Optional[str], list[dict]]:
    """Use gpt-4o-mini-search-preview to search the web for an author's profile.

    Returns (summary_text, citations) where citations is a list of
    {"url": ..., "title": ...} dicts extracted from the response annotations.
    Both values are None / [] on failure so the caller degrades gracefully.
    """
    # Include a couple of paper titles as disambiguation context so the
    # search engine can distinguish between researchers with the same name.
    context = ""
    if paper_titles:
        sample = ", ".join(f'"{t}"' for t in paper_titles[:3])
        context = f" (author of papers including {sample})"

    query = (
        f"Find the academic profile of researcher {name}{context}. "
        "Return their current affiliation, ORCID, Google Scholar URL, "
        "personal website, GitHub username, and email address if publicly available."
    )

    try:
        client = get_async_openai_client()
        response = await client.chat.completions.create(
            model=get_model("web_search"),
            web_search_options={},
            messages=[{"role": "user", "content": query}],
        )
        message = response.choices[0].message
        summary = message.content or ""

        # Extract URL citations from annotations
        citations: list[dict] = []
        raw_annotations = getattr(message, "annotations", None) or []
        for ann in raw_annotations:
            # Each annotation is an object; access via attribute or dict
            ann_type = getattr(ann, "type", None) or (ann.get("type") if isinstance(ann, dict) else None)
            if ann_type == "url_citation":
                citation_obj = getattr(ann, "url_citation", None) or (ann.get("url_citation") if isinstance(ann, dict) else {})
                if citation_obj:
                    url = getattr(citation_obj, "url", None) or (citation_obj.get("url") if isinstance(citation_obj, dict) else None)
                    title = getattr(citation_obj, "title", None) or (citation_obj.get("title") if isinstance(citation_obj, dict) else None)
                else:
                    # Flat annotation (older format)
                    url = getattr(ann, "url", None) or (ann.get("url") if isinstance(ann, dict) else None)
                    title = getattr(ann, "title", None) or (ann.get("title") if isinstance(ann, dict) else None)
                if url:
                    citations.append({"url": url, "title": title or url})

        return summary, citations

    except Exception:
        logger.warning(
            "OpenAI web search failed for author '%s'", name, exc_info=True
        )
        return None, []


async def enrich_author(author: Author) -> dict:
    """Suggest profile updates using live web search + Semantic Scholar + library papers.

    Steps:
      1. Fetch up to 20 linked papers from the library.
      2. Concurrently: query Semantic Scholar (structured DB) AND run a live
         web search via gpt-4o-mini-search-preview (real search engine results).
      3. Feed all context into gpt-4o-mini with strict sourcing rules:
         ORCID/URLs/emails only populated when present in the gathered sources.

    Returns::
        {
            "suggestions":       dict,        # profile fields to apply
            "paper_count":       int,         # library papers used
            "web_context":       list | None, # Semantic Scholar candidates
            "web_search_summary": str | None, # raw text from web search model
            "citations":         list,        # [{"url": ..., "title": ...}]
        }
    """
    papers = author_service.get_author_papers(author.id)

    paper_context = [
        {
            "title": p.title,
            "year": p.year,
            "venue": p.venue,
            "co_authors": p.authors,
            "doi": p.doi,
            "arxiv_id": p.arxiv_id,
        }
        for p in papers[:20]
    ]
    paper_titles = [p.title for p in papers[:3] if p.title]

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {
            "error": "OPENAI_API_KEY not configured",
            "suggestions": {},
            "web_context": None,
            "web_search_summary": None,
            "citations": [],
        }

    # Run Semantic Scholar lookup and OpenAI web search concurrently
    ss_task = _fetch_semantic_scholar_profile(author.name)
    ws_task = _web_search_author(author.name, paper_titles, api_key)
    web_candidates, (web_summary, citations) = await asyncio.gather(ss_task, ws_task)

    # Build context blocks for the extraction prompt
    ss_block = ""
    if web_candidates:
        ss_block = f"""Semantic Scholar database results for "{author.name}":
{json.dumps(web_candidates, indent=2)}
"""
    else:
        ss_block = f'No Semantic Scholar results found for "{author.name}".\n'

    ws_block = ""
    if web_summary:
        ws_block = f"""Live web search results for "{author.name}":
{web_summary}
"""
    else:
        ws_block = f'Live web search returned no results for "{author.name}".\n'

    has_any_web_data = bool(web_candidates or web_summary)
    if not has_any_web_data:
        no_web_note = (
            "No external sources were found. "
            "Do NOT invent ORCID, URLs, or emails — omit those fields entirely."
        )
    else:
        no_web_note = ""

    try:
        client = get_openai_client()

        prompt = AUTHOR_ENRICHMENT.format(
            name=author.name,
            orcid=author.orcid or 'not set',
            affiliations=json.dumps([a.model_dump() for a in author.affiliations]) if author.affiliations else 'none',
            paper_context=json.dumps(paper_context, indent=2),
            ss_block=ss_block,
            ws_block=ws_block,
            no_web_note=no_web_note,
        )

        enrich_model = get_model("enrichment")
        enrich_kwargs: dict = {
            "model": enrich_model,
            "messages": [{"role": "user", "content": prompt}],
            **completion_params(enrich_model, max_tokens=2048, temperature=0.1),
        }
        if is_new_api_model(enrich_model):
            enrich_kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "author_enrichment",
                    "strict": False,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "affiliations": {"type": "array", "items": {"type": "object"}},
                            "orcid": {"type": "string"},
                            "google_scholar_url": {"type": "string"},
                            "github_username": {"type": "string"},
                            "website_url": {"type": "string"},
                            "emails": {"type": "array", "items": {"type": "string"}},
                            "confidence_notes": {"type": "string"},
                        },
                    },
                },
            }
        else:
            enrich_kwargs["response_format"] = {"type": "json_object"}
        response = client.chat.completions.create(**enrich_kwargs)

        raw_content: str = response.choices[0].message.content or "{}"
        suggestions = json.loads(raw_content)

        return {
            "suggestions": suggestions,
            "paper_count": len(papers),
            "web_context": web_candidates,
            "web_search_summary": web_summary,
            "citations": citations,
        }

    except Exception as exc:
        logger.exception("OpenAI enrichment failed for author %s", author.id)
        raise RuntimeError(f"Enrichment failed: {exc}") from exc
