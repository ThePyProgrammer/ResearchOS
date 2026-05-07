---
phase: 13-bulk-paper-processing
verified: 2026-05-07T00:00:00Z
status: accepted
score: 18/18 automated must-haves verified; UI-only UAT accepted for completion
overrides_applied: 0
gaps: []
human_verification:
  - test: "Full browser end-to-end UAT for all four Library bulk operations against live ResearchOS data"
    expected: "http://localhost:5173/library serves ResearchOS, is connected to backend http://localhost:8000, has an active library with selectable items, and includes mixed fixture data: some items with AI Notes and some without; some papers with stored PDFs and some without; enough items to observe skip/control/progress behavior. Selecting items exposes Generate Notes, Auto-Tag, Fetch PDFs, and Generate Embeddings; each shows confirmation and progress; notes/PDFs support pause/resume/cancel/retry where applicable; tags/embeddings complete through aggregate backend batch endpoints without pause/cancel controls."
    why_human: "UI-only browser UAT now verifies selection, bulk action bar, and confirmation modals, but the user explicitly chose not to click Start/Proceed. Live side effects, progress modals while running, pause/resume/cancel, retry, aggregate operation control behavior, table refresh, and persistence still require full live operation UAT."
---

# Phase 13: Bulk Paper Processing Verification Report

**Phase Goal:** Researchers can run batch operations on library items (papers, websites, GitHub repos) from the Library multi-select bulk action bar with progress tracking, pause/resume, cancellation, and retry.
**Verified:** 2026-05-07T00:00:00Z
**Status:** accepted
**Re-verification:** Yes — refreshed after UI-only browser UAT at `http://localhost:5173/library`; user accepted UI-only UAT as sufficient for Phase 13 completion

## Verdict

Automated goal-backward implementation verification still passes: the current codebase contains substantive backend endpoints, frontend batch infrastructure, and Library integration for the promised bulk paper/item processing behavior. Automated evidence remains 18/18 implementation must-haves verified, backend tests 94 passed, frontend tests 263 passed, code review passed, schema drift false, and codebase drift skipped as non-blocking because no structure document exists.

The security gate remains closed: `/home/prannayag/personal/ResearchOS/.planning/phases/13-bulk-paper-processing/13-SECURITY.md` exists with `status: passed` and `threats_open: 0`.

The browser UAT gate improved from data-blocked to UI-only partially verified. `/home/prannayag/personal/ResearchOS/.planning/phases/13-bulk-paper-processing/13-UAT.md` now reports 2 passed, 4 partial, and 2 blocked: `http://localhost:5173/library` serves ResearchOS, active Library data appears after context load, selecting rows exposes the expected bulk action bar, and confirmation modals open for Generate Notes, Auto-Tag, Fetch PDFs, and Generate Embeddings. Because the user explicitly chose UI-only UAT, no Start/Proceed buttons were clicked and no mutating bulk operations were executed. Full live operation behavior was not run; the user accepted the UI-only UAT scope for Phase 13 completion.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can select items and run bulk AI note generation, auto-tagging, PDF fetch, or embedding generation from the Library bulk action bar | UI PARTIAL / CODE VERIFIED | UI-only UAT selected 3 rows and showed Generate Notes, Auto-Tag, Fetch PDFs, and Generate Embeddings in the bulk action bar. Code evidence: `frontend/src/pages/Library.jsx` imports `useBatchProcessor`, `ConfirmBulkModal`, `BulkProgressModal`, and `batchApi`; bulk buttons are wired to `startBulkOperation('notes'|'tags'|'pdfs'|'embeddings')`; handlers call note APIs, `batchApi.tags`, `papersApi.fetchPdf`, and `batchApi.embeddings`. Live execution was not started by user choice. |
| 2 | Each operation shows a confirmation dialog with item count, skip count, cost estimate, and concurrency toggle before starting | UI VERIFIED | UI-only UAT opened confirmation modals for all four operations. Generate Notes showed 3 selected, 1 skipped, 2 processed, cost estimate, and Careful/Fast controls. Auto-Tag showed 3 selected, 1 already-tagged skip, 2 processed, cost estimate, and Careful/Fast controls. Fetch PDFs showed 3 selected, 3 skipped, 0 processed, and Careful/Fast controls. Generate Embeddings showed 3 selected, 3 processed, cost estimate, and Careful/Fast controls. Evidence screenshots are under `uat-evidence/2026-05-07-ui-only-*`. |
| 3 | Progress modal shows per-item status with overall progress bar, and user can pause/resume/cancel mid-batch | CODE VERIFIED / HUMAN_NEEDED | `BulkProgressModal.jsx` calculates processed counts/progress percent, renders per-item status rows, and exposes pause/resume/cancel controls when `allowControls` is true. `Library.jsx` passes `allowControls={bulkOperation !== 'tags' && bulkOperation !== 'embeddings'}` because tags/embeddings are single server batch calls; notes and PDFs retain pause/resume/cancel via `batch.run`. Browser running-state behavior was not exercised because UI-only UAT did not start operations. |
| 4 | Failed items are tracked and retriable with a single click after batch completion | CODE VERIFIED / HUMAN_NEEDED | `useBatchProcessor.js` stores non-standard status strings as errors and `getFailedItems()` returns failed items; `BulkProgressModal.jsx` renders `Retry N Failed`; `Library.jsx` wires `onRetryFailed={handleRetryFailed}`. Retry is implemented for per-item notes/PDF operations. Tags/embeddings are aggregate single-call operations with controls intentionally hidden. Browser retry behavior was not exercised because UI-only UAT did not start operations. |
| 5 | Auto-tagging works on papers, websites, and GitHub repos at the library level, not just project-scoped | CODE VERIFIED / HUMAN_NEEDED | `extract_keywords_for_items()` in `backend/services/keyword_extraction_service.py` dispatches paper/website/GitHub repo IDs, uses description/abstract text, skips tagged/textless items, and applies tags through the corresponding update service. `/api/batch/tags` calls it with optional `library_id`; `Library.jsx` passes `activeLibraryId`. Live tag generation was not started by user choice. |
| 6 | Backend exposes batch tags, embeddings, and notes preview endpoints | VERIFIED | `backend/routers/batch.py` defines `/api/batch/tags`, `/api/batch/embeddings`, and `/api/batch/notes/preview`; `backend/app.py` imports `batch` and includes `app.include_router(batch.router)`. |
| 7 | Batch embeddings process found papers, websites, and GitHub repos | VERIFIED | `batch_index_embeddings()` in `backend/services/batch_service.py` dispatches by `w_`/`gh_`/paper ID and awaits the corresponding `search_service.index_*` function. |
| 8 | Notes preview identifies items with existing AI Notes folders and returns skip/process IDs | VERIFIED | `batch_notes_preview()` queries the notes table for `name == "AI Notes"` and `type == "folder"`, builds typed item IDs, and returns `skip_ids`/`process_ids`; tests cover mixed paper/website/repo cases and collision handling. UI-only UAT also observed an allowed `/api/batch/notes/preview` request when opening Generate Notes. |
| 9 | useBatchProcessor processes items with configurable concurrency | VERIFIED | `useBatchProcessor.js` launches `Math.min(concurrency, items.length)` workers over a shared queue; Vitest hook tests cover sequential and concurrent processing. |
| 10 | Pausing stops new items from starting and resuming continues remaining items | VERIFIED | `useBatchProcessor.js` uses `isPausedRef` polling before queue shifts; tests cover pause/resume timing. |
| 11 | Cancellation stops processing and marks pending/in-flight items cancelled | VERIFIED | `cancel()` sets cancellation state, unpauses polling, and `run()` marks pending items cancelled; tests cover cancellation. |
| 12 | Progress modal is closeable while running and job state remains parent-owned | VERIFIED | `BulkProgressModal.jsx` sets `disableClose={false}` and `closeOnBackdrop={false}`; `Library.jsx` `handleCloseBulkProgress()` only hides the modal and does not clear batch state or cancel. |
| 13 | Notes generation supports papers, websites, and GitHub repos | VERIFIED | `Library.jsx` notes process function calls `notesApi.generate`, `notesApi.generateForWebsite`, or `notesApi.generateForGitHubRepo` by item type and returns `skipped` for previewed skip IDs. |
| 14 | PDF fetch is integrated into the unified bulk flow | VERIFIED | `Library.jsx` uses `startBulkOperation('pdfs')`, client-side skip detection, `papersApi.fetchPdf()`, item state updates, and the shared progress modal; old `showFetchModal`/`fetchStatuses`/`handleBulkFetchPdfs` patterns are absent. |
| 15 | Tags and embeddings use backend batch APIs with progress state | VERIFIED | `Library.jsx` uses `batch.runManaged()` with initial processing/skipped statuses and calls `batchApi.tags()` / `batchApi.embeddings()`, then marks completed IDs done or failed. |
| 16 | Backend batch routes validate unsafe batch inputs | VERIFIED | `BatchItemRequest` enforces 1-100 items, strips IDs, rejects empty IDs and duplicates; tests cover empty, oversized, and duplicate item lists. |
| 17 | Backend errors do not leak raw exception details through batch routes | VERIFIED | Router catches exceptions and raises `HTTPException(500, detail="Batch operation failed")`; tests assert internal error text is not exposed. |
| 18 | Phase 13 code is covered by backend and frontend automated tests | VERIFIED | Current gate summary: backend `uv run pytest tests/ -q` => 94 passed; frontend `npm exec --prefix ../frontend -- vitest --root /home/prannayag/personal/ResearchOS/frontend run` => 263 passed. `backend/tests/test_batch.py` and `frontend/src/hooks/useBatchProcessor.test.js` specifically cover Phase 13 behavior. |

**Score:** 18/18 automated truths verified; UI-only UAT confirms selection and confirmation flows; full operation UAT remains human_needed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `backend/services/keyword_extraction_service.py` | Mixed-item keyword extraction | VERIFIED | Contains `extract_keywords_for_items`; dispatches paper/website/GitHub repo and updates tags. |
| `backend/services/batch_service.py` | Batch embeddings and notes preview | VERIFIED | Contains `batch_index_embeddings` and `batch_notes_preview`. |
| `backend/routers/batch.py` | `/api/batch/*` routes | VERIFIED | Defines request validation and three endpoints. |
| `backend/app.py` | Batch router registration | VERIFIED | Imports `batch` and calls `app.include_router(batch.router)`. |
| `backend/tests/test_batch.py` | Batch endpoint/service tests | VERIFIED | Covers services, routes, validation, and non-leaky errors. |
| `frontend/src/hooks/useBatchProcessor.js` | Batch hook with concurrency/pause/resume/cancel/retry | VERIFIED | Substantive hook with parent-exposed state and managed batch support. |
| `frontend/src/hooks/useBatchProcessor.test.js` | Hook behavior tests | VERIFIED | Covers concurrency, pause/resume, errors, retry, cancel, and `runManaged`. |
| `frontend/src/components/ConfirmBulkModal.jsx` | Confirmation modal | UI VERIFIED | UI-only UAT observed count/skip/process/cost/concurrency controls for the four bulk operations. |
| `frontend/src/components/BulkProgressModal.jsx` | Progress modal | CODE VERIFIED / HUMAN_NEEDED | Per-item statuses, progress bar, closeable running state, controls, retry are implemented; running browser behavior not exercised under UI-only scope. |
| `frontend/src/services/api.js` | Batch API client | VERIFIED | Exports `batchApi.tags`, `batchApi.embeddings`, and `batchApi.notesPreview`. |
| `frontend/src/pages/Library.jsx` | Integrated Library bulk actions | UI PARTIAL / CODE VERIFIED | UI-only UAT verified selection, bulk action bar, and confirmation modals. Live operation execution was not started. |
| `.planning/phases/13-bulk-paper-processing/13-SECURITY.md` | Security gate artifact | VERIFIED | Exists with `status: passed` and `threats_open: 0`; security hardening controls are documented as closed. |
| `.planning/phases/13-bulk-paper-processing/13-UAT.md` | Browser UAT gate artifact | HUMAN_NEEDED | Exists and records UI-only UAT: 2 passed, 4 partial, 2 blocked. Full live operations remain human_needed. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `backend/routers/batch.py` | `keyword_extraction_service.extract_keywords_for_items` | import and endpoint call | WIRED | `/tags` endpoint calls `extract_keywords_for_items(data.item_ids, library_id=data.library_id)`. |
| `backend/routers/batch.py` | `batch_service.batch_index_embeddings`, `batch_notes_preview` | import and endpoint calls | WIRED | `/embeddings` awaits `batch_index_embeddings`; `/notes/preview` calls `batch_notes_preview`. |
| `backend/app.py` | `routers.batch` | FastAPI router registration | WIRED | `app.include_router(batch.router)` exists. |
| `frontend/src/services/api.js` | `/api/batch` backend endpoints | `apiFetch('/batch/...')` | WIRED | All three batch client methods exist and use expected payloads. |
| `frontend/src/pages/Library.jsx` | `useBatchProcessor` | import and hook call | WIRED | Imported and instantiated as `const batch = useBatchProcessor()`. |
| `frontend/src/pages/Library.jsx` | `ConfirmBulkModal` | import and JSX render | UI VERIFIED | UI-only UAT opened confirmation modals for notes, tags, PDFs, and embeddings. |
| `frontend/src/pages/Library.jsx` | `BulkProgressModal` | import and JSX render | WIRED | Modal receives `batch.statuses`, `batch.isRunning`, `batch.isPaused`, controls, retry handler, and `allowControls`; running modal not browser-tested in UI-only scope. |
| `frontend/src/pages/Library.jsx` | Per-operation APIs | handlers | WIRED | Notes use per-item note APIs; tags/embeddings use batch APIs; PDFs use `papersApi.fetchPdf`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `Library.jsx` | `items` / selected IDs | `papersApi.list`, `websitesApi.list`, `githubReposApi.list`, `searchApi.query` | Yes | FLOWING |
| `Library.jsx` | `bulkItems`, `bulkOperation`, `bulkSkipCount`, `bulkSkipIds` | `startBulkOperation()` and `computeSkipCount()` from actual selected rows and `batchApi.notesPreview()` | Yes | FLOWING |
| `ConfirmBulkModal.jsx` | `items`, `skipCount`, `concurrency` props | Passed from Library state after selection and skip computation | Yes | UI VERIFIED |
| `useBatchProcessor.js` | `statuses`, `isRunning`, `isPaused` | `run()`, `runManaged()`, `pause()`, `resume()`, `cancel()`, process function results/errors | Yes | CODE VERIFIED |
| `BulkProgressModal.jsx` | `items`, `statuses`, `isRunning`, `failedCount` props | Passed from Library and batch hook state | Yes | CODE VERIFIED |
| `batchApi` | endpoint responses | `apiFetch('/batch/tags'|'embeddings'|'notes/preview')` | Yes | FLOWING |
| `backend/routers/batch.py` | endpoint result payloads | service-layer calls | Yes | FLOWING |
| `batch_service.py` | notes skip data | Supabase `notes` table query for AI Notes folders | Yes | FLOWING |
| `keyword_extraction_service.py` | tag updates | OpenAI response parsed and applied through item services | Yes | FLOWING |

### Behavioral Spot-Checks and Gates

| Behavior/Gate | Command or Source | Result | Status |
|---|---|---|---|
| Backend suite | Current gate summary: `uv run pytest tests/ -q` | 94 passed, 2 FastAPI deprecation warnings | PASS |
| Frontend suite | Current gate summary: `npm exec --prefix ../frontend -- vitest --root /home/prannayag/personal/ResearchOS/frontend run` | 263 passed, existing React Router/Tailwind warnings | PASS |
| Schema drift gate | `gsd-sdk query verify.schema-drift 13` / current gate summary | `drift_detected: false`, `blocking: false` | PASS |
| Code review gate | `13-REVIEW.md` / current gate summary | Re-review status `passed`, 0 findings | PASS |
| Codebase drift gate | Current gate summary | Skipped with reason `no-structure-md`, non-blocking | SKIP |
| Security gate | `/home/prannayag/personal/ResearchOS/.planning/phases/13-bulk-paper-processing/13-SECURITY.md` | `status: passed`, `threats_open: 0` | PASS |
| Browser UAT gate | `/home/prannayag/personal/ResearchOS/.planning/phases/13-bulk-paper-processing/13-UAT.md` | UI-only: 2 passed, 4 partial, 2 blocked. Full operation execution not started by user choice. | HUMAN_NEEDED |

### Requirements Coverage

Phase 13 roadmap lists `BULK-01` through `BULK-09`, but `/home/prannayag/personal/ResearchOS/.planning/REQUIREMENTS.md` in this checkout only contains earlier v1.1 traceability entries and does not define BULK requirement descriptions. Coverage was therefore mapped from Phase 13 ROADMAP success criteria and plan frontmatter.

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| BULK-01 | 13-01, 13-03 | SATISFIED / HUMAN_NEEDED for live operation | Notes skip preview endpoint and Library notes process skip existing AI Notes; UI-only UAT observed notes skip calculation before Start. |
| BULK-02 | 13-01 | SATISFIED / HUMAN_NEEDED for live operation | Mixed item auto-tagging service and `/api/batch/tags`; UI-only UAT observed Auto-Tag confirmation. |
| BULK-03 | 13-01 | SATISFIED / HUMAN_NEEDED for live operation | `batch_index_embeddings` service and `/api/batch/embeddings`; UI-only UAT observed Generate Embeddings confirmation. |
| BULK-04 | 13-03 | SATISFIED / HUMAN_NEEDED for running progress | Library integration with unified progress modal; UI-only UAT verified selection and action entrypoints. |
| BULK-05 | 13-02 | SATISFIED | `ConfirmBulkModal` count/skip/cost/concurrency UI verified by UI-only UAT. |
| BULK-06 | 13-02 | SATISFIED / HUMAN_NEEDED for browser controls | `cancel()` logic and progress modal cancel control for per-item operations. |
| BULK-07 | 13-02 | SATISFIED / HUMAN_NEEDED for browser controls | pause/resume hook logic and progress modal controls for per-item operations. |
| BULK-08 | 13-02 | SATISFIED / HUMAN_NEEDED for live retry | Failed status tracking, `getFailedItems`, and retry handler. |
| BULK-09 | 13-02 | SATISFIED / HUMAN_NEEDED for browser running state | Closeable modal with parent-owned running batch state. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `frontend/src/components/ConfirmBulkModal.jsx` | 15 | `if (!open) return null` | Info | Normal React modal conditional rendering, not a stub. |
| `frontend/src/components/BulkProgressModal.jsx` | 33 | `if (!open) return null` | Info | Normal React modal conditional rendering, not a stub. |
| `frontend/src/pages/Library.jsx` | 1674, 1683 | `return null` for tags/embeddings process factory | Info | Intentional: aggregate server batch calls are handled by `handleConfirmBulk()` and `runManaged()`. |
| `frontend/src/pages/Library.jsx` | 1685 | default `return null` | Info | Defensive default branch, not user-visible stub. |
| Various `Library.jsx` lines | n/a | placeholder attributes | Info | Form input placeholder text unrelated to Phase 13 implementation. |

No blocker or warning anti-patterns were found in Phase 13 production files.

### Risks and Notes

1. **Full human UAT remains incomplete by user choice.** The browser UAT environment now has selectable rows and UI entrypoints, but no operation was started in UI-only mode. The remaining unverified behaviors are live progress, pause/resume/cancel, retry, aggregate tag/embedding execution, table refreshes, and persistence.
2. **Security gate is closed.** `/home/prannayag/personal/ResearchOS/.planning/phases/13-bulk-paper-processing/13-SECURITY.md` exists with `status: passed` and `threats_open: 0`.
3. **Aggregate tags/embeddings differ from literal pause/resume wording.** Tags and embeddings are single backend batch calls, so pause/resume/cancel controls are intentionally hidden for running aggregate operations. Notes and PDFs provide the per-item pause/resume/cancel behavior promised by the batch processor. UI-only UAT did not start operations to verify running modal controls.
4. **Potential library-scope UI concern.** The UI-only browser run observed active library "AI Dump" and rendered "Showing 262 of 262 items" while backend probes for `lib_default` returned fewer library-scoped items. Network evidence did include library-scoped requests after the active library resolved, so this may be stale pre-selection state or a scope/render issue. Investigate before treating library-scoped browser counts as authoritative.

### Human Verification Required

#### 1. Full browser end-to-end UAT for all four Library bulk operations against live ResearchOS data

**Test:** Start the correct ResearchOS backend and frontend so `http://localhost:5173/library` serves ResearchOS, connected to backend `http://localhost:8000`. Ensure there is an active library with at least 2 selectable library items. For full coverage, use mixed fixture data: some items with existing AI Notes and some without; some papers with stored PDFs and some without; enough items to observe per-item progress and controls. Then select multiple mixed items and run Generate Notes, Auto-Tag, Fetch PDFs, and Generate Embeddings.

**Expected:** Selecting rows exposes the bulk action bar with Generate Notes, Auto-Tag, Fetch PDFs, and Generate Embeddings. Each action opens confirmation with accurate counts/skips/cost/concurrency. After Start, progress modals show per-item statuses. Generate Notes and Fetch PDFs support pause/resume/cancel/retry where applicable. Auto-Tag and Generate Embeddings complete through their backend batch endpoints and do not show pause/cancel controls while running. Updated items are visible after refresh.

**Why human:** UI-only UAT verified the selection and confirmation UI without mutating data. Visual running-state behavior, real API side effects, modal close/background behavior, and mid-batch controls still require full live operation UAT.

### Gaps Summary

No automated implementation gaps were found. Phase 13's codebase implementation supports the promised bulk item processing behavior at the backend service/router layer, frontend API/hook/modal layer, and Library integration layer. The security gate is passed/closed. UI-only UAT now confirms the browser can load the correct app, select rows, show the bulk action bar, and open confirmation modals for all four operations. The remaining blocker is full live operation UAT: Start/Proceed must be clicked in a safe fixture/live dataset to validate progress, controls, retry, aggregate-operation behavior, table refreshes, and persisted side effects.

---

_Verified: 2026-05-07T00:00:00Z_
_Verifier: Claude (UI-only browser UAT + goal-backward verification refresh)_
