# ResearchOS

[![Tests](https://github.com/prannvat/researchos/actions/workflows/tests.yml/badge.svg)](https://github.com/prannvat/researchos/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Node 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)

An AI-powered research operating system that merges a Zotero-like reference manager with a multi-agent workflow engine. Agents read from and write back to a shared knowledge library with full provenance.

## Features

- **Library management** — import papers and websites via DOI, arXiv ID, URL, OpenReview, or Zenodo; organize into nested collections with drag-and-drop
- **Multiple libraries** — create and switch between independent libraries
- **Websites as first-class items** — blog posts, articles, and any URL live alongside papers with their own metadata
- **GitHub repos as first-class items** — track repositories alongside papers and websites
- **BibTeX import/export** — bulk-import `.bib` files with a two-phase preview/confirm flow; export papers and websites as `.bib` with a tree-view editor for reviewing and editing entries before download
- **Duplicate detection** — centralized three-tier dedup (DOI, arXiv ID, normalized title) across all import paths: identifier import, PDF upload, and BibTeX import; surfaces warnings with "Import anyway" option
- **PDF upload with metadata extraction** — drag-and-drop PDFs; LLM-powered extraction of title, authors, date, venue, abstract, and DOI
- **PDF storage** — stored in Supabase Storage, rendered inline; auto-downloaded from source on import
- **Notes IDE** — per-item note filesystem with folders and files, powered by a tiptap WYSIWYG editor with LaTeX support
- **AI Auto-Note-Taker** — generates a multi-file note structure for any paper or website; auto-runs on import and PDF upload
- **AI copilot** — context-aware research assistant that can suggest diffs to your notes
- **Agent workflows** — multi-step research workflows (literature review, gap analysis, etc.) powered by OpenAI via pydantic-ai
- **Human-in-the-loop proposals** — agents propose changes that you approve or reject with a diff view
- **Authors** — first-class author entities with fuzzy name matching across papers
- **Activity feed** — full audit trail of agent and human actions

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, pydantic-ai, uv
- **Database:** Supabase (PostgreSQL + Storage)
- **AI:** OpenAI
- **Frontend:** React 18, Vite, React Router v6, Tailwind CSS 3
- **Editor:** tiptap v3 with KaTeX

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

Run the migration files in order in the Supabase SQL editor:

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
```

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
| `/library` | Paper + website library with collections, filters, and detail panels |
| `/library/paper/:id` | PDF viewer + Notes IDE + AI Copilot |
| `/library/website/:id` | Live iframe + Notes IDE + AI Copilot + Details |
| `/library/settings` | Library settings (rename, AI Auto-Note-Taker, delete) |
| `/agents` | Workflow catalog + active runs with live logs |
| `/proposals` | Agent proposals — approve/reject with diff view |
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
| GET | `/api/papers` | List papers; `?library_id=&collection_id=&status=&search=` |
| POST | `/api/papers` | Create paper |
| GET/PATCH/DELETE | `/api/papers/{id}` | Single paper |
| POST | `/api/papers/import` | Resolve DOI/arXiv/URL/OpenReview/Zenodo and add to library |
| POST | `/api/papers/extract-metadata` | Extract metadata from uploaded PDF via LLM |
| POST | `/api/papers/import-bibtex/parse` | Parse `.bib` file and preview entries with duplicate detection |
| POST | `/api/papers/import-bibtex/confirm` | Confirm BibTeX import with selected entries |
| GET | `/api/papers/export-bibtex` | Export papers/websites as `.bib`; `?ids=&library_id=&collection_id=` |
| POST | `/api/papers/{id}/pdf` | Upload PDF (multipart/form-data) |
| POST | `/api/papers/{id}/pdf/fetch` | Download PDF from external URL to Supabase Storage |
| DELETE | `/api/papers/{id}/pdf` | Remove PDF |
| GET | `/api/websites` | List websites; `?library_id=&collection_id=&status=` |
| POST | `/api/websites` | Create website |
| GET/PATCH/DELETE | `/api/websites/{id}` | Single website |
| POST | `/api/websites/import` | Fetch URL metadata and add to library |
| GET | `/api/collections` | List collections with computed `paperCount` |
| POST | `/api/collections` | Create collection |
| GET/PATCH/DELETE | `/api/collections/{id}` | Single collection |
| GET | `/api/authors` | List authors |
| GET/PATCH/DELETE | `/api/authors/{id}` | Single author |
| GET | `/api/github-repos` | List GitHub repos |
| POST | `/api/github-repos` | Add a GitHub repo |
| GET/PATCH/DELETE | `/api/github-repos/{id}` | Single GitHub repo |
| GET | `/api/workflows` | Workflow catalog (read-only) |
| GET/POST | `/api/runs` | List / start a run |
| GET | `/api/runs/{id}` | Run with logs, trace, and cost |
| GET | `/api/proposals` | List proposals; `?run_id=` |
| POST | `/api/proposals/{id}/approve` | Approve proposal |
| POST | `/api/proposals/{id}/reject` | Reject proposal |
| POST | `/api/proposals/batch` | Batch approve/reject |
| GET | `/api/activity` | Activity feed; `?type=agent\|human` |
| GET | `/api/user` | User profile |
| GET/POST | `/api/papers/{id}/notes` | List / create notes for a paper |
| GET/POST | `/api/websites/{id}/notes` | List / create notes for a website |
| POST | `/api/papers/{id}/notes/generate` | AI-generate notes for a paper |
| POST | `/api/websites/{id}/notes/generate` | AI-generate notes for a website |
| PATCH/DELETE | `/api/notes/{id}` | Update / delete a note |
| GET/POST/DELETE | `/api/papers/{id}/chat` | Copilot chat for a paper |
| GET/POST/DELETE | `/api/websites/{id}/chat` | Copilot chat for a website |
| GET/POST | `/api/papers/{id}/text` | Get cached / extract PDF text |

</details>

## Project Structure

```
researchos/
├── backend/
│   ├── app.py              # FastAPI entry point
│   ├── models/             # Pydantic domain models
│   ├── services/           # Business logic + DB access
│   ├── routers/            # FastAPI route handlers
│   ├── agents/             # pydantic-ai agent definitions
│   └── migrations/         # SQL migrations for Supabase
├── frontend/
│   └── src/
│       ├── services/api.js # API client
│       ├── context/        # React context (active library)
│       ├── components/     # Shared UI (NotesPanel, CopilotPanel, etc.)
│       └── pages/          # Route components
├── ARCHITECTURE.md         # Codebase architecture guide
├── CONTRIBUTING.md         # How to contribute
└── LICENSE                 # MIT
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed walkthrough of the codebase.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) to get started. By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Roadmap

Scoped for a single-user, local research OS (no auth, no collaboration, no multi-tenancy).

1. **Library Interchange** — ~~BibTeX import and export~~, ~~duplicate detection~~, RIS/CSL-JSON import and export (planned)
2. **Scholarly Discovery** — OpenAlex, Semantic Scholar, and Unpaywall integrations
3. **Literature Review Automation** — prompt-to-collection pipeline, continuous refresh, provider-aware throttling
4. **Search & Retrieval** — hybrid full-text + vector search, embedding pipeline
5. **PDF Annotations** — in-document highlights, anchored comments, annotation export
6. **Agent Runtime Hardening** — durable execution, ag-ui-protocol streaming, structured run artifacts
7. **Advanced PDF Processing** — GROBID integration, citation graph from PDFs, section-aware chunking

## License

[MIT](LICENSE)
