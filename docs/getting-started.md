# Getting Started

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11+ | Required for backend |
| uv | latest | Python package manager; replaces pip/venv |
| Node.js | 18+ | Required for frontend |
| npm | bundled with Node | |
| Supabase account | — | Free tier works; provides PostgreSQL + Storage |
| OpenAI API key | — | Used for AI features |

Install uv: https://docs.astral.sh/uv/getting-started/installation/

---

## Step 1: Clone and Configure

```bash
git clone <repo-url>
cd researchos
```

### Backend environment

Create `backend/.env`:

```bash
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

- `SUPABASE_URL`: found in your Supabase project Settings > API > Project URL.
- `SUPABASE_KEY`: the "anon" (publishable) key from Settings > API > Project API keys. Do not use the service role key.

This file is in `.gitignore` and must never be committed.

---

## Step 2: Set Up the Database

Run all migration files in order in the Supabase SQL editor:

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
... (continue through the latest migration file)
```

`001_init.sql` creates all base tables, disables RLS on all tables, and sets up the `pdfs` Storage bucket with public access policies. Each subsequent migration file adds columns, tables, or indexes.

To find the latest migration, list `backend/migrations/` sorted by name.

---

## Step 3: Install Dependencies

### Backend

```bash
cd backend
uv sync
```

This creates a `.venv` and installs all dependencies from `uv.lock`.

### Frontend

```bash
cd frontend
npm install
```

---

## Step 4: Run the Application

Run the backend and frontend in separate terminals.

### Backend (port 8000)

```bash
cd backend
uv run uvicorn app:app --reload --port 8000
```

The `--reload` flag watches for source file changes and restarts automatically.

### Frontend (port 5173)

```bash
cd frontend
npm run dev
```

Vite proxies all `/api` requests to `http://localhost:8000`, so there are no CORS issues in development.

Open http://localhost:5173 in your browser.

---

## First Startup Behavior

On startup, `backend/app.py` calls `seed_data()`. This function checks whether each Supabase table is empty and inserts seed records from a built-in `SEED` dict if so. The seed data creates:

- A default library
- A few sample collections
- A few sample papers (with real arXiv metadata)
- Sample workflow catalog entries

After the first run, seed data is not re-inserted (each check is "empty?" before inserting).

---

## Development Notes

- The Vite proxy in `frontend/vite.config.js` forwards all `/api/*` requests to `http://localhost:8000`. This means you can call `/api/papers` from the browser and it routes to the FastAPI backend.
- Backend auto-reload (`--reload`) restarts on any `.py` file change under `backend/`.
- Frontend HMR (Vite) updates the browser on any `.jsx`/`.js`/`.css` change under `frontend/src/`.
- PDF files are stored in Supabase Storage (`pdfs` bucket). The bucket is created by `001_init.sql`. No local file system is used for PDFs.
- LLM model preferences are persisted to `backend/data/llm_settings.json`. This file is created automatically on first use.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Used for all LLM features: copilot chat, note generation, metadata extraction, agent workflows, embeddings |
| `SUPABASE_URL` | Yes | PostgreSQL + Storage endpoint |
| `SUPABASE_KEY` | Yes | Anon key for client-side Supabase access |

All three must be set in `backend/.env` or in the shell environment before starting the backend. The app calls `python-dotenv` to load `.env` at startup. If a required variable is missing, operations that depend on it will raise a `RuntimeError` with a clear message.
