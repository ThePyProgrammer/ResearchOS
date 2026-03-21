# Architecture

This document describes the high-level architecture of ResearchOS.
If you want to familiarize yourself with the codebase, you are in the right place.
For detailed reference material, see [docs/](docs/README.md).

## Bird's Eye View

ResearchOS is a single-user research workspace with two planes sharing one database:

The **knowledge plane** is the system of record — papers, websites, repos, collections,
notes, authors, projects, experiments, tasks. All stored in Supabase (PostgreSQL + Storage).

The **execution plane** runs AI workflows that read from and write back to the knowledge
plane. Agents propose changes; humans approve or reject them.

The closed loop is the core value: agents improve the library, and a better library
makes agents more useful.

```
Browser (React SPA)
  |
  |  /api/*
  v
FastAPI
  |
  +-- services/  -->  Supabase (PostgreSQL + Storage)
  |
  +-- agents/    -->  OpenAI
```

The frontend never touches the database directly. Everything goes through REST.

## Code Map

### `backend/`

Three directories mirror the layered architecture:

`models/` — Pydantic domain models. Every model inherits `CamelModel` (in `base.py`)
which auto-translates snake_case Python to camelCase JSON. Each entity follows a
three-form pattern: `Model`, `ModelCreate`, `ModelUpdate`.

`services/` — Business logic and all DB access. Route handlers never contain logic.
The important ones to know about:

- `db.py` — Supabase client singleton. Everything else imports `get_client()` from here.
- `import_service.py` — Paper/website import pipeline. Classifies identifiers, fetches
  metadata from external APIs, runs dedup, triggers background tasks.
- `dedup_service.py` — Three-tier duplicate detection (DOI, arXiv ID, normalized title).
  Used by every import path.
- `note_service.py` — Note CRUD + AI generation. Notes are a per-item file tree.
- `chat_service.py` — Single-turn AI copilot with tool-calling for note suggestions.
- `notes_copilot_service.py` — Multi-turn agentic copilot (up to 6 LLM iterations).
- `search_service.py` — Unified lexical + semantic search. Embeddings cached on disk.
- `storage.py` — JSON file I/O for local data (embeddings, map cache, LLM settings).

`routers/` — One FastAPI router per resource. Thin handlers only. All responses are
camelCase JSON via `model_dump(by_alias=True)`.

`agents/` — pydantic-ai workflows. `llm.py` maps named roles to OpenAI models.
`base.py` provides RunLogger, arXiv search, and activity feed helpers. Three workflow
agents (literature_reviewer, model_researcher, experiment_designer) plus gap_analyzer.

`migrations/` — SQL files for Supabase. `schema.sql` is the single-file install;
numbered files are incremental.

`app.py` — Entry point. CORS, router mounting, startup seeding.

### `frontend/src/`

`services/api.js` — One object per resource. Components never call `fetch` directly.

`context/LibraryContext.jsx` — Active library + collections. The only React context.

`components/layout/` — App shell: Sidebar (library switcher, collections tree,
project tree), Header (search, Quick Add modal), Layout (sidebar + header + outlet).

`components/` — Shared UI. The ones worth knowing: `NotesPanel` (tiptap editor),
`CopilotPanel` / `NotesCopilotPanel` (AI chat), `WikiLinkExtension` (tiptap mark),
`NoteGraphView` (D3 force graph), `GapAnalysisTab` + `MiniExperimentTree` (gap analysis
planning board), `PaperInfoPanel` (metadata editor, exports reusable sub-components).

`pages/` — One component per route. The large ones: `Library.jsx` (unified item table),
`ProjectDetail.jsx` (experiments, research questions, gap analysis), `ProjectTasks.jsx`
(Kanban/list/calendar), `LibraryNotes.jsx` (notes IDE + copilot + graph).

## Invariants

**CamelModel everywhere.** Every Pydantic model inherits `CamelModel`. Every router
serializes with `by_alias=True`. Breaking this breaks the frontend.

**Services own the database.** Routers and agents never call Supabase directly.
Services never call each other's routers.

**Agents propose, humans approve.** Agents write to proposals, not directly to the
knowledge plane. The exception is background tasks (PDF download, note generation)
which are non-destructive additions.

**One fetch wrapper.** All frontend API calls go through `api.js`. Components never
use `fetch` directly.

**Notes are a file tree.** Notes have `type` (file or folder), `parent_id`, and
`position`. They belong to exactly one owner (paper_id, website_id, github_repo_id,
project_id, experiment_id, or library_id — exactly one is non-null).

**Embeddings are cached.** Semantic search embeddings live in `data/embeddings.json`,
keyed by `{type_prefix}:{id}`. They're generated lazily and never re-computed unless
the item changes.

## Cross-Cutting Concerns

**LLM configuration** — All AI calls route through `agents/llm.py`, which maps roles
(chat, notes, metadata, agent, embedding) to model IDs. Changeable at runtime via
the settings API. No hardcoded model strings in service code.

**External APIs** — Paper metadata comes from Crossref, arXiv, OpenReview, Zenodo, and
HTML meta tags. All isolated in `import_service.py`. Each provider has rate limits.
Responses are validated before storage.

**PDF lifecycle** — Upload to Supabase Storage, extract text via pymupdf4llm, cache in
`paper_texts` table. Frontend fetches as blobs to bypass Content-Disposition headers.

**Provenance** — Papers track which agent run added them. Runs store logs, traces, and
cost. RunLogger writes structured entries in real time.
