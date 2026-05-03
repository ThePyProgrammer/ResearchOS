---
phase: 13-bulk-paper-processing
plan: "03"
subsystem: ui
tags: [react, bulk-actions, batch-processing, library]

# Dependency graph
requires:
  - phase: 13-bulk-paper-processing/13-01
    provides: backend batch endpoints (tags, embeddings, notes preview)
  - phase: 13-bulk-paper-processing/13-02
    provides: useBatchProcessor hook, ConfirmBulkModal, BulkProgressModal, batchApi
provides:
  - Four bulk operation buttons (Generate Notes, Auto-Tag, Fetch PDFs, Generate Embeddings) wired in Library.jsx bulk action bar
  - Confirmation dialog with item count, skip count, cost estimate, and concurrency toggle for each operation
  - Progress modal with per-item status, pause/resume/cancel, retry for notes/PDFs
  - Notes preview endpoint integration to detect existing AI Notes folders and show accurate skip count
  - Old FetchPDFs modal replaced with new unified bulk system
affects: [Library.jsx, bulk-paper-processing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getBulkProcessFn factory pattern: returns per-item async function for notes/pdfs, null for batch-API operations (tags/embeddings)"
    - "computeSkipCount async function: calls backend preview for notes, client-side logic for tags/pdfs, zero for embeddings"
    - "Batch API operations (tags/embeddings) use setStatuses manually since useBatchProcessor.run() is not used for single-API-call operations"

key-files:
  created: []
  modified:
    - frontend/src/pages/Library.jsx

key-decisions:
  - "Old FetchPDFs modal (showFetchModal/fetchStatuses) removed and replaced by the new BulkProgressModal system for consistency"
  - "Tags and embeddings use single batch API call with manual setStatuses rather than per-item concurrency pool — single endpoint call is more efficient and matches backend design"
  - "PDF skip detection is client-side (checks pdfUrl for /storage/v1/object/public/pdfs/) rather than requiring a backend preview call"
  - "Notes preview endpoint called only when 'notes' operation is initiated — not eagerly — to avoid unnecessary API calls on page load"
  - "Refresh triggered via setRefreshKey after tags batch completes (and notes batch completes via isRunning useEffect) to show updated tags/notes in table"
  - "generateForGitHubRepo (not generateForGithubRepo) — exact function name from api.js used in processFn"

patterns-established:
  - "startBulkOperation(op): entry point for all bulk actions — filters items, computes skip count, shows confirm modal"
  - "handleConfirmBulk: branches on operation type — single API call for tags/embeddings, batch.run() for notes/pdfs"
  - "handleCloseBulkProgress: hides modal without cancelling — job continues in background"

requirements-completed: [BULK-01, BULK-04]

# Metrics
duration: 25min
completed: 2026-03-22
---

# Phase 13 Plan 03: Bulk Operations UI Integration Summary

**Four bulk actions (Generate Notes, Auto-Tag, Fetch PDFs, Generate Embeddings) wired into Library.jsx bulk action bar via ConfirmBulkModal + BulkProgressModal + useBatchProcessor with notes skip detection via backend preview endpoint**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-22T14:48:06Z
- **Completed:** 2026-03-22T15:13:00Z
- **Tasks:** 1 of 2 (Task 2 is checkpoint:human-verify)
- **Files modified:** 1

## Accomplishments
- Wired all four bulk operations into Library.jsx with full confirm + progress flow
- Notes operation calls batchApi.notesPreview() to detect items with existing AI Notes and shows accurate skip count in confirmation dialog
- Notes processFn returns 'skipped' for items with existing AI Notes (uses bulkSkipIds from preview)
- Old FetchPDFs modal (100+ lines of custom modal code) replaced with the new unified BulkProgressModal system
- Tags and embeddings use efficient single batch API call with manual status tracking
- PDFs and notes use per-item concurrency pool via useBatchProcessor for pause/resume/cancel/retry
- Items list auto-refreshes after tags and notes batch operations complete

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire all four bulk operations into Library.jsx** - (feat commit — see git log)

**Plan metadata:** (docs commit — pending Task 2 checkpoint approval)

## Files Created/Modified
- `frontend/src/pages/Library.jsx` - Added bulk operation state, handlers, four buttons in bulk action bar, ConfirmBulkModal + BulkProgressModal modals; removed old FetchPDFs modal

## Decisions Made
- Old FetchPDFs modal removed and replaced by new BulkProgressModal system (consistent UX, less duplicate code)
- Tags/embeddings use manual batch.setStatuses() pattern instead of batch.run() since they make a single server call (not per-item)
- PDF skip detection is client-side (checks pdfUrl string) — no backend preview call needed since the check is trivial
- generateForGitHubRepo (camelCase 'H') is the correct function name in api.js (plan had it as generateForGithubRepo — corrected)

## Deviations from Plan

**1. [Rule 1 - Bug] Used generateForGitHubRepo instead of generateForGithubRepo**
- **Found during:** Task 1 (reading api.js to verify function names)
- **Issue:** Plan specified `notesApi.generateForGithubRepo` but api.js exports `notesApi.generateForGitHubRepo` (capital H in GitHub)
- **Fix:** Used the correct function name `generateForGitHubRepo` in the processFn
- **Files modified:** frontend/src/pages/Library.jsx
- **Verification:** Build passes with correct function reference
- **Committed in:** Task 1 commit

---

**Total deviations:** 1 auto-fixed (1 bug — wrong function name in plan spec)
**Impact on plan:** No scope creep. Fix was necessary for correct API calls to GitHub repo note generation.

## Issues Encountered
None beyond the function name discrepancy noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 2 (checkpoint:human-verify) requires user to verify the four bulk operations work end-to-end in the browser at http://localhost:5173/library
- After checkpoint approval, plan 13-03 is complete

## Self-Check

### Created/Modified Files Exist
- `frontend/src/pages/Library.jsx` — exists, modified with all four bulk operations

### Imports verified
- `useBatchProcessor` imported from `../hooks/useBatchProcessor`
- `ConfirmBulkModal` imported from `../components/ConfirmBulkModal`
- `BulkProgressModal` imported from `../components/BulkProgressModal`
- `batchApi` imported from `../services/api`

### Build verification
- `npx vite build` completed successfully with exit code 0

## Self-Check: PASSED

---
*Phase: 13-bulk-paper-processing*
*Completed: 2026-03-22*
