# Phase 13: Bulk Paper Processing - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Batch operations on library items (papers, websites, GitHub repos) triggered from the Library multi-select bulk action bar. Four operations: bulk AI note generation, bulk auto-tagging (keyword extraction), bulk PDF fetch, and bulk embedding generation. This phase does NOT add new AI capabilities — it orchestrates existing per-item endpoints into batch workflows with progress tracking, pause/resume, cancellation, and error handling.

</domain>

<decisions>
## Implementation Decisions

### Batch operations
- **All four operations:** bulk note generation, bulk auto-tagging, bulk PDF fetch, bulk embedding generation
- **All item types:** papers, websites, and GitHub repos (all three supported for notes and tagging; PDF fetch is papers-only; embeddings work on all)
- **Library/collection level tagging:** extend keyword extraction beyond project scope to work on any selection of items at the library level
- **Skip items with existing AI notes** — don't overwrite. Items that already have an "AI Notes" folder are skipped. User can force-regenerate individual items separately.

### Triggering & scope
- **Multi-select bulk action bar** — add "Generate Notes", "Auto-Tag", "Fetch PDFs", "Generate Embeddings" to the existing bulk action bar that appears when items are selected via checkboxes
- **Header checkbox selects visible page** — combined with filters (status, collection, search) for precise scoping. No "select all N items" banner needed.
- **Confirmation dialog before starting** — modal showing: item count, estimated cost, how many will be skipped (already have notes/tags/PDFs/embeddings). "12 items selected. Generate AI notes for 12 items? (~$0.24 estimated). 3 items already have notes and will be skipped."

### Progress & feedback
- **Status modal with per-item progress** — reuse the existing "Fetch PDFs" modal pattern: each item shows status (pending/processing/done/failed/skipped), overall progress bar at top. User can close modal and continue browsing — job runs in background.
- **Pause and resume** — user can pause mid-batch, review progress, then resume or cancel. Items already processed stay done, remaining items wait.
- **User-selectable concurrency** — a speed toggle in the confirmation dialog: "Careful (1 at a time)" vs "Fast (5 concurrent)". Default: careful.

### Error handling
- **Skip and continue on failure** — failed items get red "Failed" status with error reason in the progress modal. Batch continues with remaining items.
- **Retry Failed button** — when the batch finishes, modal shows summary with "Retry 3 failed items" button. One click re-runs only the failures.

### Claude's Discretion
- Backend batch endpoint design (single endpoint with operation type param, or separate endpoints per operation)
- Cost estimation logic (rough token count heuristic per item type)
- Exact concurrency implementation (Promise.allSettled with pool, or sequential with overlap)
- How pause/resume state is tracked (React state vs sessionStorage)
- Rate limiting to avoid hitting OpenAI rate limits during parallel processing

</decisions>

<specifics>
## Specific Ideas

- The existing "Fetch PDFs" bulk action modal is the exact UX pattern to follow — per-item status list, overall progress, closeable
- Confirmation dialog should feel like a "checkout" — you see what you're about to spend before committing
- Pause button should be prominent and responsive (not waiting for the current item to finish before pausing)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `note_service.generate_notes()` / `generate_notes_for_website()` / `generate_notes_for_github_repo()`: Per-item AI note generation, already works for all three item types
- `keyword_extraction_service.extract_keywords_for_project()`: Batch keyword extraction for project papers. Pattern can be extended to library-scoped selection.
- `POST /api/papers/{id}/pdf/fetch`: Per-item PDF fetch. Frontend already has bulk fetch with status modal in Library.jsx.
- `search_service.py` embedding generation: Happens lazily on search. Can be triggered explicitly per item.
- Library.jsx multi-select: Header checkbox, bulk action bar with Add to Collection / Export BibTeX / Fetch PDFs / Delete All already implemented.

### Established Patterns
- Bulk PDF fetch in Library.jsx: sequential fetch with per-item status modal (pending/fetching/done/failed/skipped/no URL). This is the template for all batch operations.
- BackgroundTasks in FastAPI: used for auto-download + auto-notes on paper import.
- `auto_note_enabled` flag on libraries: controls whether notes auto-generate on import.

### Integration Points
- Library.jsx bulk action bar: add new action buttons alongside existing ones
- Backend: new batch endpoint(s) or extend existing per-item endpoints with batch wrappers
- `keyword_extraction_service.py`: extend to accept arbitrary item IDs instead of project-scoped

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-bulk-paper-processing*
*Context gathered: 2026-03-22*
