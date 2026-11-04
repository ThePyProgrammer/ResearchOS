"""Fetch full outgoing reference lists, independently of discovery rankings."""
import hashlib
import json
from urllib.parse import quote

import httpx

from models.citation import CitationReference, CitationResult
from services import openalex_client
from services.citation_identity_service import (
    exact_work_match, local_identifiers, normalize_doi, normalize_title, openalex_id, work_identifiers,
)
from services.openalex_client import CitationProviderError


async def fetch_openalex(paper: dict, client: httpx.AsyncClient) -> CitationResult:
    ids = local_identifiers(paper)
    hits = []
    if ids.get("doi"):
        hits = await openalex_client.search(client, filter=f"doi:{ids['doi']}")
    exact = [w for w in hits if exact_work_match(paper, w)]
    if not exact and ids.get("arxiv"):
        hits = await openalex_client.search(client, search=ids["arxiv"])
        exact = [w for w in hits if exact_work_match(paper, w)]
    if not exact and paper.get("title"):
        hits = await openalex_client.search(client, search=paper["title"])
        exact = [w for w in hits if exact_work_match(paper, w)]
    exact = {openalex_id(w.get("id")): w for w in exact if openalex_id(w.get("id"))}
    if len(exact) != 1:
        candidates = [{"id": w.get("id"), "title": w.get("display_name"),
                       "year": w.get("publication_year"),
                       "authors": [a.get("author", {}).get("display_name") for a in w.get("authorships", [])]}
                      for w in hits if normalize_title(w.get("display_name") or "") == normalize_title(paper.get("title") or "")]
        return CitationResult(provider="openalex", status="not_found", identities=ids,
                              resolution="ambiguous" if len(exact) > 1 else "candidate" if candidates else "unresolved",
                              candidates=candidates, message="No unique identifier-verified OpenAlex work")
    wid, work = next(iter(exact.items()))
    resolved_ids = {**ids, "openalex": wid}
    # A work verified by one local identifier can supply a unique missing alias.
    # Do not choose arbitrarily among multiple preprint/published identifiers.
    for kind, values in work_identifiers(work).items():
        if kind not in resolved_ids and len(values) == 1:
            resolved_ids[kind] = next(iter(values))
    references = work.get("referenced_works")
    if not isinstance(references, list):
        return CitationResult(provider="openalex", status="partial", identities=resolved_ids,
                              message="Provider did not supply a reference list")
    result = CitationResult(provider="openalex", identities=resolved_ids)
    seen = set()
    for target in references:
        tid = openalex_id(target) if isinstance(target, str) else None
        if not tid:
            result.status = "partial"
            result.message = "Provider returned an invalid reference identifier"
            continue
        if tid in seen:
            continue
        seen.add(tid)
        result.references.append(CitationReference(key=tid, identifiers={"openalex": tid},
                                                   raw={"source_work": wid, "target_work": tid}))
    return result


def parse_crossref(paper: dict, record: dict) -> CitationResult:
    ids = local_identifiers(paper)
    if not ids.get("doi") or normalize_doi(record.get("DOI")) != ids["doi"]:
        raise CitationProviderError("Crossref source DOI did not match")
    result = CitationResult(provider="crossref", identities=ids)
    references = record.get("reference")
    if not isinstance(references, list):
        result.status = "partial"
        result.message = "Crossref did not supply a reference list"
        return result
    seen = set()
    for ref in references:
        if not isinstance(ref, dict):
            result.status = "partial"
            result.message = "Crossref returned an invalid reference"
            continue
        key = hashlib.sha256(json.dumps(ref, sort_keys=True).encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        doi = normalize_doi(ref.get("DOI"))
        result.references.append(CitationReference(key=key, identifiers={"doi": doi} if doi else {}, raw=ref))
    return result


async def fetch_crossref(paper: dict, client: httpx.AsyncClient, captured: dict | None = None) -> CitationResult:
    doi = normalize_doi(paper.get("doi"))
    if not doi:
        return CitationResult(provider="crossref", status="not_found", resolution="unresolved",
                              identities=local_identifiers(paper), message="No DOI available")
    if captured is None:
        data = await openalex_client.get_json(client, f"https://api.crossref.org/works/{quote(doi, safe='')}")
        if data is None:
            return CitationResult(provider="crossref", status="not_found", resolution="unresolved",
                                  identities=local_identifiers(paper), message="DOI not found in Crossref")
        captured = data.get("message")
    if not isinstance(captured, dict):
        raise CitationProviderError("Crossref returned no work record")
    return parse_crossref(paper, captured)
