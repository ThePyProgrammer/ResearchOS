# ResearchOS

[![Tests](https://github.com/ThePyProgrammer/researchos/actions/workflows/tests.yml/badge.svg)](https://github.com/prannvat/researchos/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Node 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)

An AI-powered research operating system that merges a Zotero-like reference manager with a multi-agent workflow engine. Agents read from and write back to a shared knowledge library with full provenance.

![Dashboard](img/dashboard.png)

## Features

- **Library management** — import papers and websites via DOI, arXiv ID, URL, OpenReview, or Zenodo; organize into nested collections with drag-and-drop

![Library](img/library_main.png)

- **Multiple libraries** — create and switch between independent libraries
- **Websites as first-class items** — blog posts, articles, and any URL live alongside papers with their own metadata
- **GitHub repos as first-class items** — track repositories alongside papers and websites; full detail page with metadata, notes, and AI copilot

<p align="center">
  <img src="img/library_paper_preview.png" width="32%" />
  <img src="img/library_website_preview.png" width="32%" />
  <img src="img/library_github_preview.png" width="32%" />
</p>

- **BibTeX import/export** — bulk-import `.bib` files with a two-phase preview/confirm flow; export papers and websites as `.bib` with a tree-view editor for reviewing and editing entries before download
- **Duplicate detection** — centralized three-tier dedup (DOI, arXiv ID, normalized title) across all import paths: identifier import, PDF upload, and BibTeX import; surfaces warnings with "Import anyway" option
- **PDF upload with metadata extraction** — drag-and-drop PDFs; LLM-powered extraction of title, authors, date, venue, abstract, and DOI
- **PDF storage** — stored in Supabase Storage, rendered inline; auto-downloaded from source on import

![Quick Add](img/library_quick_add.png)

<p align="center">
  <img src="img/paper_details.png" width="49%" />
  <img src="img/paper_notes.png" width="49%" />
</p>

![Website Details](img/website_details.png)

- **Notes IDE** — library-level scratchpad at `/library/notes` covering all notes across papers, websites, GitHub repos, and the library itself; multi-tab tiptap WYSIWYG editor with:
  - LaTeX / KaTeX math rendering
  - `[[wiki-link]]` syntax with autocomplete, click-to-navigate, and a D3 force graph of all link connections
  - **Tables** — full tiptap table support with resizable columns, a toolbar menu, and a right-click context menu for insert/delete row/column, merge/split cells, and header toggles
  - **Note templates** — six built-in templates (Blank, Literature Note, Meeting Note, Experiment Log, Literature Review, Paper Summary) shown in a split preview modal on file creation
  - **Pinned notes** — star any note to float it to the top of the file tree and a dedicated Pinned section; toggle from the star icon or right-click context menu
  - **Export** — export the active note as Markdown (`.md` download) or PDF (print-ready `window.print()` with KaTeX and wiki-link styles) from a toolbar dropdown
  - Drag-and-drop reordering, backlinks panel, recent notes section, full-text search

![Notes IDE](img/notes_ide.png)

![Notes Graph](img/notes_graph.png)

- **AI Auto-Note-Taker** — generates a multi-file note structure for any paper, website, or GitHub repo; auto-runs on import and PDF upload
- **AI copilot** — context-aware research assistant that can suggest diffs to your notes; `[[wiki-link]]` references in chat output are rendered as clickable chips that open the linked note in the IDE
- **Notes-page AI copilot** — library-scoped AI copilot on the Notes IDE that runs in an agentic loop (up to 6 LLM turns per request). Type `@` in the chat input to select any combination of papers, websites, GitHub repos, collections, or "all items" as context; toggle per-item note inclusion. The model can call `read_note` and `list_item_notes` internally before producing `suggest_note_edit` and `suggest_note_create` proposals targeting any item in the library or the library-level notes tree

![Notes Copilot](img/notes_copilot.png)
- **Semantic search** — hybrid lexical and OpenAI-embedding search across papers, websites, and GitHub repos (falls back to lexical when no API key is set)
- **Related paper discovery** — surfaces related works for any paper via OpenAlex citation links and semantic neighbors
- **Agent workflows** — multi-step research workflows (literature review, model research, experiment design) powered by OpenAI via pydantic-ai
- **Human-in-the-loop proposals** — agents propose changes that you approve or reject with a diff view
- **Authors** — first-class author entities with fuzzy name matching across papers
- **Activity feed** — full audit trail of agent and human actions
- **LLM configuration** — per-role model selection (chat, notes, metadata, agent, embeddings) configurable at runtime from the settings page
- **Keyboard shortcut help overlay** — press `?` anywhere in the Library to display a compact modal listing all active keyboard shortcuts (`j`/`k`, `Enter`, `Escape`, status keys, etc.)
- **⌘K / Ctrl+K global search shortcut** — focuses the Library search box from anywhere in the app
- **Clickable Dashboard triage cards** — Inbox / To Read / Read stat cards navigate directly to the filtered library view on click
- **Editable tags for websites and GitHub repos** — tag chip editor available on all item types in detail panels, matching the existing paper tag editing experience
- **Collections picker for GitHub repos** — GitHub repo detail panels now include the same collections picker available for papers and websites
- **Export BibTeX from sidebar collection context menu** — the collection right-click menu includes an "Export BibTeX" action, making citation export accessible without opening the Library
- **Semantic library map** — a 2D scatter plot of all papers, websites, and GitHub repos positioned by semantic similarity (UMAP over cached embeddings). Color-coded by collection or item type; hover for title and collection membership; click to navigate; brush-select a region to create a new collection from items that cluster together. No new AI calls — runs entirely on the existing embedding cache

![Library Map](img/library_map.png)

### Research Projects & Experiments (v1.0)

- **Projects** — create research projects within a library; each project has its own overview, literature, experiments, tasks, notes, and review sections
- **Research questions** — hierarchical research question tree with drag-and-drop nesting, status tracking (open/investigating/answered/discarded), and wiki-link references in notes
- **Experiment tree** — nested experiment hierarchy with configurable status, config (JSONB), and metrics (JSONB); tree view with expand/collapse and drag-and-drop reorder; detail panel with inline editing
- **Experiment differentiators** — compare experiments side-by-side; link papers to experiments for literature grounding; bulk status changes and duplication
- **CSV data loading** — import experiment results from CSV files with column mapping, preview, and merge into existing experiment configs/metrics
- **Experiment table view** — spreadsheet-style view with sortable/filterable columns, bulk selection, multi-select actions (compare, set status, duplicate, delete), and column visibility controls
- **Project notes IDE** — project-scoped tiptap notes with the same editor features as library notes (math, wiki-links, tables, templates, pinned notes, export); project-level AI copilot with experiment and literature context
- **Project-linked papers** — link library papers to projects; linked papers appear in the project's Literature tab and provide context for AI features

### Research Productivity (v1.1)

- **Task database** — project-scoped tasks with title, description, status, priority, due date (with optional time), tags, and custom fields (text, number, date, select, multi-select)
  - **Kanban board** — one column per custom status; drag-and-drop cards between columns; inline task creation; column management (rename, color picker, delete with task migration)
  - **List view** — sortable, filterable table with all fields as columns; filter chips for status, priority, overdue, and custom fields; column visibility picker; custom field management via "+" button
  - **Calendar view** — month grid showing tasks on due dates as colored chips; "+N more" overflow; unscheduled sidebar with drag-to-date assignment; drag-to-reschedule between dates
  - **Task detail** — peek overlay (right half) or modal mode; completed tasks show check icon with strikethrough; status colors consistent across all views
- **LaTeX export** — export project notes to compilable LaTeX with citation management
  - **Citation insertion** — `@` mention to insert paper/website citations as inline author-year chips; context menu with open paper, remove, copy key, copy BibTeX entry
  - **Export modal** — template selection (Article/IEEE/NeurIPS), editable title and author, section reordering for folder exports, cited papers list with auto-generated keys
  - **LaTeX preview** — side-by-side raw `.tex` source with syntax highlighting, live-updating with ~500ms debounce
  - **ZIP download** — `.tex` + `.bib` bundle with all citations resolved; collision-safe keys (`smith2024a`/`smith2024b`)
- **AI experiment gap analysis** — AI-powered detection of missing experiments with a drag-based planning board
  - **Gap detection** — analyzes experiment tree configs and linked paper abstracts to suggest missing baselines, ablation gaps, config sweeps, and replications
  - **Planning board** — suggestion cards on the left (~60%), mini experiment tree on the right (~40%); drag a card onto a tree node to create a planned experiment as a child
  - **Suggestion cards** — compact layout with type badge, name, rationale, config preview, and clickable paper reference chips with inline popover previews
  - **Detail overlay** — edit suggestion name, rationale, and config before promoting; paper references with relevance notes
  - **Dismiss/undo** — dismiss unwanted suggestions with fade animation and undo toast; dismissed suggestions remembered across re-runs

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, pydantic-ai, uv
- **Database:** Supabase (PostgreSQL + Storage)
- **AI:** OpenAI
- **Frontend:** React 18, Vite, React Router v6, Tailwind CSS 3
- **Editor:** tiptap v3 with KaTeX, `@tiptap/extension-table`
- **Graph:** D3.js (note graph view, library map)

## Quick Start

### Prerequisites

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- Node.js 18+ and npm
- A [Supabase](https://supabase.com) project
- An OpenAI API key

### Environment

Create `backend/.env` (never commit this):

```bash
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=sb_publishable_...
```

`SUPABASE_KEY` is the **publishable (anon) key** from your Supabase project settings.

### Database

Open the Supabase SQL editor and run **`backend/migrations/schema.sql`** — this single file creates the complete schema in one shot.

<details>
<summary>Running incremental migrations instead (existing installs)</summary>

If you have an existing database and need to apply changes incrementally, run the numbered files in order:

```
backend/migrations/001_init.sql
backend/migrations/002_add_paper_urls.sql
backend/migrations/002_library_id.sql
backend/migrations/003_notes.sql
backend/migrations/003_add_links.sql
backend/migrations/003_auto_notes.sql
backend/migrations/004_chat_messages.sql
backend/migrations/004_website_notes.sql
backend/migrations/005_paper_texts.sql
backend/migrations/006_chat_suggestions.sql
backend/migrations/007_website_chat.sql
backend/migrations/008_paper_published_date.sql
backend/migrations/009_authors.sql
backend/migrations/010_github_repos.sql
backend/migrations/011_github_repo_notes_chat.sql
backend/migrations/012_library_notes.sql
backend/migrations/013_notes_copilot.sql
backend/migrations/014_pin_notes.sql
backend/migrations/015_projects.sql
backend/migrations/016_project_notes.sql
backend/migrations/017_research_questions.sql
backend/migrations/018_project_github_repos.sql
backend/migrations/019_experiments.sql
backend/migrations/020_project_notes_copilot.sql
backend/migrations/021_task_database.sql
```

</details>

### Running

```bash
# Terminal 1 — backend (port 8000)
cd backend
uv sync
uv run uvicorn app:app --reload --port 8000

# Terminal 2 — frontend (port 5173)
cd frontend
npm install
npm run dev
```

On first startup the backend seeds Supabase with sample data if the tables are empty.

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` to the backend automatically.

## Testing

Run backend tests:

```bash
cd backend
uv run --group dev pytest
```

Run frontend unit/integration tests:

```bash
cd frontend
npm run test:run
```

Run frontend E2E smoke tests (Playwright):

```bash
cd frontend
npx playwright install --with-deps chromium
npm run test:e2e
```

Current test coverage includes:
- **Backend contract + route behavior (pytest):** camelCase payloads, canonical 404 shape, sanitized 500s, papers import/export branches, chat/text branches, notes error mapping, proposal validation
- **Backend service behavior (pytest):** dedup precedence/confidence and semantic-search fallback
- **Frontend API wrapper + page smoke (Vitest/RTL):** API error/response handling, library context, proposals page, library page interactions
- **Frontend E2E smoke (Playwright):** library detail navigation and Quick Add import flow

CI (`.github/workflows/tests.yml`) runs backend tests, frontend tests/build, and Playwright smoke tests on PRs and `main`.

## Routes

| Path | Page |
|------|------|
| `/dashboard` | Activity feed + run stats |
| `/library` | Paper, website, and GitHub repo library with collections, filters, and detail panels |
| `/library/notes` | Library-level Notes IDE with D3 wiki-link graph |
| `/library/map` | Semantic library map — 2D UMAP scatter of all items by embedding similarity |
| `/library/paper/:id` | PDF viewer + Notes IDE + AI Copilot |
| `/library/website/:id` | Live iframe + Notes IDE + AI Copilot + Details |
| `/library/github-repo/:id` | Repo overview + Notes IDE + AI Copilot |
| `/library/settings` | Library settings (rename, AI Auto-Note-Taker, delete) |
| `/agents` | Workflow catalog + active runs with live logs |
| `/proposals` | Agent proposals — approve/reject with diff view |
| `/projects` | Projects list |
| `/projects/:id` | Project overview |
| `/projects/:id/literature` | Project-linked papers |
| `/projects/:id/experiments` | Experiment tree + table + gap analysis |
| `/projects/:id/tasks` | Task database (Kanban / list / calendar) |
| `/projects/:id/notes` | Project notes IDE |
| `/projects/:id/review` | Project review |
| `/authors` | Authors list |
| `/authors/:id` | Author detail |

## API

All routes are prefixed `/api`. Responses are camelCase JSON. See the full API reference below.

<details>
<summary>Full API reference</summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/libraries` | List libraries |
| POST | `/api/libraries` | Create library |
| GET/PATCH/DELETE | `/api/libraries/{id}` | Single library |
| GET/POST | `/api/libraries/{id}/notes` | List / create library-level notes |
| GET/POST/DELETE | `/api/libraries/{id}/notes-copilot` | Notes-page AI copilot — list history, send message (agentic), clear history |
| GET | `/api/papers` | List papers; `?library_id=&collection_id=&status=&search=` |
| POST | `/api/papers` | Create paper |
| GET/PATCH/DELETE | `/api/papers/{id}` | Single paper |
| POST | `/api/papers/import` | Resolve DOI/arXiv/URL/OpenReview/Zenodo and add to library |
| POST | `/api/papers/extract-metadata` | Extract metadata from uploaded PDF via LLM |
| POST | `/api/papers/import-bibtex/parse` | Parse `.bib` file and preview entries with duplicate detection |
| POST | `/api/papers/import-bibtex/confirm` | Confirm BibTeX import with selected entries |
| GET | `/api/papers/export-bibtex` | Export papers/websites as `.bib`; `?ids=&library_id=&collection_id=` |
| GET | `/api/papers/{id}/related` | Related papers via OpenAlex (citation links + semantic neighbors) |
| POST | `/api/papers/{id}/pdf` | Upload PDF (multipart/form-data) |
| POST | `/api/papers/{id}/pdf/fetch` | Download PDF from external URL to Supabase Storage |
| DELETE | `/api/papers/{id}/pdf` | Remove PDF |
| GET/POST | `/api/papers/{id}/notes` | List / create notes for a paper |
| POST | `/api/papers/{id}/notes/generate` | AI-generate notes for a paper |
| GET/POST/DELETE | `/api/papers/{id}/chat` | Copilot chat for a paper |
| GET/POST | `/api/papers/{id}/text` | Get cached / extract PDF text |
| GET/POST | `/api/papers/{id}/authors/link` | List / link authors to a paper |
| DELETE | `/api/papers/{id}/authors/link/{author_id}` | Unlink an author from a paper |
| GET | `/api/websites` | List websites; `?library_id=&collection_id=&status=` |
| POST | `/api/websites` | Create website |
| GET/PATCH/DELETE | `/api/websites/{id}` | Single website |
| POST | `/api/websites/import` | Fetch URL metadata and add to library |
| GET/POST | `/api/websites/{id}/notes` | List / create notes for a website |
| POST | `/api/websites/{id}/notes/generate` | AI-generate notes for a website |
| GET/POST/DELETE | `/api/websites/{id}/chat` | Copilot chat for a website |
| GET | `/api/github-repos` | List GitHub repos |
| POST | `/api/github-repos` | Add a GitHub repo |
| GET/PATCH/DELETE | `/api/github-repos/{id}` | Single GitHub repo |
| GET/POST | `/api/github-repos/{id}/notes` | List / create notes for a GitHub repo |
| POST | `/api/github-repos/{id}/notes/generate` | AI-generate notes for a GitHub repo |
| GET/POST/DELETE | `/api/github-repos/{id}/chat` | Copilot chat for a GitHub repo |
| GET | `/api/collections` | List collections with computed `paperCount` |
| POST | `/api/collections` | Create collection |
| GET/PATCH/DELETE | `/api/collections/{id}` | Single collection |
| GET | `/api/authors` | List authors |
| GET/PATCH/DELETE | `/api/authors/{id}` | Single author |
| GET | `/api/search` | Search across all item types; `?q=&mode=lexical\|semantic&library_id=&types=` |
| GET | `/api/search/map` | UMAP 2D layout for all embedded items in a library; `?library_id=` |
| GET | `/api/workflows` | Workflow catalog (read-only) |
| GET/POST | `/api/runs` | List / start a run |
| GET | `/api/runs/{id}` | Run with logs, trace, and cost |
| GET | `/api/proposals` | List proposals; `?run_id=` |
| POST | `/api/proposals/{id}/approve` | Approve proposal |
| POST | `/api/proposals/{id}/reject` | Reject proposal |
| POST | `/api/proposals/batch` | Batch approve/reject |
| GET | `/api/activity` | Activity feed; `?type=agent\|human` |
| GET | `/api/user` | User profile |
| GET | `/api/projects` | List projects; `?library_id=` |
| POST | `/api/projects` | Create project |
| GET/PATCH/DELETE | `/api/projects/{id}` | Single project |
| GET/POST | `/api/projects/{id}/experiments` | List / create experiments |
| GET/PATCH/DELETE | `/api/experiments/{id}` | Single experiment |
| GET | `/api/projects/{id}/tasks` | List tasks |
| POST | `/api/projects/{id}/tasks` | Create task |
| GET/PATCH/DELETE | `/api/tasks/{id}` | Single task |
| GET/POST | `/api/projects/{id}/task-columns` | List / create task columns |
| PATCH/DELETE | `/api/task-columns/{id}` | Update / delete task column |
| GET/POST | `/api/projects/{id}/task-field-defs` | List / create custom field definitions |
| PATCH/DELETE | `/api/task-field-defs/{id}` | Update / delete custom field definition |
| POST | `/api/projects/{id}/gap-analysis` | Trigger AI gap analysis; returns suggestion cards |
| PATCH/DELETE | `/api/notes/{id}` | Update / delete a note by ID (supports `is_pinned`) |
| GET | `/api/settings/models` | Get current LLM model assignments and available models |
| PATCH | `/api/settings/models` | Update model assignments for one or more roles |

</details>

## Project Structure

```
researchos/
├── backend/
│   ├── app.py              # FastAPI entry point, CORS, seed data, exception handlers
│   ├── agents/             # pydantic-ai agent definitions + shared LLM config
│   ├── models/             # Pydantic domain models (CamelModel-based)
│   ├── services/           # Business logic + all DB and external API access
│   ├── routers/            # FastAPI route handlers (thin, transport-only)
│   └── migrations/         # Numbered SQL migrations for Supabase
├── frontend/
│   └── src/
│       ├── services/api.js       # Single API client; all fetch calls go here
│       ├── context/              # React context (active library + collections)
│       ├── hooks/                # Reusable hooks (e.g. useDragResize)
│       ├── components/           # Shared UI (NotesPanel, CopilotPanel, NotesCopilotPanel, NoteGraphView, etc.)
│       └── pages/                # Route-level components
├── ideas/                  # Feature idea documents
├── ARCHITECTURE.md         # Codebase architecture guide
├── CONTRIBUTING.md         # How to contribute
└── LICENSE                 # MIT
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed walkthrough of the codebase.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) to get started. By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Roadmap

Scoped for a single-user, local research OS (no auth, no collaboration, no multi-tenancy).

### Shipped

- ~~**v1.0 Research Projects & Experiments**~~ — project foundation, research questions, experiment tree with differentiators, CSV loading, table view, project notes IDE
- ~~**v1.1 Research Productivity**~~ — task database (Kanban/list/calendar), LaTeX export with citations, AI experiment gap analysis

### Planned

1. **Library Interchange** — ~~BibTeX import and export~~, ~~duplicate detection~~, RIS/CSL-JSON import and export
2. **Scholarly Discovery** — ~~Related paper discovery via OpenAlex~~, Semantic Scholar and Unpaywall integrations
3. **Literature Review Automation** — prompt-to-collection pipeline, continuous refresh, provider-aware throttling
4. **Search & Retrieval** — ~~hybrid lexical + semantic search~~, full embedding pipeline with persistent index
5. **Notes IDE** — ~~tables~~, ~~note templates~~, ~~pinned notes~~, ~~export (Markdown/PDF)~~, ~~LaTeX export with citations~~, note version history, spaced repetition / flashcard mode, AI synthesis across selected notes
6. **PDF Annotations** — in-document highlights, anchored comments, annotation export
7. **Agent Runtime Hardening** — durable execution, ag-ui-protocol streaming, structured run artifacts
8. **Advanced PDF Processing** — GROBID integration, citation graph from PDFs, section-aware chunking

## License

[MIT](LICENSE)
