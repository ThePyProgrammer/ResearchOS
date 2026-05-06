---
phase: 13-bulk-paper-processing
plan: 01
subsystem: api
tags: [fastapi, batch-processing, openai, embeddings, notes, pytest]

requires:
  - phase: 12-literature-review-dashboard
    provides: keyword extraction service patterns and OpenAI cost tracking
provides:
  - Bulk tagging endpoint for papers, websites, and GitHub repositories
  - Batch embedding indexing service and API endpoint
  - AI Notes skip-preview service and API endpoint
affects: [bulk-paper-processing, library, notes, search, frontend-batch-actions]

tech-stack:
  added: []
  patterns:
    - Thin FastAPI router delegating to service-layer batch operations
    - Item ID prefix dispatch: w_ for websites, gh_ for GitHub repos, otherwise papers
    - Skip-existing behavior for destructive or duplicate AI note generation

key-files:
  created:
    - backend/services/batch_service.py
    - backend/routers/batch.py
    - backend/tests/test_batch.py
  modified:
    - backend/services/keyword_extraction_service.py
    - backend/app.py
    - backend/tests/conftest.py

key-decisions:
  - "Batch item dispatch uses existing ID prefixes (w_, gh_, otherwise paper) to avoid new schema or polymorphic lookup infrastructure."
  - "Bulk note generation previews skip items with existing AI Notes folders instead of overwriting them."
  - "Route tests stub startup migration checks so API tests remain isolated from Supabase credentials."

patterns-established:
  - "Batch endpoints use /api/batch/* with request body {item_ids, library_id?}."
  - "Batch service functions return count-oriented payloads for progress UI consumption."
  - "Tests patch service imports at the router boundary rather than original service definitions."

requirements-completed: [BULK-01, BULK-02, BULK-03]

duration: 4min
completed: 2026-05-06
---

# Phase 13 Plan 01: Backend Batch Processing API Summary

**Bulk tagging, embedding indexing, and AI Notes skip-preview backend endpoints for mixed library item selections**

## Performance

- **Duration:** 4 min for this executor verification and summary pass; production work was already present in prior commits
- **Started:** 2026-05-06T06:38:19Z
- **Completed:** 2026-05-06T06:41:54Z
- **Tasks:** 2 verified complete
- **Files modified:** 6 total across plan implementation and test isolation fix

## Accomplishments

- Added `extract_keywords_for_items` to bulk-tag papers, websites, and GitHub repositories while skipping already-tagged or textless items.
- Added `batch_index_embeddings` and `batch_notes_preview` service functions for backend-driven bulk operations.
- Added `/api/batch/tags`, `/api/batch/embeddings`, and `/api/batch/notes/preview` FastAPI endpoints and registered the batch router in the app.
- Added tests covering service behavior, route responses, mixed item types, skip logic, and AI Notes preview behavior.
- Fixed the shared test client fixture so route tests do not require Supabase credentials during startup migration checks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend keyword extraction service + create batch service with notes preview** - `1b154df` (feat)
2. **Task 2: Create batch router and wire into FastAPI app** - `57e3acf` (feat)
3. **Verification fix: Isolate test client startup from database env** - `294a1a9` (fix)

**Plan metadata:** committed separately after summary creation.

_Note: Task production work was already present in recent repository history when this executor started, so it was verified rather than duplicated._

## Files Created/Modified

- `backend/services/keyword_extraction_service.py` - Adds explicit item-list keyword extraction for papers, websites, and GitHub repositories.
- `backend/services/batch_service.py` - Adds batch embedding indexing and AI Notes skip-preview service functions.
- `backend/routers/batch.py` - Adds `/api/batch/tags`, `/api/batch/embeddings`, and `/api/batch/notes/preview` endpoints.
- `backend/app.py` - Registers the batch router.
- `backend/tests/test_batch.py` - Covers service-level and route-level batch behavior.
- `backend/tests/conftest.py` - Stubs startup migration checks in the test client fixture.

## Decisions Made

- Batch item dispatch uses existing ID prefixes (`w_`, `gh_`, otherwise paper), avoiding new schema or lookup infrastructure.
- Existing AI Notes folders are treated as skip conditions for bulk note generation, preserving user-authored or prior AI-generated notes.
- Test startup now stubs both seeding and migration checks; otherwise route tests fail on missing Supabase environment variables before the endpoint logic is exercised.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stubbed migration checks in TestClient fixture**
- **Found during:** Verification after Task 2
- **Issue:** `uv run pytest tests/test_batch.py -x -q` failed during FastAPI startup because `_check_migrations()` called `get_client()` and required `SUPABASE_URL` and `SUPABASE_KEY`.
- **Fix:** Patched `_check_migrations` to a no-op in the shared `client` fixture, matching the existing `seed_data` isolation pattern.
- **Files modified:** `backend/tests/conftest.py`
- **Verification:** `uv run pytest tests/test_batch.py -x -q` and `uv run pytest tests/ -q` both pass.
- **Committed in:** `294a1a9`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix is test isolation only; production API behavior is unchanged.

## Issues Encountered

- Initial batch test run from the repository root failed because backend tests must run from `backend/`; reran from the correct directory.
- Route tests then failed on missing Supabase environment variables during startup migration checks; resolved with the fixture isolation fix above.

## Verification

- `cd /home/prannayag/personal/ResearchOS/.claude/worktrees/agent-a3bc7a2f18072938f/backend && uv run pytest tests/test_batch.py -x -q` — 13 passed, 2 warnings.
- `cd /home/prannayag/personal/ResearchOS/.claude/worktrees/agent-a3bc7a2f18072938f/backend && uv run pytest tests/ -q` — 86 passed, 2 warnings.
- `backend/app.py` includes `batch` in router imports and calls `app.include_router(batch.router)`.

## Known Stubs

None. Empty list initializers found during scanning are normal accumulators or test expectations, not UI-facing placeholder stubs.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-api-surface | backend/routers/batch.py | Adds three POST endpoints under `/api/batch/*`; project is explicitly single-user/no-auth, so this follows existing API trust assumptions. |
| threat_flag: external-ai-call | backend/services/keyword_extraction_service.py | Adds item-list OpenAI keyword extraction path using the existing model, JSON response format, and cost tracking pattern. |

## User Setup Required

None - no external service configuration required beyond the existing OpenAI/Supabase environment used by the app.

## Next Phase Readiness

- Frontend plans can call the batch endpoints with selected library item IDs.
- Notes generation UI can use `skip_ids` and `process_ids` to present non-overwrite behavior before starting work.
- Embedding generation UI can report `processed` and `not_found` counts from the backend response.

## Self-Check: PASSED

- Created/modified plan files verified present: `backend/services/keyword_extraction_service.py`, `backend/services/batch_service.py`, `backend/routers/batch.py`, `backend/app.py`, `backend/tests/test_batch.py`, `backend/tests/conftest.py`, `.planning/phases/13-bulk-paper-processing/13-01-SUMMARY.md`.
- Commits verified in git history: `1b154df`, `57e3acf`, `294a1a9`.
- Shared orchestrator artifacts were not modified by this executor.

---
*Phase: 13-bulk-paper-processing*
*Completed: 2026-05-06*
