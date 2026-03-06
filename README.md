# ResearchOS

An AI-powered research operating system that merges a Zotero-like reference manager with a multi-agent workflow engine. Agents read from and write back to a shared knowledge library with full provenance.

## Features

- **Library management** — import papers via DOI/arXiv ID, organize into nested collections, tag, filter, and search
- **PDF storage** — upload PDFs per paper; stored in Supabase Storage, rendered inline in the browser
- **Paper metadata** — authors, year, venue, abstract, DOI, arXiv ID, GitHub repo, website URL
- **Agent workflows** — run multi-step research workflows (literature review, gap analysis, etc.) powered by OpenAI via pydantic-ai
- **Human-in-the-loop proposals** — agents propose changes (tagging, collection assignment, status updates) that you approve or reject with a diff view
- **Activity feed** — full audit trail of agent and human actions with provenance
- **Live run logs** — monospace terminal viewer for real-time agent execution traces

## Tech Stack

- **Backend:** Python 3.11+, FastAPI + uvicorn, pydantic-ai, uv
- **Database:** Supabase (PostgreSQL + Storage)
- **AI provider:** OpenAI (via `OPENAI_API_KEY`)
- **Frontend:** React 18 + Vite + React Router v6 + Tailwind CSS 3
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

Run `backend/migrations/001_init.sql` in the Supabase SQL editor. This creates all tables, disables RLS, creates the `pdfs` storage bucket, and sets the required storage policies.

If you already have the tables and only need to add the URL columns:

```sql
-- backend/migrations/002_add_paper_urls.sql
ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS github_url  TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT;
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
| `/library/paper/:id` | Paper reader — PDF viewer + metadata + AI panel |
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

## Project Structure

```
researchos/
├── backend/
│   ├── app.py               # FastAPI entry point: CORS, routers, startup seeding
│   ├── pyproject.toml       # Python project + dependency spec
│   ├── uv.lock              # Locked dependencies
│   ├── .env                 # Secrets (never commit)
│   ├── migrations/          # SQL migration files for Supabase
│   ├── models/              # Pydantic domain models (CamelModel → camelCase JSON)
│   ├── services/            # Business logic; all DB access lives here
│   │   ├── db.py            # Supabase client singleton (lru_cache)
│   │   ├── pdf_service.py   # Upload/delete PDFs in Supabase Storage
│   │   └── ...              # paper, collection, workflow, run, proposal, activity
│   └── routers/             # FastAPI routers, one per resource
├── frontend/
│   ├── package.json / vite.config.js / tailwind.config.js
│   └── src/
│       ├── services/api.js  # Fetch wrapper for all API resources
│       ├── components/layout/
│       └── pages/           # Dashboard, Library, Paper, Agents, Proposals
└── CLAUDE.md                # AI agent constitution for this codebase
```
