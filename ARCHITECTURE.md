# Architecture

This document describes the high-level architecture of ResearchOS. If you want to familiarize yourself with the codebase, you are in the right place.

## Bird's Eye View

ResearchOS is a single-user research operating system with two planes that share a single source of truth:

**Knowledge plane** — the system of record for all domain objects (papers, websites, collections, notes). Backed by Supabase (PostgreSQL for structured data, Storage for PDFs).

**Execution plane** — agent and workflow runtime. Agents execute multi-step research workflows using tools that read from and write back to the knowledge plane with provenance.

The closed loop is the core value: every workflow run improves the library (curated collections, tags, notes), and the improved library makes future workflows higher quality.

The system is split into a Python backend (FastAPI) and a React frontend (Vite). They communicate over REST — the frontend never touches the database directly.

```
Browser (React SPA, port 5173)
  │
  │  /api/* (Vite dev proxy)
  ▼
FastAPI (port 8000)
  │
  ├── services/  ──→  Supabase (PostgreSQL + Storage)
  │
  └── agents (pydantic-ai)  ──→  OpenAI
```

## Code Map

### `backend/`

The backend is a standard FastAPI application. Three directories mirror the layered architecture:

**`backend/models/`** — Pydantic domain models. Every model inherits from `CamelModel` (defined in `base.py`), which applies `alias_generator=to_camel` so Python snake_case fields serialize to camelCase JSON automatically. Models define the contract; raw dicts never cross module boundaries.

**`backend/services/`** — Business logic and all database access. Route handlers never contain business logic — they validate input, call a service function, and return the response. Key services:

- `db.py` — Supabase client singleton (`lru_cache`). Every other service imports `get_client()` from here.
- `import_service.py` — The paper/website import pipeline. Classifies identifiers (DOI, arXiv, OpenReview, Zenodo, URL), fetches metadata from the appropriate external API, deduplicates, and creates the item. Triggers background tasks (PDF auto-download, AI note generation).
- `pdf_service.py` / `pdf_text_service.py` / `pdf_metadata_service.py` — PDF lifecycle: storage in Supabase, text extraction via pymupdf4llm, and LLM-powered metadata extraction from uploaded PDFs.
- `note_service.py` — CRUD for the per-item note filesystem, plus AI note generation (OpenAI JSON mode producing a structured tree of files/folders).
- `chat_service.py` — AI copilot: OpenAI chat with tool calling that can suggest diffs to notes.

**`backend/routers/`** — One FastAPI router per resource. Thin handlers only. All routes are prefixed `/api`, and all responses are camelCase JSON via `model.model_dump(by_alias=True)`.

**`backend/migrations/`** — SQL files run in order in the Supabase SQL editor. Numbered `001` through `007`. These are the schema source of truth.

**`backend/app.py`** — Entry point. Mounts CORS middleware, includes all routers, and seeds empty Supabase tables on startup from a built-in `SEED` dict.

### `frontend/src/`

The frontend is a React SPA with React Router v6 and Tailwind CSS.

**`services/api.js`** — Thin fetch wrapper. One object per resource (`papersApi`, `websitesApi`, `librariesApi`, `collectionsApi`, `notesApi`, `chatApi`, etc.). All API calls go through here — components never call `fetch` directly.

**`context/LibraryContext.jsx`** — React context for the active library, its collections, and CRUD operations. The active library ID is persisted to localStorage.

**`components/layout/`** — The app shell: `Layout.jsx` (sidebar + header + outlet), `Sidebar.jsx` (library switcher, collections tree with drag-drop), `Header.jsx` (search bar, Quick Add modal).

**`components/`** — Shared UI components used across pages:
- `NotesPanel.jsx` — tiptap WYSIWYG editor with a file tree sidebar. Generic — works for both papers and websites via props.
- `CopilotPanel.jsx` — AI chat panel that suggests diffs to notes. Also generic across papers and websites.
- `PaperInfoPanel.jsx` — Paper metadata editor with author chips (drag-reorder, inline edit, comma-paste split) and a collections picker.
- `WindowModal.jsx` — Reusable windowed modal shell with minimize/fullscreen/close and docked minimization.

**`pages/`** — One component per route. The important ones:
- `Library.jsx` — Unified paper/website table with multi-select, bulk actions, filter panel, and inline detail panels.
- `Paper.jsx` — Three-pane layout: PDF viewer + Notes IDE + AI Copilot.
- `Website.jsx` — Three-pane layout: live iframe + Notes IDE + AI Copilot + Details panel.
- `Dashboard.jsx` — Activity feed, run stats, papers-over-time chart.
- `Agents.jsx` — Workflow catalog and active runs with live log viewer.
- `Proposals.jsx` — Human-in-the-loop approve/reject with diff view.

## Cross-Cutting Concerns

### Data Serialization Boundary

Python models use snake_case. The database uses snake_case. The frontend expects camelCase. The `CamelModel` base class handles this translation automatically — `model_validate(row)` reads from the DB and `model_dump(by_alias=True)` serializes for the API. This convention is load-bearing: every model must inherit `CamelModel`, and every router must serialize with `by_alias=True`.

### External API Integration

Paper metadata comes from Crossref, arXiv, OpenReview, Zenodo, and generic HTML meta tags. All external API access is isolated in `import_service.py`. External responses are validated before storage — they may be incomplete or malformed. Each provider has its own rate limits (arXiv: 1 req/3 sec; Crossref: polite pool requires `mailto`).

### PDF Lifecycle

PDFs flow through three stages: storage (`pdf_service.py` uploads to the Supabase `pdfs` bucket at path `{paper_id}.pdf`), text extraction (`pdf_text_service.py` converts to markdown via pymupdf4llm and caches in `paper_texts`), and consumption (the copilot and note generator read cached text). The frontend fetches PDFs as blobs to bypass `Content-Disposition` and `X-Frame-Options` headers.

### AI Features

All AI features use OpenAI and share a pattern: extract context (PDF text, metadata, existing notes), build a prompt, call OpenAI (either JSON mode for structured output or tool calling for copilot suggestions), and write results back through the service layer. The three AI features — auto-note generation, copilot chat, and PDF metadata extraction — are independent services that don't depend on each other.

### Agent Provenance

Every agent action is traceable. Papers track which agent run added them (`agent_run` field). Workflow runs store logs, traces, and cost. The proposals system ensures agents never mutate the library directly — they propose changes that a human approves or rejects.
