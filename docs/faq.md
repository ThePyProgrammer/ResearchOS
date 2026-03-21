# FAQ & Troubleshooting

## General Questions

### Is ResearchOS free?

Yes. ResearchOS is MIT-licensed open source software. You run it yourself on your own machine.

There are two external costs:
- **Supabase** — the free tier (500 MB database, 1 GB storage) is sufficient for personal research use. A paid plan is only needed for very large libraries or heavy PDF storage.
- **OpenAI** — you pay for API usage. AI features (copilot, auto-notes, agent workflows) consume tokens billed to your key. Core library, project, and task features work without any API usage. See [Costs & Data Privacy](costs-and-privacy.md) for per-feature estimates.

### Do I need an OpenAI API key?

No. You can run ResearchOS without one. Library management, PDF viewing, manual note editing, BibTeX import/export, projects, experiments, and tasks all work without AI features.

Without an API key:
- AI copilot, auto-note generation, and agent workflows will return errors
- PDF metadata extraction falls back to a manual entry form
- Semantic search falls back to lexical (full-text) search

To add a key later, add `OPENAI_API_KEY=sk-...` to `backend/.env` and restart the backend.

### Can multiple people use the same instance?

ResearchOS is designed for a single user. There is no authentication, no user accounts, and no access control. All data in the Supabase database is shared without isolation.

Multiple people could technically point their browsers at the same backend URL, and they would all see and modify the same data. This can work for a small team that trusts each other and shares a research library, but there is no conflict resolution, no per-user history, and no audit trail of who changed what.

### How do I back up my data?

Your data is in your Supabase project. Supabase provides:
- **Point-in-time recovery** — available on paid plans
- **Database backups** — downloadable from the Supabase dashboard under Settings > Backups
- **Manual export** — use `pg_dump` with your Supabase connection string for a full SQL dump

For PDFs, the `pdfs` Storage bucket can be downloaded or synced via the Supabase Storage API or dashboard.

The `backend/data/` directory on your local machine also contains `activity.json`, `usage.json`, and `llm_settings.json`. Back these up separately if you care about usage history and model preferences.

### Can I use a different LLM provider?

Currently, only OpenAI is supported. The LLM configuration page (Library Settings > LLM Configuration) lets you switch between any OpenAI model for each role (chat, notes, metadata, agent, embeddings), but it does not support other providers such as Anthropic, Google, or local models.

### Why Supabase instead of a local SQLite database?

Supabase provides three things in one hosted package: a PostgreSQL database, a file storage service for PDFs, and the ability to query both from Python and JavaScript clients. The Supabase free tier covers personal use comfortably.

A local SQLite database would eliminate the Supabase dependency but would require a separate solution for PDF storage and would lose full-text search capabilities. Supabase's free tier is generous enough that the tradeoff is worth it for most users.

---

## Setup Problems

### Backend won't start — "OPENAI_API_KEY is not set"

The backend requires `OPENAI_API_KEY` to be set in `backend/.env` even if you don't use AI features. The key is validated at startup.

If you don't have a key or don't want to use AI features, you can set a placeholder value:
```
OPENAI_API_KEY=sk-placeholder
```
AI features will fail gracefully with errors, but the rest of the app will work.

### Backend won't start — Supabase connection error

Check that `SUPABASE_URL` and `SUPABASE_KEY` in `backend/.env` are correct:
- `SUPABASE_URL`: from Supabase dashboard > Settings > API > Project URL (format: `https://<ref>.supabase.co`)
- `SUPABASE_KEY`: the **anon** (publishable) key from Settings > API > Project API keys. Do not use the service role key.

### Database tables missing — "relation does not exist"

You need to run the migration files in the Supabase SQL editor. Open each file in `backend/migrations/` in order (sorted by filename) and paste the contents into the Supabase SQL editor. Start with `001_init.sql` and run each file through to the latest one.

---

## Library & Import

### Papers are not importing

Check the backend terminal for error messages. Common causes:

- **arXiv rate limit** — arXiv limits to one request per 3 seconds and a single concurrent connection. If you import many papers quickly, some may fail. Retry after a few seconds.
- **Crossref rate limit** — Crossref throttles requests from unrecognized clients. The backend uses a polite-pool User-Agent; failures are usually transient.
- **OpenReview unavailable** — OpenReview has periods of downtime. Check their status page.
- **Malformed DOI or arXiv ID** — double-check the identifier. DOIs must start with `10.`, arXiv IDs must match the `YYYY.NNNNN` format.

### PDF is not showing

1. Check that the Supabase `pdfs` storage bucket exists and has public read access. The `001_init.sql` migration creates and configures it. If you're unsure, run that migration again (it uses `IF NOT EXISTS`).
2. Open the paper detail panel and look at the `pdfUrl` field. If it points to an external URL (not containing `/storage/v1/object/public/pdfs/`), the PDF has not been uploaded to Supabase yet. Click **Fetch PDF to Storage** to trigger an upload.
3. If `pdfUrl` is empty, no PDF URL was found on import. You can manually upload a PDF via the paper detail panel.

### Duplicate detection is showing a false positive

ResearchOS uses three-tier matching: DOI (exact), arXiv ID (exact), and normalized title (lowercase, punctuation stripped). Long titles that normalize to the same string can trigger a false match.

Click **Import anyway** on the duplicate warning to force-create the paper despite the match.

---

## Search & Semantic Features

### Search returns no results

- **Lexical search**: searches title, abstract, and full-text notes. If the term doesn't appear in any of these fields, nothing will match.
- **Semantic search**: requires embeddings to be generated first. Embeddings are created on demand when you search. Run any search to trigger embedding generation for new items; the first search may be slower as embeddings are generated.
- If your `OPENAI_API_KEY` is not set or is invalid, semantic search falls back to lexical. Check the backend logs for embedding errors.

### Library Map shows no items

The map requires embeddings for all items. Embeddings are generated lazily (on first search). Run a few searches across different topics first, or wait for the background embedding process to catch up. Reload the map page after a few minutes.

---

## AI Features

### AI features are not working

1. Check that `OPENAI_API_KEY` is set in `backend/.env`.
2. Restart the backend after changing `.env` — the backend loads environment variables at startup.
3. Check the backend terminal for OpenAI error messages (e.g., invalid key, quota exceeded, rate limit).
4. Verify your OpenAI account has sufficient credits.

### The notes copilot seems slow

The project notes copilot runs an agentic loop of up to 6 LLM turns per message. This is intentional — complex requests like "read my existing notes, then write a new summary" require multiple tool calls. Expect 10–30 seconds for complex requests. Simple questions resolve in 1–2 turns and are faster.

### Auto-note generation is using the wrong model

Go to **Library Settings > LLM Configuration** and change the model for the **AI Note Generation** role. The change takes effect immediately for the next generation request.

---

## Projects, Experiments & Tasks

### I can't see the Experiments or Tasks tabs

Experiments and tasks are project-scoped. You must create a project first:
1. Go to **Projects** in the sidebar.
2. Click **New Project**, enter a name, and click **Create**.
3. Navigate into the project to see the Experiments and Tasks tabs.

### Gap analysis returns no suggestions

The gap analyzer needs existing experiments to analyze. If your project's experiment tree is empty, or has only one or two experiments, the model may not find meaningful gaps.

Add more experiments to your tree first — even a simple baseline and one variation gives the model enough to work with. Also make sure you have linked papers to the project (via the Literature tab), as paper abstracts inform what baselines and ablations are expected in the field.

### Experiments I created in gap analysis are not appearing in the tree

After promoting a gap suggestion to the tree by dragging it, the experiment tree refreshes automatically. If it does not appear, manually refresh the page or click the refresh icon in the Experiments toolbar.

---

## BibTeX

### BibTeX import parsed entries incorrectly

BibTeX parsing uses `bibtexparser` v2 with LaTeX decoding. Common issues:

- **Special characters in names or titles** — LaTeX escape sequences like `{\"u}` should decode to `ü`, but malformed entries may not decode cleanly. Inspect the raw `.bib` file and fix encoding issues before importing.
- **Non-standard entry types** — only `@article`, `@inproceedings`, `@misc`, `@book`, `@techreport`, and `@phdthesis` are mapped to ResearchOS fields. Other types are imported with minimal metadata.

### BibTeX export is missing fields

Export maps ResearchOS fields to standard BibTeX fields. Fields that are empty in ResearchOS will be missing from the export. Fill in the relevant metadata (venue, year, DOI) on the paper detail panel before exporting.

---

## CORS and Network Errors

### "Failed to fetch" or CORS errors in the browser

The frontend expects the backend to be running at `http://localhost:8000`. The Vite dev proxy forwards all `/api/*` requests to that address.

Check:
1. The backend is running (`uv run uvicorn app:app --reload --port 8000`)
2. The backend is on port 8000 (not a different port)
3. You are accessing the frontend via `http://localhost:5173` (not a different host or port)

If you run the backend on a different machine or port, update the `server.proxy` entry in `frontend/vite.config.js`.
