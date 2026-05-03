---
status: testing
phase: 13-bulk-paper-processing
source: [13-03-SUMMARY.md, 13-01-PLAN.md, 13-02-PLAN.md]
started: 2026-03-29T12:00:00Z
updated: 2026-03-29T12:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running backend/frontend servers. Restart both:
  - `cd backend && uv run uvicorn app:app --reload --port 8000`
  - `cd frontend && npm run dev`
  Server boots without errors. Navigate to http://localhost:5173/library — page loads with your library items.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill and restart both servers. Backend boots without errors (batch router registered). Frontend loads http://localhost:5173/library successfully.
result: [pending]

### 2. Bulk Action Bar Appears on Multi-Select
expected: In the Library page, click the header checkbox (or select 2+ items via row checkboxes). A bulk action bar appears with buttons: Generate Notes, Auto-Tag, Fetch PDFs, Generate Embeddings (in addition to existing Add to Collection, Export BibTeX, Delete All).
result: [pending]

### 3. Auto-Tag Bulk Operation
expected: Select 2+ items, click "Auto-Tag". A confirmation modal shows the item count and a "Proceed" button. After confirming, a progress modal appears. Tags are generated for the selected items. After completion, the table refreshes and items show updated tags.
result: [pending]

### 4. Generate Notes Bulk Operation with Skip Detection
expected: Select items where at least one already has AI Notes. Click "Generate Notes". The confirmation modal shows total items AND how many will be skipped (those with existing AI Notes). After confirming, skipped items show "skipped" status in the progress modal. Items without existing AI Notes get notes generated.
result: [pending]

### 5. Fetch PDFs Bulk Operation
expected: Select items including some that already have PDFs stored in Supabase and some without. Click "Fetch PDFs". Confirmation modal shows count. Items already with stored PDFs are skipped. Items with external PDF URLs get fetched. Progress modal shows per-item status (pending/fetching/done/failed/skipped).
result: [pending]

### 6. Generate Embeddings Bulk Operation
expected: Select 2+ items, click "Generate Embeddings". Confirmation modal appears. After confirming, the batch processes and progress modal shows completion.
result: [pending]

### 7. Pause and Resume During Batch
expected: Start a bulk operation on several items (e.g., Generate Notes on 3+ items). While processing, click "Pause". New items stop starting (in-flight items finish). Click "Resume". Processing continues from where it left off.
result: [pending]

### 8. Close Progress Modal While Running
expected: Start a bulk operation. While it's still running, close the progress modal (X button or close). The batch continues processing in the background. Reopening the modal or waiting shows the operation completed.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0

## Gaps

[none yet]
