# Architecture

## Two-Plane Design

ResearchOS is structured around two planes that share a single source of truth:

**Knowledge plane** — the system of record for all domain objects: Papers, Websites, GitHub Repos, Collections, Libraries, Projects, Experiments, Tasks, Notes, Authors. Backed by Supabase (PostgreSQL for structured data, Storage for PDFs).

**Execution plane** — the agent and workflow runtime. Agents execute multi-step, stateful research workflows using tools that read from and write back to the knowledge plane with full provenance (run records, proposals, activity feed).

The closed loop is the core value proposition: every workflow run improves the library (curated collections, tags, notes), and the improved library provides better context for future workflows.

---

## Frontend / Backend Split

| Layer | Technology | Port | Notes |
|-------|-----------|------|-------|
| Frontend | React 18 + Vite | 5173 | SPA; all routing client-side via React Router v6 |
| Backend | FastAPI + uvicorn | 8000 | REST API; agent tasks run server-side |
| Proxy | Vite dev proxy | — | `/api/*` forwarded to `localhost:8000` in dev |
| Database | Supabase (PostgreSQL) | — | Accessed via `supabase-py` client |
| Storage | Supabase Storage | — | `pdfs` bucket for uploaded/fetched PDFs |

---

## Backend Structure

```
backend/
├── app.py               # FastAPI entry, CORS, router registration, startup seeding
├── agents/              # pydantic-ai workflow agents + shared infra
│   ├── base.py          # RunLogger, search_arxiv, emit_activity
│   ├── llm.py           # Model role config, get_pydantic_ai_model, OpenAI clients
│   ├── prompts.py       # All system prompt constants
│   ├── literature_reviewer.py
│   ├── model_researcher.py
│   ├── experiment_designer.py
│   └── gap_analyzer.py
├── models/              # Pydantic domain models
├── services/            # All database access and business logic
├── routers/             # FastAPI route handlers (thin; delegate to services)
├── migrations/          # SQL migration files (run in Supabase SQL editor)
└── tests/               # pytest test suite
```

---

## Data Model Conventions

### CamelModel

All domain models inherit from `backend/models/base.py::CamelModel`:

```python
class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )
```

This applies `to_camel` aliasing so that:
- Python fields are `snake_case`: `arxiv_id`, `library_id`, `created_at`
- JSON serialization via `model.model_dump(by_alias=True)` produces `camelCase`: `arxivId`, `libraryId`, `createdAt`
- Supabase row validation via `Model.model_validate(row)` works with `snake_case` column names
- Clients can POST either snake_case or camelCase due to `populate_by_name=True`

### Database conventions

- Primary keys: `TEXT`, generated as `<entity>_<uuid4().hex[:10]>` (e.g., `paper_a1b2c3d4e5`)
- Timestamps: `TIMESTAMPTZ`, ISO 8601 format with milliseconds
- JSONB columns: `authors`, `tags`, `collections`, `config`, `metrics`, `logs`, `trace`, `cost`, `suggestions`
- All RLS disabled (single-user app, no auth)

### Serialization in routers

Route handlers always use `by_alias=True`:

```python
return thing.model_dump(by_alias=True)                    # single object
return [t.model_dump(by_alias=True) for t in things]      # list
```

---

## Supabase Service Layer

All Supabase access is in `backend/services/`. No direct database calls outside this directory.

### Read pattern

```python
result = get_client().table("papers").select("*").execute()
rows = [Paper.model_validate(r) for r in result.data]
```

### Create pattern

```python
paper = Paper(id=f"paper_{uuid.uuid4().hex[:10]}", **data.model_dump())
get_client().table("papers").insert(paper.model_dump(by_alias=False)).execute()
```

Note: use `by_alias=False` for inserts so column names remain `snake_case`.

### Update pattern

```python
updates = data.model_dump(exclude_unset=True)  # use exclude_unset, not exclude_none
if get_paper(paper_id) is None:
    return None
get_client().table("papers").update(updates).eq("id", paper_id).execute()
return get_paper(paper_id)
```

**Critical:** `.update(...).eq(...).select().execute()` raises `AttributeError` — `.eq()` on an update returns `SyncFilterRequestBuilder` which has no `.select()`. Always re-fetch after update.

### Delete pattern

```python
get_client().table("papers").delete().eq("id", paper_id).execute()
```

### Supabase client singleton

```python
# backend/services/db.py
from functools import lru_cache
from supabase import create_client

@lru_cache(maxsize=1)
def get_client():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
```

---

## PDF Storage Flow

1. **Upload** (user or auto-download): PDF is uploaded to Supabase Storage bucket `pdfs` at path `{paper_id}.pdf` via `pdf_service.upload_pdf()`.
2. **URL storage**: the Supabase public URL is written back to `papers.pdf_url`.
3. **Frontend display**: PDFs are fetched as blobs and displayed via `URL.createObjectURL()`:
   ```js
   const res = await fetch(paper.pdfUrl)
   const blob = await res.blob()
   setPdfBlobUrl(URL.createObjectURL(blob))
   ```
   Blob URLs bypass `Content-Disposition: attachment` and `X-Frame-Options` headers. They are revoked on cleanup via `URL.revokeObjectURL()`.
4. **Detection**: a `pdf_url` containing `/storage/v1/object/public/pdfs/` is a Supabase-hosted PDF. Any other URL is an external source not yet uploaded.

---

## Agent Workflow Lifecycle

1. **Trigger**: frontend calls `POST /api/runs` with `workflow_id`, `prompt`, and optional `target_collection_id`.
2. **Run record creation**: `run_service.create_run()` inserts a run with `status="running"`.
3. **Background task**: `BackgroundTasks.add_task(run_<workflow>, run.id, prompt)` queues the workflow.
4. **Response**: the route returns immediately with the run record (status `"running"`).
5. **Live logging**: the workflow calls `RunLogger.info/agent/tool/error()` which calls `run_service.append_log()` for real-time log streaming.
6. **Progress updates**: `RunLogger.set_progress(pct, step)` updates the progress bar.
7. **Completion**: `run_service.complete_run(run_id, trace, cost)` sets status to `"completed"`.
8. **Failure**: `run_service.fail_run(run_id, error)` sets status to `"failed"`.
9. **Activity feed**: `emit_activity()` appends a human-readable entry to `data/activity.json`.
10. **Proposals**: agent-created papers have associated `Proposal` records. Users review and approve/reject proposals on the Proposals page.

---

## Error Handling Conventions

- Route handlers use `HTTPException(status_code, detail)`.
- All 404s return `{"error": "not_found", "detail": "..."}` via the global exception handler in `app.py`.
- Services return `None` when a record is not found; routers convert `None` to `HTTPException(404)`.
- External API errors are caught at the integration boundary (`import_service.py`, `agents/base.py`) and re-raised as `ValueError` with user-facing messages.
- Agent workflow errors are caught in the top-level `try/except` of the workflow runner; `run_service.fail_run()` is always called, never leaving a run in `"running"` state.

---

## Frontend Architecture

The frontend is a single-page React application with no global state manager.

- **LibraryContext** (`context/LibraryContext.jsx`): the only cross-cutting store; holds active library, libraries list, and collections. Persists active library to `localStorage`.
- **api.js** (`services/api.js`): thin fetch wrapper with named API objects per resource (`papersApi`, `websitesApi`, etc.). All calls go to `/api/*` which Vite proxies to the backend.
- **Pages**: each page manages its own state with `useState`/`useEffect`. No shared page cache.
- **Custom events**: `window.dispatchEvent(new CustomEvent(...))` for cross-component coordination without prop drilling (e.g., `researchos:items-changed`, `researchos:projects-changed`).
- **Layouts**: `Layout` (with Header + Sidebar) and `LayoutBare` (Sidebar only) defined in `components/layout/Layout.jsx`.
