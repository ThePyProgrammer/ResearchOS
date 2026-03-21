---
phase: 12-literature-review-dashboard
plan: "02"
subsystem: api
tags: [openai, keyword-extraction, fastapi, pytest, python, react]

requires:
  - phase: 12-literature-review-dashboard
    provides: project_papers_service.list_project_papers, paper_service.update_paper

provides:
  - POST /api/projects/{id}/papers/extract-keywords endpoint
  - keyword_extraction_service.extract_keywords_for_project()
  - projectPapersApi.extractKeywords(projectId) frontend method

affects:
  - 12-literature-review-dashboard (plans 03, 04 use extractKeywords button)

tech-stack:
  added: []
  patterns:
    - Single-batched OpenAI prompt pattern for bulk per-item processing (array of {id, title, abstract} -> {id: [tags]} map)
    - _get_openai_client() via @lru_cache(maxsize=1) for lazy singleton initialization in services

key-files:
  created:
    - backend/services/keyword_extraction_service.py
    - backend/tests/test_keyword_extraction.py
  modified:
    - backend/routers/projects.py
    - frontend/src/services/api.js

key-decisions:
  - "Single-batched OpenAI prompt chosen over per-paper calls: all abstracts sent as JSON array in one request, response is {paper_id: [tags]} map — minimizes latency and cost"
  - "_get_openai_client() uses @lru_cache(maxsize=1) for lazy initialization — consistent with db.py get_client() pattern"
  - "website/github_repo links silently skipped (not counted in total) — keyword extraction only applies to paper objects with abstracts"
  - "cost_service.record_openai_usage called in try/except to ensure cost recording failure never breaks the extraction response"
  - "Tags normalized to lowercase strings before persisting — ensures consistent casing regardless of LLM output"

patterns-established:
  - "Batched OpenAI JSON mode: serialize candidates as JSON array in user message, parse response map, iterate and update each item"

requirements-completed:
  - REV-05

duration: 12min
completed: "2026-03-21"
---

# Phase 12 Plan 02: Keyword Extraction Service Summary

**Bulk AI keyword tagging for project papers via single-batched OpenAI gpt-4o-mini prompt, returning {updated, skipped, total} with full skip logic for tagged and abstract-less papers**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-21T05:47:00Z
- **Completed:** 2026-03-21T05:59:49Z
- **Tasks:** 1 (TDD: test commit + impl commit)
- **Files modified:** 4

## Accomplishments

- `keyword_extraction_service.extract_keywords_for_project()` — fetches project-linked papers, filters to untagged + has-abstract candidates, calls OpenAI once in a batched prompt, updates each paper's tags via `paper_service.update_paper`
- `POST /api/projects/{id}/papers/extract-keywords` endpoint added to the projects router, returns `{updated, skipped, total}`
- `projectPapersApi.extractKeywords(projectId)` added to the frontend API client
- 9 tests covering all skip conditions, response mapping, mixed sets, website-link handling, and route layer (404 + 200 paths)
- Full test suite (73 tests) passes

## Task Commits

Each task was committed atomically:

1. **TDD RED: test_keyword_extraction.py** - `0edeec3` (test)
2. **TDD GREEN: keyword_extraction_service + route + api.js** - `4d7a391` (feat)

## Files Created/Modified

- `backend/services/keyword_extraction_service.py` — bulk keyword extraction via OpenAI JSON mode, exports `extract_keywords_for_project`
- `backend/tests/test_keyword_extraction.py` — 9 unit and route-level tests covering service logic and HTTP layer
- `backend/routers/projects.py` — added `POST /{project_id}/papers/extract-keywords` endpoint
- `frontend/src/services/api.js` — added `projectPapersApi.extractKeywords(projectId)`

## Decisions Made

- **Single-batched prompt over per-paper calls**: All abstracts are serialized as a JSON array in one OpenAI request. The response is a `{paper_id: [tags]}` map. This minimizes latency and token overhead compared to N sequential calls.
- **`_get_openai_client()` via `@lru_cache(maxsize=1)`**: Lazy singleton initialization, consistent with `db.py`'s `get_client()` pattern. Avoids instantiating the OpenAI client at module import time.
- **Website/github_repo links silently skipped, not counted in total**: The `total` field reflects only paper links with resolved Paper objects. Website/github links have no abstract and cannot be tagged; counting them as skipped would be misleading.
- **Cost recording in try/except**: A failure to record usage should never break the extraction response for the user.
- **Tags normalized to lowercase**: LLM output may vary in casing; normalizing ensures consistent storage regardless.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required beyond the existing `OPENAI_API_KEY` environment variable.

## Next Phase Readiness

- `projectPapersApi.extractKeywords(projectId)` is wired and ready for Plan 04 (coverage heatmap "Extract keywords" button)
- Service function is importable and tested; Plan 03/04 frontend work can call the endpoint immediately

---
*Phase: 12-literature-review-dashboard*
*Completed: 2026-03-21*
