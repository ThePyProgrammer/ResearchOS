# Architecture

This document describes the high-level architecture of ResearchOS. If you want to familiarize yourself with the codebase, you are in the right place.

## Bird's Eye View

ResearchOS is a single-user research operating system with two planes that share a single source of truth:

**Knowledge plane** — the system of record for all domain objects (papers, websites, GitHub repos, collections, notes, authors). Backed by Supabase (PostgreSQL for structured data, Storage for PDFs).

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
  ├── services/  ──→  OpenAlex API (related papers)
  │
  └── agents (pydantic-ai)  ──→  OpenAI
```

## Domain Model

The knowledge plane contains these first-class entities:

| Entity | Description |
|---|---|
| `Library` | Top-level container. All other entities are scoped to a library. |
| `Paper` | An academic paper, imported via DOI / arXiv ID / URL / BibTeX or uploaded as a PDF. |
| `Website` | Any URL — blog posts, docs, articles — treated as a peer to papers. |
| `GitHubRepo` | A GitHub repository with metadata (stars, description, language, topics). |
| `Collection` | A named group of papers/websites inside a library, nestable in a tree. |
| `Author` | A person linked to one or more papers, with deduplication via name matching. |
| `Note` | A file in the per-item note filesystem (folder or content node). Notes can belong to a paper, website, GitHub repo, or the library itself. |
| `Run` | A workflow execution record with logs, trace, and cost. |
| `Proposal` | An agent-suggested change waiting for human approval or rejection. |
| `Activity` | An immutable audit log entry for any agent or human action. |

## Code Map

### `backend/`

The backend is a standard FastAPI application. Three directories mirror the layered architecture:

**`backend/models/`** — Pydantic domain models. Every model inherits from `CamelModel` (defined in `base.py`), which applies `alias_generator=to_camel` so Python snake_case fields serialize to camelCase JSON automatically. Models define the contract; raw dicts never cross module boundaries. Each entity follows the three-form pattern: `Model` (full read), `ModelCreate` (no ID/timestamps), `ModelUpdate` (all fields optional). `discovery.py` defines models for the related-paper response (`RelatedPaperCandidate`, `RelatedPapersResponse`).

**`backend/services/`** — Business logic and all database access. Route handlers never contain business logic — they validate input, call a service function, and return the response. Key services:

- `db.py` — Supabase client singleton (`lru_cache`). Every other service imports `get_client()` from here.
- `storage.py` — Thin JSON file I/O helpers (`load_json`, `save_json`) for local data files (embeddings cache, run logs, activity feed, LLM settings). All paths resolve under `backend/data/`.
- `import_service.py` — The paper/website import pipeline. Classifies identifiers (DOI, arXiv, OpenReview, Zenodo, URL), fetches metadata from the appropriate external API, and creates the item. Triggers background tasks (PDF auto-download, AI note generation).
- `dedup_service.py` — Centralized duplicate detection used by all import paths. Three-tier matching: DOI (exact), arXiv ID (exact), normalized title (likely). Returns `DuplicateCandidate` objects with confidence level and match field.
- `bibtex_service.py` — BibTeX import/export. Parses `.bib` files via `bibtexparser` v2 with LaTeX cleanup and author normalization. Exports papers as `@article`/`@inproceedings` and websites as `@misc` with auto-generated citation keys.
- `pdf_service.py` / `pdf_text_service.py` / `pdf_metadata_service.py` — PDF lifecycle: storage in Supabase, text extraction via pymupdf4llm, and LLM-powered metadata extraction from uploaded PDFs.
- `note_service.py` — CRUD for the per-item note filesystem, plus AI note generation (OpenAI JSON mode producing a structured tree of files/folders). Supports papers, websites, GitHub repos, and library-level notes.
- `chat_service.py` — AI copilot: OpenAI chat with tool calling that can suggest diffs to notes. Works across papers, websites, and GitHub repos.
- `search_service.py` — Unified search across papers, websites, and GitHub repos. Supports two modes: **lexical** (weighted keyword scoring per field, no API key needed) and **semantic** (OpenAI `text-embedding-3-small` cosine similarity, falls back to lexical when the API key is absent). Embeddings are cached in `backend/data/embeddings.json`.
- `map_service.py` — UMAP 2D projection of cached item embeddings for the library map visualisation. Fetches all items in a library, filters to those with a cached embedding, and runs UMAP (`cosine` metric, `n_neighbors=min(15,n−1)`, `random_state=42`) inside a thread-pool executor so the async event loop is never blocked. The projection is cached in `backend/data/map_cache.json` keyed by a SHA-256 signature over the sorted set of embedding cache keys; the cache is invalidated automatically when the item set changes. `invalidate_map_cache()` can also be called explicitly after indexing new items.
- `related_paper_service.py` — OpenAlex-powered related paper discovery for a seed paper. Combines semantic similarity links, citation references, and cited-by lookups from OpenAlex; falls back to title-neighbor search when direct links are sparse. Results are ranked by reason type and citation count and annotated with duplicate detection against the user's library.
- `author_service.py` / `author_match_service.py` — Author CRUD and fuzzy name-matching across papers.
- `github_repo_service.py` — GitHub repository import and metadata sync.

**`backend/routers/`** — One FastAPI router per resource. Thin handlers only. All routes are prefixed `/api`, and all responses are camelCase JSON via `model.model_dump(by_alias=True)`. Notable routers:

- `search.py` — `GET /api/search` with `?q=&mode=lexical|semantic&library_id=&types=` query parameters. Also `GET /api/search/map?library_id=` which delegates to `map_service.build_map()` and returns the UMAP projection as a JSON array.
- `settings.py` — `GET/PATCH /api/settings/models` for runtime LLM model selection.

**`backend/migrations/`** — SQL files run in order in the Supabase SQL editor. These are the schema source of truth.

| File | Description |
|---|---|
| `001_init.sql` | Core tables: libraries, papers, collections, runs, proposals, activity |
| `002_add_paper_urls.sql` | Add `pdf_url` and `source_url` to papers |
| `002_library_id.sql` | Add `library_id` foreign key to papers |
| `003_notes.sql` | Notes table (per-paper file tree) |
| `003_add_links.sql` | External link fields on papers |
| `003_auto_notes.sql` | Auto-note-taker config on libraries |
| `004_chat_messages.sql` | Chat message history |
| `004_website_notes.sql` | Extend notes to websites |
| `005_paper_texts.sql` | Cached PDF text extraction |
| `006_chat_suggestions.sql` | Copilot diff suggestions |
| `007_website_chat.sql` | Chat history for websites |
| `008_paper_published_date.sql` | Add `published_date` to papers |
| `009_authors.sql` | Authors table + paper-author join table |
| `010_github_repos.sql` | GitHub repositories table |
| `011_github_repo_notes_chat.sql` | Add `github_repo_id` column to notes and chat_messages |
| `012_library_notes.sql` | Add `library_id` column to notes (library-level notes) |

**`backend/app.py`** — Entry point. Mounts CORS middleware, includes all routers, and seeds empty Supabase tables on startup from a built-in `SEED` dict.

**`backend/agents/`** — pydantic-ai agent definitions and shared AI infrastructure:

- `llm.py` — Centralized LLM configuration. Defines named **roles** (e.g. `chat`, `notes`, `metadata`, `agent`, `embedding`) each mapped to a specific OpenAI model. Settings are persisted in `backend/data/llm_settings.json` and can be changed at runtime via the settings API. Also exposes `get_openai_client()`, `get_async_openai_client()`, and `completion_params()` for model-compatible API calls (handles `max_tokens` vs `max_completion_tokens` differences between model generations).
- `base.py` — Shared agent infrastructure: `RunLogger` for real-time run log writes, `search_arxiv` for async arXiv API queries, and `emit_activity` for appending entries to the activity feed.
- `literature_reviewer.py` — Searches arXiv and OpenAlex, screens candidates with an LLM, and proposes a curated collection.
- `model_researcher.py` — Decomposes a model/technique topic into sub-questions, finds literature, and produces a structured summary.
- `experiment_designer.py` — Retrieves context via hybrid RAG, generates experiment ideas, runs a critique loop, and outputs code stubs.
- `prompts.py` — Shared prompt templates used across agent implementations.

### `frontend/src/`

The frontend is a React SPA with React Router v6 and Tailwind CSS.

**`services/api.js`** — Thin fetch wrapper. One object per resource (`papersApi`, `websitesApi`, `librariesApi`, `collectionsApi`, `notesApi`, `chatApi`, `githubReposApi`, `searchApi`, etc.). All API calls go through here — components never call `fetch` directly.

**`context/LibraryContext.jsx`** — React context for the active library, its collections, and CRUD operations. The active library ID is persisted to localStorage.

**`hooks/useDragResize.js`** — Custom hook for drag-to-resize panels. Used in the Paper, Website, GitHubRepo, and LibraryNotes pages to resize the split-pane layouts.

**`components/layout/`** — The app shell: `Layout.jsx` (sidebar + header + outlet), `Sidebar.jsx` (library switcher, collections tree with drag-drop, collection context menu with "Export BibTeX" action), `Header.jsx` (search bar with ⌘K/Ctrl+K global keyboard shortcut, Quick Add modal with localStorage persistence).

**`components/`** — Shared UI components used across pages:

- `NotesPanel.jsx` — tiptap WYSIWYG editor with a file tree sidebar. Generic — works for papers, websites, GitHub repos, and library-level notes via props. Supports LaTeX (KaTeX), code blocks with syntax highlighting, task lists, highlights, links, and `[[wiki-link]]` syntax.
- `WikiLinkExtension.js` — Custom tiptap extension that renders `[[note-name]]` syntax as clickable blue links. Provides autocomplete suggestions from existing notes and fires a callback on click so the notes panel can navigate to the linked file.
- `NoteGraphView.jsx` — D3 force-directed graph of all notes in the library, with edges representing `[[wiki-link]]` connections between notes. Nodes are color-coded by source type (library, paper, website, GitHub). Used in the Library Notes IDE (`/library/notes`).
- `CopilotPanel.jsx` — AI chat panel that suggests diffs to notes. Generic across papers, websites, and GitHub repos.
- `PaperInfoPanel.jsx` — Paper metadata editor with author chips (drag-reorder, inline edit, comma-paste split) and a collections picker. Exports reusable `EditableField`, `EditableTextArea`, `NamedLinks`, `TagChips`, and `statusConfig` used by other detail pages; `CollectionsPicker` and `AuthorChips` are also exported and shared across paper, website, and GitHub repo detail panels.
- `WindowModal.jsx` — Reusable windowed modal shell with minimize/fullscreen/close and docked minimization. Used by Quick Add, collection creation, bulk-action modals, and agent config.

**`pages/`** — One component per route:

- `Library.jsx` — Unified paper/website/GitHub repo table with multi-select, bulk actions, filter panel, and inline detail panels. `WebsiteDetail` and `GitHubRepoDetail` sub-components include full `CollectionsPicker` and `TagChips` parity with papers. Includes a keyboard shortcut help overlay (`?` key) listing all active shortcuts.
- `Paper.jsx` — Three-pane layout: PDF viewer + Notes IDE + AI Copilot.
- `Website.jsx` — Three-pane layout: live iframe + Notes IDE + AI Copilot + Details panel.
- `GitHubRepo.jsx` — Two-pane layout: repo overview (metadata, topics, description/abstract, links) + tabbed panel with Details and Notes IDE + AI Copilot.
- `LibraryNotes.jsx` — Library-level Notes IDE with a file tree covering all notes across the library, a full-featured tiptap editor, and an optional D3 `NoteGraphView` sidebar for visualizing wiki-link connections.
- `LibraryMap.jsx` — Semantic library map at `/library/map`. Fetches UMAP coordinates from `GET /api/search/map`, renders a D3 scatter plot on a dark dot-grid canvas, and supports zoom/pan (**Explore** mode) and brush-select (**Select** mode). Brush selection correctly inverts the current zoom transform when mapping pixel coordinates back to data space. Clicking a point navigates to the item's detail page. Color-coding toggles between first-collection and item-type. A collapsible legend panel mirrors the active colour scheme. Brush-selected items can be saved as a new collection via a `WindowModal` form that bulk-patches all selected items' `collections` field.
- `Dashboard.jsx` — Activity feed, run stats, papers-over-time chart (Recharts). Triage health stat cards (Inbox / To Read / Read) are clickable and navigate to the corresponding filtered library view.
- `Agents.jsx` — Workflow catalog and active runs with live log viewer.
- `Proposals.jsx` — Human-in-the-loop approve/reject with diff view.
- `Authors.jsx` / `AuthorDetail.jsx` — Author list and single author view.
- `LibrarySettings.jsx` — Library rename, AI Auto-Note-Taker toggle, and delete.

## Cross-Cutting Concerns

### Data Serialization Boundary

Python models use snake_case. The database uses snake_case. The frontend expects camelCase. The `CamelModel` base class handles this translation automatically — `model_validate(row)` reads from the DB and `model_dump(by_alias=True)` serializes for the API. This convention is load-bearing: every model must inherit `CamelModel`, and every router must serialize with `by_alias=True`.

### LLM Configuration

All AI calls are routed through `agents/llm.py`, which maps **roles** to OpenAI model IDs. This decouples every AI feature from a hardcoded model string. Roles include:

| Role | Default model | Purpose |
|---|---|---|
| `chat` | `gpt-4o-mini` | AI Copilot chat |
| `notes` | `gpt-4o-mini` | AI note generation |
| `metadata` | `gpt-4o-mini` | PDF metadata extraction |
| `enrichment` | `gpt-4o-mini` | Author profile enrichment |
| `web_search` | `gpt-4o-mini-search-preview` | Web search for author lookups |
| `agent` | `gpt-4o` | High-tier agent workflows |
| `agent_light` | `gpt-4o-mini` | Light-tier agent workflows |
| `embedding` | `text-embedding-3-small` | Semantic search embeddings |

Settings are persisted to `backend/data/llm_settings.json` and exposed via `GET/PATCH /api/settings/models`. Available models are fetched from the OpenAI API and cached for 24 hours in `backend/data/openai_models_cache.json`.

### External API Integration

Paper metadata comes from Crossref, arXiv, OpenReview, Zenodo, and generic HTML meta tags. All external API access is isolated in `import_service.py`. External responses are validated before storage — they may be incomplete or malformed. Each provider has its own rate limits (arXiv: 1 req/3 sec; Crossref: polite pool requires `mailto`).

### PDF Lifecycle

PDFs flow through three stages: storage (`pdf_service.py` uploads to the Supabase `pdfs` bucket at path `{paper_id}.pdf`), text extraction (`pdf_text_service.py` converts to Markdown via pymupdf4llm and caches in `paper_texts`), and consumption (the copilot and note generator read cached text). The frontend fetches PDFs as blobs to bypass `Content-Disposition` and `X-Frame-Options` headers.

### AI Features

All AI features use OpenAI and share a pattern: extract context (PDF text, metadata, existing notes), build a prompt, call OpenAI (either JSON mode for structured output or tool calling for copilot suggestions), and write results back through the service layer. The three AI features — auto-note generation, copilot chat, and PDF metadata extraction — are independent services that don't depend on each other.

### Search and Semantic Indexing

`search_service.py` provides a unified search entry point over all item types. **Lexical mode** uses weighted keyword scoring per field (title, authors, tags, abstract, venue) and works without an API key. **Semantic mode** generates `text-embedding-3-small` embeddings via OpenAI, computes cosine similarity against cached item embeddings, and automatically falls back to lexical when the API key is absent or the call fails. Embeddings are persisted in `backend/data/embeddings.json` and are generated lazily on first search or on item import (as a background task). Cache keys are prefixed by type (`ws:` for websites, `gh:` for GitHub repos, bare ID for papers) for global uniqueness.

### Library Map

`map_service.py` turns the same embedding cache into a spatial overview of the whole library. On a `GET /api/search/map?library_id=` request it:

1. Loads all items for the library from Supabase.
2. Filters to items that already have a cached embedding in `data/embeddings.json` — no new OpenAI calls are made.
3. Computes a **signature** (16-char SHA-256 prefix over the sorted embedding-key list) and checks `data/map_cache.json`. On a cache hit the stored `x`/`y` coordinates are returned immediately with freshly fetched metadata (title, collections may have changed).
4. On a cache miss, runs `umap.UMAP(n_components=2, metric="cosine", random_state=42)` inside `asyncio.get_event_loop().run_in_executor(None, ...)` so the event loop stays unblocked. Points with fewer than five embeddings fall back to a circle layout (too few for a meaningful UMAP projection).
5. Normalises coordinates to `[−1, 1]` on each axis, saves the result keyed by library ID, and returns the point list.

The cache is invalidated whenever the set of embedded items changes — the signature check naturally catches additions and removals. `invalidate_map_cache()` can also be called explicitly.

The frontend `LibraryMap.jsx` renders the points in a D3 scatter plot. The **Explore** mode attaches `d3.zoom()` to the SVG and stores the running `ZoomTransform` in a ref that survives chart rebuilds. The **Select** mode attaches `d3.brush()` to a separate overlay group and uses `currentTransform.invert()` to convert brush-pixel coordinates into scale-space coordinates before hit-testing against the circle positions — this keeps selection correct at any zoom level. Switching modes rebuilds the chart but restores the stored zoom transform, so the viewport does not jump.

### Related Paper Discovery

`related_paper_service.py` queries the OpenAlex API to surface related works for a seed paper. It resolves the seed to an OpenAlex work record via DOI, arXiv ID, or title, then collects three pools of candidates: OpenAlex semantic-similarity links (`related_works`), outbound references (`referenced_works`), and papers that cite the seed (`cited_by_api_url`). Results are ranked by reason type and citation count. When the graph links are sparse, the service falls back to a title-neighbor search. Each candidate is annotated with duplicate-detection results against the user's library so the frontend can indicate which papers are already imported.

### Library Interchange (BibTeX)

BibTeX import follows a two-phase pattern: parse/preview, then confirm. The parse endpoint (`POST /api/papers/import-bibtex/parse`) runs duplicate detection per entry using `dedup_service.find_duplicates()` and returns entries annotated with match info. The confirm endpoint re-checks for duplicates (intra-batch dedup) and re-resolves arXiv entries via the arXiv API for richer metadata. BibTeX export handles both papers and websites, with a frontend tree-view editor for reviewing entries before download.

### Duplicate Detection

All import paths funnel through `dedup_service.find_duplicates()` — a centralized function that checks DOI, arXiv ID, and normalized title (lowercase, strip punctuation, collapse whitespace). The three tiers run in order; earlier matches take priority. The function is library-scoped (only checks papers in the same library). The identifier import endpoint returns duplicates in the response body; the manual create endpoint uses a `?check_duplicates=true` query param that returns `409` with candidates; the BibTeX flow annotates each entry in the preview.

### Wiki-links and Note Graph

The tiptap editor in `NotesPanel.jsx` and `LibraryNotes.jsx` uses a custom `WikiLinkExtension` that renders `[[note-name]]` syntax as clickable links. On click, the extension fires a callback that navigates the file tree to the linked note. The `NoteGraphView` component in `LibraryNotes.jsx` uses D3 force simulation to draw the full note graph for the active library: one node per note and one edge per wiki-link reference. Nodes are color-coded by the parent item type (library, paper, website, GitHub repo). The graph is interactive (drag nodes, zoom/pan) and state such as the selected node persists to localStorage.

### Agent Provenance

Every agent action is traceable. Papers track which agent run added them (`agent_run` field). Workflow runs store logs, traces, and cost. The proposals system ensures agents never mutate the library directly — they propose changes that a human approves or rejects. `RunLogger` (in `agents/base.py`) writes structured log entries (`INFO`, `TOOL`, `AGENT`, `ERROR`) to the run record in real time so the frontend can stream live progress.

### Author Tracking

Authors are first-class entities (migration `009`). `author_match_service.py` performs fuzzy name matching to prevent duplicate author records across papers imported from different sources. Authors are linked to papers via a join table and rendered as draggable, editable chips in `PaperInfoPanel.jsx`.
