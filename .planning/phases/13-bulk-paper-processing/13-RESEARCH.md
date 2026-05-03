# Phase 13: Bulk Paper Processing - Research

**Researched:** 2026-03-22
**Domain:** Batch operations orchestration, concurrency control, React progress modals
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **All four operations:** bulk note generation, bulk auto-tagging, bulk PDF fetch, bulk embedding generation
- **All item types:** papers, websites, and GitHub repos (notes and tagging on all three; PDF fetch is papers-only; embeddings work on all)
- **Library/collection level tagging:** extend keyword extraction beyond project scope to work on any selection of items at the library level
- **Skip items with existing AI notes** — don't overwrite; items with an "AI Notes" folder are skipped; user can force-regenerate individual items separately
- **Multi-select bulk action bar** — add "Generate Notes", "Auto-Tag", "Fetch PDFs", "Generate Embeddings" to the existing bulk action bar in Library.jsx
- **Header checkbox selects visible page** — combined with filters for scoping; no "select all N items" banner needed
- **Confirmation dialog before starting** — modal showing item count, estimated cost, and skip count
- **Status modal with per-item progress** — reuse existing "Fetch PDFs" modal pattern; each item shows pending/processing/done/failed/skipped; modal is closeable, job runs in background
- **Pause and resume** — user can pause mid-batch; items already processed stay done; remaining items wait
- **User-selectable concurrency** — "Careful (1 at a time)" vs "Fast (5 concurrent)" toggle in confirmation dialog; default: careful
- **Skip and continue on failure** — failed items get red "Failed" status with error reason; batch continues
- **Retry Failed button** — when batch finishes, shows summary with "Retry N failed items" button

### Claude's Discretion
- Backend batch endpoint design (single endpoint with operation type param, or separate endpoints per operation)
- Cost estimation logic (rough token count heuristic per item type)
- Exact concurrency implementation (Promise.allSettled with pool, or sequential with overlap)
- How pause/resume state is tracked (React state vs sessionStorage)
- Rate limiting to avoid hitting OpenAI rate limits during parallel processing

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

Derived from CONTEXT.md decisions (no formal REQ-XX IDs assigned yet):

| ID | Description | Research Support |
|----|-------------|-----------------|
| BULK-01 | Add "Generate Notes" to bulk action bar for papers, websites, GitHub repos | note_service.generate_notes() / generate_notes_for_website() / generate_notes_for_github_repo() already exist |
| BULK-02 | Add "Auto-Tag" to bulk action bar for all item types | New extract_keywords_for_items() service function needed; extend keyword_extraction_service.py |
| BULK-03 | Add "Generate Embeddings" to bulk action bar for all item types | index_paper() / index_website() / index_github_repo() already exist in search_service.py |
| BULK-04 | Add "Fetch PDFs" to bulk action bar (papers-only, already exists — enhance with concurrency/pause) | handleBulkFetchPdfs() already implemented; needs concurrency + pause/resume added |
| BULK-05 | Confirmation dialog with item count, skip count, cost estimate | New ConfirmBulkModal component; skip detection logic per operation |
| BULK-06 | Per-item progress modal (WindowModal-based) with overall progress bar, closeable | Extend existing FetchPDFs modal pattern into reusable BulkProgressModal |
| BULK-07 | Pause/resume mid-batch | isPaused React state; processing loop checks before each item |
| BULK-08 | User-selectable concurrency (1 or 5 concurrent) | Promise pool implementation; concurrency param drives loop |
| BULK-09 | Retry failed items button | Failed items tracked by ID; re-run only failures on click |
| BULK-10 | Backend batch endpoints for notes, tagging, and embeddings | New POST /api/batch/notes, /api/batch/tags, /api/batch/embeddings endpoints |
</phase_requirements>

---

## Summary

Phase 13 is a pure orchestration phase — it wires existing per-item capabilities (note generation, keyword extraction, embedding indexing, PDF fetch) into a user-driven batch workflow with fine-grained progress feedback. No new AI capabilities need to be built; the implementation work is in:

1. **Frontend**: A reusable batch progress modal (generalizing the existing FetchPDFs modal), a confirmation dialog, concurrency-controlled processing loops with pause/resume, and four new bulk action bar buttons.
2. **Backend**: A new `batch_service.py` (or thin per-operation batch endpoints) that route by operation type and item type to existing service functions. The keyword extraction service needs to be extended from project-scoped to accept arbitrary item ID lists.

The concurrency challenge is real: 5 parallel OpenAI calls for note generation will consume ~5-10 seconds of latency per round-trip but risk rate limits at scale. The "Careful (1 at a time)" default avoids this and is the right choice for a research tool where the user can walk away during a batch.

**Primary recommendation:** Keep all batch processing purely client-side orchestrated (frontend calls per-item endpoints in sequence/pool, never a server-side batch job) to avoid backend complexity and to enable real-time per-item status updates without polling.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React (useState, useRef, useCallback) | 18 (already in project) | Batch state management, pause/resume | All existing components use React hooks |
| FastAPI BackgroundTasks | Already in project | Auto-note generation on import — same pattern applies | Avoid blocking HTTP responses on long operations |
| Python asyncio / FastAPI async | Already in project | Sequential or pooled async calls in batch endpoints | search_service.py uses async for embedding |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| WindowModal (project component) | — | Progress modal shell | Exact component used by FetchPDFs modal; reuse directly |
| openai (Python) | Already in project | Note generation + tagging + embeddings | All three AI operations use it |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side sequential loop | Server-side batch job with polling | Server-side adds complexity (job queue, polling endpoint, state persistence) with no user benefit in a single-user app |
| Client-side loop | WebSocket / SSE streaming | Over-engineered; simple sequential fetch updates React state naturally |
| sessionStorage for pause state | React state (useState) | sessionStorage persists across page refresh; React state is simpler and correct since closing/refreshing naturally resets — user expectation |

---

## Architecture Patterns

### Recommended Project Structure

New files:
```
frontend/src/
├── components/
│   └── BulkProgressModal.jsx     # Reusable batch progress modal (generalizes FetchPDFs modal)
└── pages/
    └── Library.jsx               # Add 4 buttons + confirm modal + batch handlers

backend/
├── services/
│   └── batch_service.py          # Route per-operation per-item calls; extend keyword extraction
└── routers/
    └── batch.py                  # POST /api/batch/{operation} endpoint
```

### Pattern 1: Client-Side Concurrency Pool

**What:** Process N items at a time using a concurrency-limited async loop.
**When to use:** When you need real-time per-item status updates and the user controls pacing.

```javascript
// Source: standard JavaScript concurrency pool pattern
async function runWithConcurrency(items, concurrency, processFn, isPausedRef, setStatuses) {
  const queue = [...items]
  const inFlight = new Set()

  const processNext = async () => {
    while (queue.length > 0) {
      // Wait while paused — check every 200ms
      while (isPausedRef.current) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      const item = queue.shift()
      if (!item) break
      inFlight.add(item.id)
      setStatuses(prev => ({ ...prev, [item.id]: 'processing' }))
      try {
        await processFn(item)
        setStatuses(prev => ({ ...prev, [item.id]: 'done' }))
      } catch (err) {
        setStatuses(prev => ({ ...prev, [item.id]: err.message || 'Failed' }))
      } finally {
        inFlight.delete(item.id)
      }
    }
  }

  // Spawn `concurrency` workers
  await Promise.all(Array.from({ length: concurrency }, processNext))
}
```

This pattern — a shared queue consumed by N workers — is the correct concurrency pool. `Promise.all` over N `processNext` calls each drain from the same queue.

### Pattern 2: Skip Detection Before Batch Start

**What:** Check which items already have AI notes / tags / embeddings to populate the confirmation dialog skip count.
**When to use:** Before showing the confirmation modal.

```javascript
// For "Generate Notes": check if item has an "AI Notes" folder
// Backend check: GET /api/{papers|websites|github-repos}/{id}/notes
// Look for any note with name === "AI Notes" and type === "folder"

async function countSkippable(selectedItems, operation) {
  // For notes: items that already have "AI Notes" folder
  // For tags: items that already have tags[]
  // For embeddings: no pre-check needed (index_item skips if already cached)
  // For PDF fetch: items with pdfUrl containing '/storage/v1/object/public/pdfs/'
}
```

**Important:** For notes, the skip check can be done client-side if the Library page already has item data with `tags` populated. The "AI Notes" folder check requires either fetching notes per item (expensive) or a cheaper backend count endpoint. **Recommended:** Use tags presence client-side for tagging skip count; for notes, use a backend `POST /api/batch/notes/preview` that checks the DB efficiently.

### Pattern 3: Pause/Resume with useRef

**What:** Pause state must be readable inside an async loop without stale closure issues.
**When to use:** Any async loop that needs to check current state.

```javascript
const isPausedRef = useRef(false)
const [isPaused, setIsPaused] = useState(false)

const handlePause = () => {
  isPausedRef.current = true
  setIsPaused(true)
}
const handleResume = () => {
  isPausedRef.current = false
  setIsPaused(false)
}
// Inside the processing loop: while (isPausedRef.current) { await sleep(200) }
```

**Why useRef:** useState setter updates are async — a closure captures the value at the time of creation. `useRef.current` is always the live value. This is the exact pattern used in Phase 02 (`useCallback` with `useRef` for stable references in event listeners).

### Pattern 4: Backend Batch Endpoint Design

**Recommended:** Single parameterized endpoint:

```
POST /api/batch/notes
Body: { "item_ids": ["p_abc", "w_def", "gh_ghi"], "library_id": "lib_xyz" }
Response: { "results": [{ "item_id": "p_abc", "status": "ok", "note_count": 5 }, ...] }

POST /api/batch/tags
Body: { "item_ids": [...], "library_id": "lib_xyz" }

POST /api/batch/embeddings
Body: { "item_ids": [...] }
```

**Why single batch endpoints instead of frontend calling per-item:** For notes and embeddings, the per-item endpoints already exist and work. The frontend should call per-item endpoints in a loop (the established pattern, same as FetchPDFs). A batch endpoint is only needed for **tagging** because the current `extract_keywords_for_project()` takes a project_id and must be refactored to accept `item_ids`. For notes and embeddings, keep the existing per-item endpoints.

**Decision:** Use existing per-item endpoints for notes (`/api/papers/{id}/notes/generate`) and embeddings (via search_service) from the frontend loop. Add one new batch tagging endpoint: `POST /api/batch/tags` that calls a new `extract_keywords_for_items()` service function.

### Pattern 5: Cost Estimation Heuristic

```javascript
// Source: project codebase patterns — gpt-4o-mini usage in note_service and keyword_extraction
const COST_PER_ITEM = {
  notes: 0.02,      // ~8K input tokens (metadata + abstract + PDF text truncated to 12K chars) + 4K output
  tags: 0.003,      // batched — cost spreads across items; ~0.003 per item
  embeddings: 0.001 // text-embedding-3-small: $0.02/1M tokens; ~500 tokens per item
}
// Shown as: "~$X.XX estimated" in confirmation dialog — round up, mark as estimate
```

### Anti-Patterns to Avoid

- **Fire-and-forget loop without yield:** A `for...of` loop calling `await api.xxx()` blocks the React event loop between items — user sees frozen UI. Use the concurrency pool pattern even for concurrency=1.
- **useState for isPaused inside async closure:** Will read stale value. Must use `useRef` (see Pattern 3).
- **Relying on server-side job state for progress:** This codebase has no job queue infrastructure. All progress state lives in React state. Don't introduce polling.
- **Batch-calling OpenAI note generation in parallel >5:** OpenAI rate limits for `gpt-4o-mini` are generous but note generation sends ~15K tokens per paper. 5 concurrent calls = 75K tokens in-flight. Monitor for 429 errors; default concurrency=1 is correct.
- **Calling `extract_keywords_for_project()` for library-level tagging:** This function looks up project-linked papers only. The new `extract_keywords_for_items()` must accept a flat list of paper/website objects directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress modal shell | Custom modal component | WindowModal (existing) | Already handles minimize, backdrop, disableClose, bodyClassName scroll |
| Per-item note generation | Custom LLM call | note_service.generate_notes() / generate_notes_for_website() / generate_notes_for_github_repo() | Already handles PDF text extraction, multi-file tree, AI Notes folder deletion, OpenAI JSON mode |
| Per-item embedding | Custom embedding call | search_service.index_paper() / index_website() / index_github_repo() | Already handles caching, skip if present, file persistence |
| Keyword extraction | New LLM prompt | keyword_extraction_service.py (extend) | System prompt, JSON parsing, tag normalization already implemented |
| Concurrency pool | Custom queue | Standard JS pattern (see Pattern 1) | No library needed; 10 lines of code |

**Key insight:** This phase is almost entirely wiring. Every AI capability already exists. The only new backend code needed is: (1) extend keyword extraction to accept item_ids instead of project_id, and (2) expose an endpoint for it. All note generation and embedding calls go through existing endpoints.

---

## Common Pitfalls

### Pitfall 1: Stale Closure on isPaused
**What goes wrong:** Async loop reads `isPaused` state as `false` even after user clicks Pause.
**Why it happens:** JavaScript closures capture the value of state at function creation time. `useState` hooks don't update the captured reference.
**How to avoid:** Use `useRef` for all values that must be readable inside async loops. Keep `useState` only for rendering.
**Warning signs:** Pause button appears to work (UI updates) but batch continues processing items.

### Pitfall 2: Keyword Extraction on Non-Paper Items
**What goes wrong:** `extract_keywords_for_project()` only processes `paper_id` links, silently skipping websites and GitHub repos.
**Why it happens:** The existing service filters `if link.paper_id is None: continue`.
**How to avoid:** New `extract_keywords_for_items(item_ids, library_id)` function must handle all three item types. Websites and GitHub repos have `title` + `description`/`abstract` suitable for keyword extraction. The OpenAI prompt already accepts generic `{id, title, abstract}` objects — just pass website descriptions as abstract.
**Warning signs:** Auto-tag action shows 0 updated for selections containing only websites.

### Pitfall 3: Modal Close During Active Batch
**What goes wrong:** User closes modal, batch continues but there's no way to see progress again.
**Why it happens:** `showModal` state controls visibility; closing it destroys the progress state.
**How to avoid:** Keep `batchStatuses` state in the Library component (not inside the modal), and re-mount the modal by reading the same state. Closing the modal hides it but doesn't cancel the batch — this is the exact existing behavior of the FetchPDFs modal (`disableClose` when in progress).
**Warning signs:** Progress is lost when modal is minimized.

### Pitfall 4: Notes Skip Detection Requires API Call
**What goes wrong:** Showing accurate "3 items will be skipped" in the confirmation dialog requires knowing which items already have AI Notes folders. But Library.jsx only stores item metadata (title, authors, tags, etc.) — not note data.
**Why it happens:** Notes are loaded lazily per item; Library table doesn't fetch notes for all items.
**How to avoid:** For the confirmation dialog, use a lightweight proxy: items that already have `tags` are skipped for tagging (client-side). For notes, use a backend preview endpoint `POST /api/batch/notes/preview` that accepts item_ids and returns per-item `has_ai_notes: bool`. This makes skip count accurate without loading all notes client-side.
**Alternative (simpler):** Show estimated skip count as "may skip items with existing AI notes" without an exact count. Simplest implementation, acceptable UX.

### Pitfall 5: OpenAI 429 Rate Limit at Concurrency=5
**What goes wrong:** 5 concurrent note-generation calls each sending 15K tokens hit OpenAI rate limits, causing failures that the user then has to retry.
**Why it happens:** OpenAI `gpt-4o-mini` has token-per-minute limits. 5 concurrent calls can saturate the limit for large papers.
**How to avoid:** Default concurrency to 1 ("Careful"). Add exponential backoff on 429s before marking item as failed. Detect 429 errors specifically and show "Rate limited — retrying" status.
**Warning signs:** Multiple simultaneous failures with "rate limit" in the error message.

### Pitfall 6: Embedding Already Exists — Silent Skip
**What goes wrong:** User clicks "Generate Embeddings" for 50 items, confirmation shows "~$0.05 estimated cost", but only 5 items actually get embedded (45 already cached). Cost estimate is wrong.
**Why it happens:** `_index_item()` checks `if key in embeddings: return` before calling the API — no feedback.
**How to avoid:** In the confirmation dialog, note: "Existing embeddings will be skipped (exact count may vary)". Track `'skipped'` status for items where the backend returns quickly (< 100ms), which indicates a cache hit.
**Alternative:** Add `force=False` param to `_index_item()` and expose it; set to True for explicit bulk regeneration. But this is over-engineering for v1 — the skip behavior is correct.

---

## Code Examples

Verified patterns from existing codebase:

### Existing FetchPDFs Modal (Template to Follow)
```javascript
// Source: Library.jsx lines 1590-1618 and 2376-2465
// This is the exact pattern to generalize into BulkProgressModal

const handleBulkFetchPdfs = async () => {
  const selected = items.filter(i => selectedIds.has(i.id) && i.itemType !== 'website')
  const initial = {}
  for (const item of selected) {
    initial[item.id] = item.pdfUrl?.includes('/storage/') ? 'skipped' : 'pending'
  }
  setFetchStatuses(initial)
  setShowFetchModal(true)
  for (const item of selected.filter(i => initial[i.id] === 'pending')) {
    setFetchStatuses(prev => ({ ...prev, [item.id]: 'fetching' }))
    try {
      const updated = await papersApi.fetchPdf(item.id)
      // update item in list...
      setFetchStatuses(prev => ({ ...prev, [item.id]: 'done' }))
    } catch (err) {
      setFetchStatuses(prev => ({ ...prev, [item.id]: err.message || 'Failed' }))
    }
  }
}
```

### Extending Keyword Extraction to Accept Item IDs

```python
# Source: pattern from keyword_extraction_service.py — new function to add
def extract_keywords_for_items(
    item_ids: list[str],
    library_id: Optional[str] = None,
) -> dict:
    """Extract keyword tags for a specific set of items by ID.

    Accepts paper IDs (p_*), website IDs (w_*), and GitHub repo IDs (gh_*).
    Skips items that already have tags unless force=True.
    Returns {"updated": N, "skipped": N, "total": N}.
    """
    from services.paper_service import get_paper
    from services.website_service import get_website
    from services.github_repo_service import get_github_repo

    candidates = []
    for item_id in item_ids:
        if item_id.startswith("w_"):
            item = get_website(item_id)
            if item and not item.tags and (item.description or item.title):
                candidates.append({
                    "id": item.id,
                    "title": item.title,
                    "abstract": item.description or "",
                    "_type": "website",
                })
        elif item_id.startswith("gh_"):
            item = get_github_repo(item_id)
            if item and not item.tags and (item.abstract or item.description):
                candidates.append({
                    "id": item.id,
                    "title": item.title,
                    "abstract": item.abstract or item.description or "",
                    "_type": "github_repo",
                })
        else:
            item = get_paper(item_id)
            if item and not item.tags and item.abstract:
                candidates.append({
                    "id": item.id,
                    "title": item.title,
                    "abstract": item.abstract,
                    "_type": "paper",
                })
    # ... same OpenAI batched call as existing function
```

### Backend Batch Tagging Endpoint

```python
# Source: routers/notes.py structure — new routers/batch.py

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/batch", tags=["batch"])

class BatchTagRequest(BaseModel):
    item_ids: list[str]
    library_id: Optional[str] = None

@router.post("/tags")
async def batch_tag_items(data: BatchTagRequest):
    """Extract and apply keyword tags to a list of items by ID."""
    from services.keyword_extraction_service import extract_keywords_for_items
    try:
        result = extract_keywords_for_items(data.item_ids, library_id=data.library_id)
    except Exception as exc:
        logger.exception("Batch tagging failed")
        raise HTTPException(status_code=500, detail=f"Batch tagging failed: {exc}") from exc
    return JSONResponse(result)
```

### Concurrency Pool with Pause (Full Implementation)

```javascript
// Source: standard JavaScript pattern — no library needed
function useBatchProcessor() {
  const isPausedRef = useRef(false)
  const [isPaused, setIsPaused] = useState(false)
  const [statuses, setStatuses] = useState({})
  const [isRunning, setIsRunning] = useState(false)

  const pause = () => { isPausedRef.current = true; setIsPaused(true) }
  const resume = () => { isPausedRef.current = false; setIsPaused(false) }

  const run = async (items, concurrency, processFn) => {
    setIsRunning(true)
    const queue = [...items]

    const worker = async () => {
      while (queue.length > 0) {
        while (isPausedRef.current) {
          await new Promise(r => setTimeout(r, 200))
        }
        const item = queue.shift()
        if (!item) break
        setStatuses(prev => ({ ...prev, [item.id]: 'processing' }))
        try {
          await processFn(item)
          setStatuses(prev => ({ ...prev, [item.id]: 'done' }))
        } catch (err) {
          setStatuses(prev => ({ ...prev, [item.id]: err.message || 'Failed' }))
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker))
    setIsRunning(false)
  }

  return { run, pause, resume, isPaused, statuses, isRunning }
}
```

### Embedding Generation Per Item (Frontend Calls)

```javascript
// Source: search_service.py — index_paper/index_website/index_github_repo exist
// These are internal functions, not yet exposed as HTTP endpoints.
// Need a new batch endpoint or expose per-item trigger.

// Recommended: POST /api/batch/embeddings with { item_ids: [...] }
// Backend calls _index_item() for each, returning { indexed: N, skipped: N }

// Alternative (simpler): Call existing semantic search with limit=0 to trigger indexing
// But this is a side-effect hack — don't do this.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sequential `for...of await` | Concurrency pool pattern | — | Enables "Fast (5 concurrent)" mode without blocking UI |
| Per-item status in loop-local var | React state map `{id: status}` | — | Enables live UI updates and "Retry Failed" tracking |
| Project-scoped keyword extraction | Item-ID-scoped keyword extraction | This phase | Library-level tagging without project association |

**Established in this codebase:**
- `WindowModal` with `disableClose` prop: correct for in-progress operations
- `BackgroundTasks` in FastAPI for fire-and-forget operations: works for per-item operations when response is fast
- `useRef` over `useState` for values read in async closures: see Phase 02-research-questions-literature decisions

---

## Open Questions

1. **Embedding endpoint exposure**
   - What we know: `search_service.index_paper/index_website/index_github_repo()` exist but are not exposed via HTTP
   - What's unclear: Should we expose a per-item endpoint or a batch endpoint?
   - Recommendation: Add `POST /api/batch/embeddings` that accepts item_ids and calls `_index_item()` for each. This is one endpoint instead of three. No per-item endpoint needed since the frontend batches everything.

2. **Notes skip detection — exact vs. approximate**
   - What we know: Library.jsx does not load note data for all items in the table
   - What's unclear: Whether to add a `POST /api/batch/notes/preview` endpoint or show an approximate skip count
   - Recommendation: Show approximate — "Items with existing AI Notes will be skipped" without exact count. Add the preview endpoint in a future iteration if users want it. The confirmation dialog "checkout" experience is good enough with approximate info.

3. **Tagging websites and GitHub repos via batch**
   - What we know: `keyword_extraction_service.py` only handles papers. Websites have `description` fields, GitHub repos have `abstract`/`description`.
   - What's unclear: Whether to treat website/repo descriptions as equivalent to paper abstracts for tagging quality
   - Recommendation: Yes — the prompt asks for "broad category tags based on title and abstract"; description text from websites/repos works equivalently. Quality may be slightly lower for generic websites but is acceptable.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (Python backend) + Vitest (frontend) |
| Config file | `backend/pyproject.toml` (pytest) |
| Quick run command | `cd backend && uv run pytest tests/ -x -q` |
| Full suite command | `cd backend && uv run pytest tests/ -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BULK-01 | Note generation skips items with existing "AI Notes" folder | unit | `pytest tests/test_batch.py::test_notes_skip_existing -x` | Wave 0 |
| BULK-02 | extract_keywords_for_items accepts paper + website + github_repo IDs | unit | `pytest tests/test_batch.py::test_extract_keywords_all_types -x` | Wave 0 |
| BULK-03 | Batch embeddings endpoint indexes items without cached embeddings | unit | `pytest tests/test_batch.py::test_batch_embeddings -x` | Wave 0 |
| BULK-08 | Concurrency pool with pause drains queue correctly | unit (frontend) | `vitest run src/hooks/useBatchProcessor.test.js` | Wave 0 |
| BULK-09 | Failed items tracked separately and retriable | unit (frontend) | `vitest run src/hooks/useBatchProcessor.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/test_batch.py -x -q`
- **Per wave merge:** `cd backend && uv run pytest tests/ -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_batch.py` — covers BULK-01, BULK-02, BULK-03
- [ ] `frontend/src/hooks/useBatchProcessor.test.js` — covers BULK-07, BULK-08, BULK-09
- [ ] `backend/routers/batch.py` — new router (no test until Wave 0 creates stub)
- [ ] `backend/services/keyword_extraction_service.py` — `extract_keywords_for_items()` function (Wave 0 adds stub returning `{"updated": 0, "skipped": 0, "total": 0}`)

---

## Sources

### Primary (HIGH confidence)
- Codebase: `frontend/src/pages/Library.jsx` — existing FetchPDFs modal implementation (lines 1590-1618, 2376-2465), bulk action bar (lines 2045-2132), state management patterns
- Codebase: `backend/services/note_service.py` — generate_notes(), generate_notes_for_website(), generate_notes_for_github_repo() signatures and behavior
- Codebase: `backend/services/keyword_extraction_service.py` — existing batched OpenAI tagging pattern, skip logic
- Codebase: `backend/services/search_service.py` — index_paper(), index_website(), index_github_repo(), _index_item() (cache skip behavior)
- Codebase: `frontend/src/components/WindowModal.jsx` — modal props (disableClose, closeOnBackdrop, bodyClassName)
- Codebase: `frontend/src/services/api.js` — notesApi.generate(), papersApi.fetchPdf() patterns

### Secondary (MEDIUM confidence)
- JavaScript concurrency pool pattern: standard async/await Worker pattern using shared queue and `Promise.all(Array.from({length: N}, worker))` — well-established JS idiom
- useRef for async closure: documented React pitfall with stale closures in async functions — confirmed by Phase 02 decisions in STATE.md

### Tertiary (LOW confidence)
- OpenAI rate limit estimates for gpt-4o-mini at concurrency=5: derived from token count heuristics, not verified against current rate limit docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing libraries, no new dependencies
- Architecture: HIGH — direct inspection of existing code patterns; generalizing the FetchPDFs modal is straightforward
- Pitfalls: HIGH — stale closure pitfall is established project knowledge (STATE.md); skip detection issue derived directly from codebase reading; rate limit concern is MEDIUM (heuristic)
- Cost estimation heuristics: MEDIUM — rough approximations based on gpt-4o-mini pricing + token count estimates

**Research date:** 2026-03-22
**Valid until:** 2026-06-22 (stable tech, no external dependencies changing)
