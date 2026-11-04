"""Database boundary for citation transactions. All mutations run through RPCs."""
from services.db import get_client


def enqueue(paper_id: str, force: bool = False) -> list[dict]:
    return get_client().rpc("enqueue_paper_citations", {"p_paper_id": paper_id, "p_force": force}).execute().data or []


def enqueue_pdf(paper_id: str, force: bool = False, engine: str = "pymupdf") -> list[dict]:
    if engine not in {"pymupdf", "grobid"}:
        raise ValueError("Unsupported PDF engine")
    rpc = "enqueue_local_pdf_citations" if engine == "pymupdf" else "enqueue_pdf_citations"
    return get_client().rpc(rpc, {"p_paper_id": paper_id, "p_force": force}).execute().data or []


def claim(job_id: str | None = None) -> dict | None:
    data = get_client().rpc("claim_citation_job", {"p_job_id": job_id}).execute().data
    return data[0] if data else None


def finish(job: dict, result) -> bool:
    return bool(get_client().rpc("finish_citation_job", {
        "p_job_id": job["id"], "p_lease_token": job["lease_token"],
        "p_result": result.model_dump(),
    }).execute().data)


def fail(job: dict, message: str, *, retry: bool = False, retry_seconds: int = 60) -> bool:
    return bool(get_client().rpc("fail_citation_job", {
        "p_job_id": job["id"], "p_lease_token": job["lease_token"], "p_error": message,
        "p_retry": retry, "p_retry_seconds": retry_seconds,
    }).execute().data)


def get_job(job_id: str) -> dict | None:
    rows = get_client().table("paper_citation_jobs").select(
        "id,paper_id,provider,status,attempts,updated_at,error"
    ).eq("id", job_id).execute().data
    return rows[0] if rows else None


def get_page(paper_id: str, direction: str, limit: int, offset: int) -> dict | None:
    return get_client().rpc("get_paper_citations", {
        "p_paper_id": paper_id, "p_direction": direction, "p_limit": limit, "p_offset": offset,
    }).execute().data


def capture_crossref(paper_id: str, record: dict) -> bool:
    return bool(get_client().rpc("capture_crossref_references", {
        "p_paper_id": paper_id, "p_record": record,
    }).execute().data)


def fallback_candidates(paper_ids: list[str] | None, after: str) -> list[dict]:
    return get_client().rpc('get_pdf_citation_fallback_candidates', {
        'p_paper_ids': paper_ids, 'p_after_id': after, 'p_limit': 100,
    }).execute().data or []


def enqueue_fallback(paper_id: str, fingerprint: str) -> list[dict]:
    return get_client().rpc('enqueue_pdf_citation_fallback', {
        'p_paper_id': paper_id, 'p_fingerprint': fingerprint,
    }).execute().data or []


def local_pdf_job_ids(paper_ids: list[str]) -> list[str]:
    # Include already-created fallback jobs when resuming a batch after a crash.
    result = []
    for start in range(0, len(paper_ids), 100):
        rows = get_client().table('paper_citation_jobs').select('id').eq('provider', 'pymupdf').in_(
            'paper_id', paper_ids[start:start + 100]).execute().data or []
        result.extend(row['id'] for row in rows)
    return result
