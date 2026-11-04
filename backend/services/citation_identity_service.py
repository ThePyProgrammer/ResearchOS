"""Conservative identifier handling shared by citation providers."""
import re
import unicodedata
from urllib.parse import unquote, urlsplit


def normalize_doi(value: str | None) -> str | None:
    value = unquote(value or "").strip()
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value, flags=re.I)
    return value.lower() if re.fullmatch(r"10\.\d{4,9}/\S+", value, re.I) else None


def normalize_arxiv(value: str | None) -> str | None:
    value = (value or "").strip()
    if value.startswith(("http://", "https://")):
        url = urlsplit(value)
        if (url.hostname or "").lower() not in {"arxiv.org", "www.arxiv.org", "export.arxiv.org"}:
            return None
        value = re.sub(r"^/(?:abs|pdf)/", "", url.path)
    value = re.sub(r"^arxiv:\s*", "", value, flags=re.I)
    value = re.sub(r"\.pdf$", "", value, flags=re.I)
    match = re.fullmatch(r"(\d{4}\.\d{4,5}|[a-z][a-z.\-]+/\d{7})(?:v\d+)?", value, re.I)
    return match.group(1).lower() if match else None


def normalize_title(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return " ".join("".join(c if c.isalnum() or c.isspace() else " " for c in value).split())


def openalex_id(value: str | None) -> str | None:
    value = (value or "").removeprefix("https://openalex.org/")
    return value if re.fullmatch(r"W\d+", value) else None


def local_identifiers(paper: dict) -> dict[str, str]:
    return {key: value for key, value in {
        "doi": normalize_doi(paper.get("doi")),
        "arxiv": normalize_arxiv(paper.get("arxiv_id")),
    }.items() if value}


def work_identifiers(work: dict) -> dict[str, set[str]]:
    ids = work.get("ids") or {}
    dois = {normalize_doi(work.get("doi")), normalize_doi(ids.get("doi"))}
    arxiv = {normalize_arxiv(ids.get("arxiv"))}
    for location in work.get("locations") or []:
        dois.add(normalize_doi(location.get("doi")))
        arxiv.update(normalize_arxiv(location.get(key)) for key in ("landing_page_url", "pdf_url"))
    return {"doi": dois - {None}, "arxiv": arxiv - {None}}


def exact_work_match(paper: dict, work: dict) -> bool:
    local = local_identifiers(paper)
    remote = work_identifiers(work)
    # If both identifiers are present locally, do not accept a contradictory DOI.
    if local.get("doi") and remote["doi"] and local["doi"] not in remote["doi"]:
        return False
    return any(value in remote[key] for key, value in local.items())
