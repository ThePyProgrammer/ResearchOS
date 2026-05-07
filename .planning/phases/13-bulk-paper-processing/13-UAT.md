---
status: accepted
phase: 13-bulk-paper-processing
source: [13-03-SUMMARY.md, 13-01-PLAN.md, 13-02-PLAN.md]
started: 2026-03-29T12:00:00Z
updated: 2026-05-07T00:00:00Z
---

## Current Test

number: 8
name: UI-only browser UAT against live ResearchOS app
expected: |
  Browser UAT executed against the live ResearchOS target supplied for this session:
  - Frontend: http://localhost:5173/library
  - Backend: http://localhost:8000
  User-selected scope is UI-only: verify cold start, multi-select, bulk action bar, and confirmation modal contents without clicking Start/Proceed or mutating data.
awaiting: accepted complete by user with UI-only scope

## Tests

### 1. Cold Start Smoke Test
expected: Kill and restart both servers. Backend boots without errors (batch router registered). Frontend loads the ResearchOS Library page successfully.
result: [passed]
notes: |
  2026-05-07 UI-only rerun used the session-corrected frontend URL http://localhost:5173/library with backend http://localhost:8000. ResearchOS loaded, the Library page rendered, the active library eventually resolved to "AI Dump", and there were visible rows/selectable checkboxes.

  Evidence:
  - uat-evidence/2026-05-07-ui-only-01-library-loaded.png
  - uat-evidence/2026-05-07-ui-only-result.json

  Earlier 2026-05-06 evidence against http://localhost:5174/library is retained for history, but 5173 is the active target for this session.

### 2. Bulk Action Bar Appears on Multi-Select
expected: In the Library page, click the header checkbox (or select 2+ items via row checkboxes). A bulk action bar appears with buttons: Generate Notes, Auto-Tag, Fetch PDFs, Generate Embeddings (in addition to existing Add to Collection, Export BibTeX, Delete All).
result: [passed]
notes: |
  UI-only browser UAT selected 3 row checkboxes. The page showed "3 items selected" and displayed the bulk action bar.

  Observed bulk actions:
  - Add to Collection...
  - Set Status
  - Generate Notes
  - Auto-Tag
  - Fetch PDFs
  - Generate Embeddings
  - Export BibTeX
  - Delete All

  Evidence:
  - uat-evidence/2026-05-07-ui-only-bulk-bar.png
  - uat-evidence/2026-05-07-ui-only-result.json

### 3. Auto-Tag Bulk Operation
expected: Select 2+ items, click "Auto-Tag". A confirmation modal shows the item count and a "Proceed" button. After confirming, a progress modal appears. Tags are generated for the selected items. After completion, the table refreshes and items show updated tags.
result: [partial]
notes: |
  UI-only browser UAT opened the Auto-Tag confirmation modal and cancelled without starting the operation.

  Verified in UI-only scope:
  - Modal title: "Auto-Tag Items"
  - 3 selected items
  - 1 item already has tags
  - 2 items will be processed
  - Estimated OpenAI cost shown
  - Processing speed controls shown: Careful (1 at a time), Fast (5 concurrent)
  - Cancel and Start controls visible

  Not verified by user choice:
  - No Start/Proceed click was performed.
  - No OpenAI/API tag generation was started.
  - Progress modal behavior, aggregate backend completion, table refresh, and persisted tags remain unverified.

  Evidence:
  - uat-evidence/2026-05-07-ui-only-auto-tag-modal.png
  - uat-evidence/2026-05-07-ui-only-result.json

### 4. Generate Notes Bulk Operation with Skip Detection
expected: Select items where at least one already has AI Notes. Click "Generate Notes". The confirmation modal shows total items AND how many will be skipped (those with existing AI Notes). After confirming, skipped items show "skipped" status in the progress modal. Items without existing AI Notes get notes generated.
result: [partial]
notes: |
  UI-only browser UAT opened the Generate Notes confirmation modal and cancelled without starting note generation. Opening the modal triggered the allowed preview-only request to /api/batch/notes/preview for skip calculation.

  Verified in UI-only scope:
  - Modal title: "Generate AI Notes"
  - 3 selected items
  - 1 item will be skipped because it already has notes
  - 2 items will be processed
  - Estimated OpenAI cost shown
  - Processing speed controls shown: Careful (1 at a time), Fast (5 concurrent)
  - Cancel and Start controls visible

  Not verified by user choice:
  - No Start/Proceed click was performed.
  - No note generation was started.
  - Progress modal behavior, skipped row status, pause/resume/cancel, retry, and persisted AI Notes remain unverified.

  Evidence:
  - uat-evidence/2026-05-07-ui-only-generate-notes-modal.png
  - uat-evidence/2026-05-07-ui-only-result.json

### 5. Fetch PDFs Bulk Operation
expected: Select items including some that already have PDFs stored in Supabase and some without. Click "Fetch PDFs". Confirmation modal shows count. Items already with stored PDFs are skipped. Items with external PDF URLs get fetched. Progress modal shows per-item status (pending/fetching/done/failed/skipped).
result: [partial]
notes: |
  UI-only browser UAT opened the Fetch PDFs confirmation modal and cancelled without starting PDF fetches.

  Verified in UI-only scope:
  - Modal title: "Fetch PDFs"
  - 3 selected items
  - 3 items will be skipped because they already have PDFs
  - 0 items will be processed
  - Processing speed controls shown: Careful (1 at a time), Fast (5 concurrent)
  - Cancel and Start controls visible

  Not verified by user choice:
  - No Start/Proceed click was performed.
  - No PDF fetch request was started.
  - Mixed no-PDF processing, progress modal per-item status, pause/resume/cancel, retry, and stored-PDF side effects remain unverified.

  Evidence:
  - uat-evidence/2026-05-07-ui-only-fetch-pdfs-modal.png
  - uat-evidence/2026-05-07-ui-only-result.json

### 6. Generate Embeddings Bulk Operation
expected: Select 2+ items, click "Generate Embeddings". Confirmation modal appears. After confirming, the batch processes and progress modal shows completion.
result: [partial]
notes: |
  UI-only browser UAT opened the Generate Embeddings confirmation modal and cancelled without starting embedding generation.

  Verified in UI-only scope:
  - Modal title: "Generate Embeddings"
  - 3 selected items
  - 3 items will be processed
  - Estimated OpenAI cost shown
  - Processing speed controls shown: Careful (1 at a time), Fast (5 concurrent)
  - Cancel and Start controls visible

  Not verified by user choice:
  - No Start/Proceed click was performed.
  - No embedding generation/indexing request was started.
  - Aggregate backend completion, progress modal running state, and persisted index/vector side effects remain unverified.

  Evidence:
  - uat-evidence/2026-05-07-ui-only-generate-embeddings-modal.png
  - uat-evidence/2026-05-07-ui-only-result.json

### 7. Pause and Resume During Batch
expected: Start a bulk operation on several items (e.g., Generate Notes on 3+ items). While processing, click "Pause". New items stop starting (in-flight items finish). Click "Resume". Processing continues from where it left off.
result: [blocked]
notes: |
  Blocked by the user-selected UI-only UAT scope. No operation was started, so no running progress modal existed to verify Pause/Resume controls or behavior.

  Automated implementation evidence still exists in hook/component tests and verification, but browser behavior remains human_needed.

### 8. Close Progress Modal While Running
expected: Start a bulk operation. While it's still running, close the progress modal (X button or close). The batch continues processing in the background. Reopening the modal or waiting shows the operation completed.
result: [blocked]
notes: |
  Blocked by the user-selected UI-only UAT scope. No operation was started, so close-while-running behavior could not be exercised in the browser.

  Automated implementation evidence still exists in hook/component tests and verification, but browser behavior remains human_needed.

## Summary

total: 8
passed: 2
partial: 4
failed: 0
issues: 1
pending: 0
skipped: 0
blocked: 2

## Gaps

- UI-only browser UAT passed for cold start, row selection, the bulk action bar, and confirmation modal content for all four Phase 13 operations.
- Full live operation UAT remains human_needed because the user explicitly selected UI-only mode. No Start/Proceed buttons were clicked and no generation, fetch, indexing, or mutating bulk operation was executed.
- Progress modal running behavior remains unverified in the browser: per-item status transitions, pause/resume/cancel, retry, aggregate tags/embeddings no-control behavior, table refreshes, and persisted backend side effects all still need live operation UAT.
- A possible library-scope race or stale render was observed: after active library resolved to "AI Dump", the page showed "Showing 262 of 262 items" while backend library-scoped probes showed fewer items for lib_default. The UI did make filtered requests with library_id=lib_default, but the rendered count appeared all-library sized. This should be investigated before relying on library-scoped browser UAT for data-specific assertions.
- Correct active frontend target for this session is http://localhost:5173/library, not the earlier 5174 target.
