# ResearchOS

An AI-powered research operating system that merges a Zotero-like reference manager with a multi-agent workflow engine. Agents read from and write back to a shared knowledge library with full provenance.

## Features

- **Library management** — import papers and websites via DOI/arXiv ID/URL, organize into nested collections with drag-and-drop, rename collections inline, manage collection membership from the detail panel with an autocomplete picker
- **Multiple libraries** — create and switch between independent libraries; active library persisted to localStorage
- **Websites as first-class items** — blog posts, articles, and any URL live alongside papers in the library with their own metadata (domain, published date, description, GitHub URL, named links), displayed with teal accent color
- **PDF storage** — upload PDFs per paper; stored in Supabase Storage, rendered inline in the browser
- **Paper metadata** — authors, year, venue, abstract, DOI, arXiv ID, GitHub repo, website URL, named links
- **Notes IDE** — per-item (paper and website) note filesystem with folders and files, powered by a tiptap WYSIWYG editor with LaTeX support (KaTeX), task lists, syntax highlighting, and rich text formatting
- **AI Auto-Note-Taker** — per-library setting (enable/disable + custom prompt); generates a structured "AI Overview" note for any paper or website with one click using `gpt-4o-mini`; uses cached PDF text when available
- **AI copilot** — context-aware research assistant embedded in the notes IDE for both papers and websites; has full access to extracted PDF text (papers) or website metadata (websites), understands your notes, and can suggest diffs (edits to existing notes or new files) that you accept or reject individually
- **PDF text extraction** — automatic PDF-to-markdown conversion via pymupdf4llm, cached in the database for fast copilot access
- **Website viewer** — `/library/website/:id` renders the live site in an iframe alongside the Notes IDE, AI Copilot, and a Details panel; falls back gracefully when the site blocks embedding
- **Library settings page** — rename library, configure AI Auto-Note-Taker (toggle + custom prompt), delete library with name-confirmation guard
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
backend/migrations/001_init.sql              # Tables, RLS, pdfs storage bucket
backend/migrations/002_add_paper_urls.sql    # github_url, website_url on papers
backend/migrations/002_library_id.sql        # library_id on papers, collections, websites
backend/migrations/003_notes.sql             # notes table for per-item note filesystem
backend/migrations/003_add_links.sql         # links JSONB column on papers and websites
backend/migrations/003_auto_notes.sql        # auto_note_enabled, auto_note_prompt on libraries
backend/migrations/004_chat_messages.sql     # chat_messages table for AI copilot history
backend/migrations/004_website_notes.sql     # website_id on notes, paper_id made nullable
backend/migrations/005_paper_texts.sql       # paper_texts table for cached PDF extraction
backend/migrations/006_chat_suggestions.sql  # suggestions JSONB column on chat_messages
backend/migrations/007_website_chat.sql      # website_id on chat_messages, paper_id made nullable
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
| `/library` | Paper + website library with collections sidebar, filter panel, and detail panel |
| `/library/paper/:id` | Paper reader — PDF viewer + Notes IDE + AI Copilot |
| `/library/website/:id` | Website viewer — live iframe + Notes IDE + AI Copilot + Details panel |
| `/library/settings` | Library settings — rename, AI Auto-Note-Taker config, delete |
| `/agents` | Workflow catalog + active runs with live logs |
| `/proposals` | Agent proposals — approve/reject with diff view |

## API Reference

All routes are prefixed `/api`. Responses are camelCase JSON.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/libraries` | List libraries |
| POST | `/api/libraries` | Create library |
| GET/PATCH/DELETE | `/api/libraries/{id}` | Single library |
| GET | `/api/papers` | List papers; `?library_id=&collection_id=&status=&search=` |
| POST | `/api/papers` | Create paper |
| GET/PATCH/DELETE | `/api/papers/{id}` | Single paper |
| POST | `/api/papers/import` | Resolve DOI/arXiv/URL and add to library |
| POST | `/api/papers/{id}/pdf` | Upload PDF (multipart/form-data) |
| DELETE | `/api/papers/{id}/pdf` | Remove PDF |
| GET | `/api/websites` | List websites; `?library_id=&collection_id=&status=` |
| POST | `/api/websites` | Create website |
| GET/PATCH/DELETE | `/api/websites/{id}` | Single website |
| POST | `/api/websites/import` | Fetch URL metadata and add to library |
| GET | `/api/collections` | List collections with computed `paperCount` |
| POST | `/api/collections` | Create collection |
| GET/PATCH/DELETE | `/api/collections/{id}` | Single collection |
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
| POST | `/api/papers/{id}/notes/generate` | AI-generate an overview note for a paper |
| POST | `/api/websites/{id}/notes/generate` | AI-generate an overview note for a website |
| PATCH/DELETE | `/api/notes/{id}` | Update / delete a note |
| GET/POST/DELETE | `/api/papers/{id}/chat` | List / send / clear copilot chat for a paper |
| GET/POST/DELETE | `/api/websites/{id}/chat` | List / send / clear copilot chat for a website |
| GET/POST | `/api/papers/{id}/text` | Get cached / extract PDF text |

## Project Structure

```
researchos/
├── backend/
│   ├── app.py               # FastAPI entry point: CORS, routers, startup seeding
│   ├── pyproject.toml       # Python project + dependency spec
│   ├── uv.lock              # Locked dependencies
│   ├── .env                 # Secrets (never commit)
│   ├── migrations/          # SQL migration files for Supabase (run in order)
│   ├── models/              # Pydantic domain models (CamelModel → camelCase JSON)
│   │   ├── base.py          # CamelModel: alias_generator=to_camel
│   │   ├── paper.py         # Paper, NamedLink, AgentRunRef, PaperCreate, PaperUpdate
│   │   ├── website.py       # Website, WebsiteCreate, WebsiteUpdate
│   │   ├── library.py       # Library, LibraryCreate, LibraryUpdate (auto_note_* fields)
│   │   ├── collection.py, workflow.py, run.py, proposal.py, activity.py
│   │   ├── note.py          # Note (paper_id or website_id), NoteCreate, NoteUpdate
│   │   └── chat.py          # ChatMessage, ChatMessageCreate
│   ├── services/            # Business logic; all DB access lives here
│   │   ├── db.py            # Supabase client singleton (lru_cache)
│   │   ├── pdf_service.py   # Upload/delete PDFs in Supabase Storage
│   │   ├── pdf_text_service.py  # PDF→markdown extraction via pymupdf4llm
│   │   ├── import_service.py    # Resolve DOI/arXiv/URL metadata + website og:* extraction
│   │   ├── note_service.py      # CRUD + AI generation for paper and website notes
│   │   ├── chat_service.py      # AI copilot: OpenAI chat + tool calling for note suggestions
│   │   └── ...              # paper, website, library, collection, workflow, run, proposal, activity
│   └── routers/             # FastAPI routers, one per resource
│       ├── papers.py        # Papers CRUD + import + PDF upload
│       ├── websites.py      # Websites CRUD + import
│       ├── libraries.py     # Libraries CRUD
│       ├── notes.py         # Notes for papers and websites + AI generation
│       ├── chat.py          # Copilot chat + PDF text extraction
│       └── ...              # collections, workflows, runs, proposals, activity, search
├── frontend/
│   ├── package.json / vite.config.js / tailwind.config.js / postcss.config.js
│   ├── index.html
│   └── src/
│       ├── services/
│       │   └── api.js       # Fetch wrapper: papersApi, websitesApi, librariesApi,
│       │                    #   collectionsApi, notesApi, chatApi, searchApi, ...
│       ├── context/
│       │   └── LibraryContext.jsx  # Active library, collections, CRUD, localStorage persistence
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Layout.jsx   # Shell (Sidebar + Header + Outlet)
│       │   │   ├── Sidebar.jsx  # Library switcher, collections tree (rename, drag-drop, item drops)
│       │   │   └── Header.jsx   # Search, QuickAdd modal (paper/website toggle)
│       │   ├── PaperInfoPanel.jsx  # Paper metadata + NamedLinks + CollectionsPicker
│       │   ├── NotesPanel.jsx      # tiptap WYSIWYG note editor with file tree (generic: paper or website)
│       │   └── CopilotPanel.jsx    # AI copilot with diff-based note suggestions
│       └── pages/
│           ├── Dashboard.jsx       # Activity feed + run stats + papers-over-time chart (cumulative/daily)
│           ├── Library.jsx         # Unified paper/website table + PaperDetail + WebsiteDetail
│           ├── Paper.jsx           # PDF viewer + Notes IDE + AI Copilot
│           ├── Website.jsx         # Live iframe + Notes IDE + AI Copilot + Details panel
│           ├── LibrarySettings.jsx # Rename library, AI Auto-Note-Taker, delete
│           ├── Agents.jsx          # Workflow catalog + active runs
│           └── Proposals.jsx       # Agent proposals approve/reject
└── CLAUDE.md                # AI agent constitution for this codebase
```
