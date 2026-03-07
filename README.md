# ResearchOS

An AI-powered research operating system that merges a Zotero-like reference manager with a multi-agent workflow engine. Agents read from and write back to a shared knowledge library with full provenance.

## Features

- **Library management** — import papers and websites via DOI/arXiv ID/URL, organize into nested collections with drag-and-drop, rename collections inline, manage collection membership from the detail panel with an autocomplete picker
- **PDF storage** — upload PDFs per paper; stored in Supabase Storage, rendered inline in the browser
- **Paper metadata** — authors, year, venue, abstract, DOI, arXiv ID, GitHub repo, website URL
- **Notes IDE** — per-paper note filesystem with folders and files, powered by a tiptap WYSIWYG editor with LaTeX support (KaTeX), task lists, syntax highlighting, and rich text formatting
- **AI copilot** — context-aware research assistant embedded in the notes IDE; has full access to extracted PDF text, understands your notes, and can suggest diffs (edits to existing notes or new files) that you accept or reject individually
- **PDF text extraction** — automatic PDF-to-markdown conversion via pymupdf4llm, cached in the database for fast copilot access
- **Agent workflows** — run multi-step research workflows (literature review, gap analysis, etc.) powered by OpenAI via pydantic-ai
- **Human-in-the-loop proposals** — agents propose changes (tagging, collection assignment, status updates) that you approve or reject with a diff view
- **Activity feed** — full audit trail of agent and human actions with provenance
- **Live run logs** — monospace terminal viewer for real-time agent execution traces

## Tech Stack

- **Backend:** Python 3.11+, FastAPI + uvicorn, pydantic-ai, uv
- **Database:** Supabase (PostgreSQL + Storage)
- **AI provider:** OpenAI (via `OPENAI_API_KEY`)
- **Frontend:** React 18 + Vite + React Router v6 + Tailwind CSS 3
- **Editor:** tiptap v3 (WYSIWYG) with KaTeX for LaTeX rendering
- **Icons:** Material Symbols Outlined (Google Fonts CDN)
- **Font:** Inter (Google Fonts CDN)

## Prerequisites

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- Node.js 18+ and npm
- A [Supabase](https://supabase.com) project with the schema applied (see below)
- An OpenAI API key

## Environment Setup

Create `backend/.env` (never commit this):

```bash
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=sb_publishable_...
```

`SUPABASE_KEY` is the **publishable (anon) key** from your Supabase project settings.

## Database Setup

Run the migration files in order in the Supabase SQL editor:

```
backend/migrations/001_init.sql          # Tables, RLS, pdfs storage bucket
backend/migrations/002_add_paper_urls.sql # github_url, website_url columns
backend/migrations/003_notes.sql          # Notes table for per-paper note filesystem
backend/migrations/004_chat_messages.sql  # Chat messages table for AI copilot history
backend/migrations/005_paper_texts.sql    # Cached PDF text extraction
backend/migrations/006_chat_suggestions.sql # Suggestions JSONB column on chat_messages
```

## Running

**Terminal 1 — backend (port 8000)**

```bash
cd backend
uv sync
uv run uvicorn app:app --reload --port 8000
```

On first startup the backend seeds the Supabase tables with sample papers, collections, workflows, runs, proposals, and activity if they are empty.

**Terminal 2 — frontend (port 5173)**

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` → `http://localhost:8000`, so no CORS issues in dev.

Open `http://localhost:5173` in your browser.

## Frontend Routes

| Path | Page |
|------|------|
| `/dashboard` | Activity feed + run stats |
| `/library` | Paper library with collections sidebar and detail panel |
| `/library/paper/:id` | Paper reader — PDF viewer + Notes IDE + AI Copilot (3-panel layout) |
| `/agents` | Workflow catalog + active runs with live logs |
| `/proposals` | Agent proposals — approve/reject with diff view |

## API Reference

All routes are prefixed `/api`. Responses are camelCase JSON.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/papers` | List papers; `?collection_id=&status=&search=` |
| POST | `/api/papers` | Create paper |
| GET/PATCH/DELETE | `/api/papers/{id}` | Single paper |
| POST | `/api/papers/{id}/pdf` | Upload PDF (multipart/form-data) |
| DELETE | `/api/papers/{id}/pdf` | Remove PDF |
| GET | `/api/collections` | List collections with computed `paperCount` |
| POST | `/api/collections` | Create collection |
| GET/PATCH/DELETE | `/api/collections/{id}` | Single collection |
| GET | `/api/workflows` | Workflow catalog (read-only) |
| GET | `/api/workflows/{id}` | Single workflow |
| GET/POST | `/api/runs` | List / start a run |
| GET | `/api/runs/{id}` | Run with logs, trace, and cost |
| GET | `/api/proposals` | List proposals; `?run_id=` |
| POST | `/api/proposals/{id}/approve` | Approve proposal |
| POST | `/api/proposals/{id}/reject` | Reject proposal |
| POST | `/api/proposals/batch` | Batch approve/reject |
| GET | `/api/activity` | Activity feed; `?type=agent\|human` |
| GET | `/api/user` | User profile |
| GET/POST | `/api/papers/{id}/notes` | List / create notes for a paper |
| PATCH/DELETE | `/api/notes/{id}` | Update / delete a note |
| GET/POST/DELETE | `/api/papers/{id}/chat` | List / send / clear copilot chat |
| GET/POST | `/api/papers/{id}/text` | Get cached / extract PDF text |

## Project Structure

```
researchos/
├── backend/
│   ├── app.py               # FastAPI entry point: CORS, routers, startup seeding
│   ├── pyproject.toml       # Python project + dependency spec
│   ├── uv.lock              # Locked dependencies
│   ├── .env                 # Secrets (never commit)
│   ├── migrations/          # SQL migration files for Supabase (001–006)
│   ├── models/              # Pydantic domain models (CamelModel → camelCase JSON)
│   │   ├── base.py          # CamelModel: alias_generator=to_camel
│   │   ├── paper.py, collection.py, workflow.py, run.py, proposal.py, activity.py
│   │   ├── note.py          # Note, NoteCreate, NoteUpdate
│   │   └── chat.py          # ChatMessage, ChatMessageCreate, NoteSuggestion
│   ├── services/            # Business logic; all DB access lives here
│   │   ├── db.py            # Supabase client singleton (lru_cache)
│   │   ├── pdf_service.py   # Upload/delete PDFs in Supabase Storage
│   │   ├── pdf_text_service.py  # PDF→markdown extraction via pymupdf4llm
│   │   ├── note_service.py  # CRUD for per-paper notes with recursive folder deletion
│   │   ├── chat_service.py  # AI copilot: OpenAI chat + tool calling for note suggestions
│   │   └── ...              # paper, collection, workflow, run, proposal, activity
│   └── routers/             # FastAPI routers, one per resource
│       ├── notes.py         # Notes CRUD endpoints
│       ├── chat.py          # Copilot chat + PDF text extraction endpoints
│       └── ...              # papers, collections, workflows, runs, proposals, activity
├── frontend/
│   ├── package.json / vite.config.js / tailwind.config.js
│   └── src/
│       ├── services/api.js  # Fetch wrapper: papersApi, collectionsApi, notesApi, chatApi
│       ├── components/
│       │   ├── layout/      # Layout, Sidebar (drag-drop collections + items), Header
│       │   ├── PaperInfoPanel.jsx   # Paper/website metadata + CollectionsPicker
│       │   ├── NotesPanel.jsx       # tiptap WYSIWYG note editor with file tree
│       │   └── CopilotPanel.jsx     # AI copilot with diff-based note suggestions
│       ├── context/
│       │   └── LibraryContext.jsx  # Library + collection state provider
│       └── pages/           # Dashboard, Library, Paper, Agents, Proposals
└── CLAUDE.md                # AI agent constitution for this codebase
```
