"""Bulk AI keyword extraction for project-linked papers.

Fetches all papers linked to a project, filters to those that are untagged
and have an abstract, then calls OpenAI in a single batched prompt to extract
3-5 keyword tags per paper.  Each paper is updated via paper_service so tags
are persisted to the database.

Usage::

    result = extract_keywords_for_project("proj_abc12345")
    # {"updated": 5, "skipped": 2, "total": 7}
"""
from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Optional

from openai import OpenAI

from models.paper import PaperUpdate
from services import paper_service, project_papers_service
from services.cost_service import record_openai_usage

logger = logging.getLogger(__name__)

_MODEL = "gpt-4o-mini"

_SYSTEM_PROMPT = (
    "Extract 3-5 broad category tags for each paper based on its title and abstract. "
    "Return a JSON object where keys are paper IDs and values are arrays of "
    "lowercase keyword strings. "
    "Use broad, reusable category labels that multiple papers in a research library "
    "would share. Avoid paper-specific terminology. Think of these as library shelf "
    "labels, not paper summaries. "
    "Good examples: 'machine learning', 'computer vision', 'natural language processing', "
    "'reinforcement learning', 'optimization', 'robotics', 'graph neural networks', "
    "'generative models', 'speech recognition', 'information retrieval'. "
    "Bad examples: 'multi-head attention mechanism', 'byte-pair encoding tokenization', "
    "'residual connections in transformers', 'BERT fine-tuning strategies'."
)


@lru_cache(maxsize=1)
def _get_openai_client() -> OpenAI:
    return OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def extract_keywords_for_project(project_id: str) -> dict:
    """Extract keyword tags for all untagged papers in a project.

    Args:
        project_id: The project whose linked papers will be processed.

    Returns:
        A dict with keys ``updated``, ``skipped``, and ``total``.
        ``updated`` is the number of papers that received new tags.
        ``skipped`` is the number of papers that were not processed
        (already have tags, no abstract, or not a paper link).
        ``total`` is ``updated + skipped``.
    """
    # Fetch all links for the project
    links = project_papers_service.list_project_papers(project_id)

    # Resolve paper objects — skip website/github_repo links
    all_papers = []
    for link in links:
        if link.paper_id is None:
            continue
        paper = paper_service.get_paper(link.paper_id)
        if paper is not None:
            all_papers.append(paper)

    total = len(all_papers)

    # Split into candidates (need tagging) and skipped (already tagged or no abstract)
    candidates = []
    skipped_count = 0

    for paper in all_papers:
        has_tags = bool(paper.tags)
        has_abstract = bool(paper.abstract and paper.abstract.strip())

        if has_tags or not has_abstract:
            skipped_count += 1
        else:
            candidates.append(paper)

    if not candidates:
        logger.info(
            "No papers need keyword extraction for project %s "
            "(total=%d, skipped=%d)",
            project_id,
            total,
            skipped_count,
        )
        return {"updated": 0, "skipped": skipped_count, "total": total}

    # Build the batched prompt payload
    payload = [
        {"id": p.id, "title": p.title, "abstract": p.abstract}
        for p in candidates
    ]
    user_message = json.dumps(payload, ensure_ascii=False)

    logger.info(
        "Calling OpenAI to extract keywords for %d papers in project %s",
        len(candidates),
        project_id,
    )

    response = _get_openai_client().chat.completions.create(
        model=_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    )

    # Record usage for the dashboard cost tracker
    try:
        record_openai_usage(response.usage, _MODEL)
    except Exception:  # noqa: BLE001
        logger.warning("Failed to record OpenAI usage for keyword extraction", exc_info=True)

    # Parse the JSON map: {paper_id: [keyword, ...]}
    raw_content = response.choices[0].message.content
    try:
        tag_map: dict[str, list[str]] = json.loads(raw_content)
    except json.JSONDecodeError:
        logger.error(
            "OpenAI returned non-JSON content for keyword extraction (project %s): %s",
            project_id,
            raw_content[:200],
        )
        return {"updated": 0, "skipped": total, "total": total}

    # Apply extracted tags via paper_service
    updated_count = 0
    for paper in candidates:
        keywords = tag_map.get(paper.id)
        if not isinstance(keywords, list) or not keywords:
            logger.warning(
                "No keywords returned for paper %s in project %s — skipping update",
                paper.id,
                project_id,
            )
            skipped_count += 1
            continue

        # Normalise: ensure all entries are lowercase strings
        clean_tags = [str(k).lower().strip() for k in keywords if k]

        paper_service.update_paper(paper.id, PaperUpdate(tags=clean_tags))
        updated_count += 1
        logger.debug("Updated tags for paper %s: %s", paper.id, clean_tags)

    logger.info(
        "Keyword extraction complete for project %s: %d updated, %d skipped",
        project_id,
        updated_count,
        skipped_count,
    )

    return {"updated": updated_count, "skipped": skipped_count, "total": total}
