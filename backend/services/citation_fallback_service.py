"""Schedule local PDF fallback after provider attempts, including after worker restart."""
from services import citation_repository as repository
from services.pdf_service import managed_location


def schedule_pdf_fallbacks(paper_ids: list[str] | None = None) -> list[str]:
    queued = []
    after = ''
    while True:
        candidates = repository.fallback_candidates(paper_ids, after)
        if not candidates:
            return queued
        for candidate in candidates:
            if managed_location(candidate['pdf_url']):
                jobs = repository.enqueue_fallback(candidate['paper_id'], candidate['fingerprint'])
                queued.extend(job['id'] for job in jobs)
        # Continue even for unmanaged URLs or a server-side page cap.
        after = candidates[-1]['paper_id']
