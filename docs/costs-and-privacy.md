# Costs & Data Privacy

## Data Storage

All your data lives in **your own Supabase instance**. There are no ResearchOS servers; the application is a self-hosted backend (FastAPI) and frontend (React) that you run on your own machine.

- **Database** — PostgreSQL hosted in your Supabase project. Papers, websites, GitHub repos, collections, libraries, projects, experiments, tasks, notes, and chat history are all stored there.
- **PDFs** — stored in the `pdfs` Storage bucket inside your Supabase project. The bucket is created by the first migration file and configured with public read access (so the frontend can fetch PDFs directly).
- **LLM settings** — persisted to `backend/data/llm_settings.json` on the machine running the backend. Not stored in Supabase.
- **Activity feed and usage stats** — written to `backend/data/activity.json` and `backend/data/usage.json` on disk.

No telemetry, no analytics, no data is sent to any ResearchOS server — there isn't one.

---

## What Goes to OpenAI

The following features make API calls to OpenAI. Each call sends the relevant content (paper text, notes, chat history) to OpenAI and is billed against your API key.

### AI Auto-Note-Taker

Sends to OpenAI: paper title, abstract, and (if available) full PDF text extracted from Supabase Storage.

Returns: a structured JSON tree of note files (3–8 files inside an "AI Notes" folder). Uses the `notes` model role (default: `gpt-4o-mini`).

Triggered automatically when:
- A paper is imported and has a PDF URL (e.g., arXiv papers)
- A PDF is uploaded to an existing paper
- You click "Generate AI Notes" manually

Can be disabled per-library in **Library Settings**.

### AI Copilot (paper / website / GitHub repo)

Sends to OpenAI: paper/website/repo metadata, full PDF text if available (paper copilot only), the notes filesystem tree with note content (up to 2000 chars per note), and the last 20 turns of chat history.

Each message is a **single LLM call** (non-agentic). Uses the `chat` model role (default: `gpt-4o-mini`).

### Project Notes Copilot (agentic loop)

Sends to OpenAI: the user message, selected `@`-mention context items (with their notes and optionally PDF text), and chat history.

Runs an **agentic loop of up to 6 LLM calls per message** to read notes and generate suggestions. Uses the `chat` model role (default: `gpt-4o-mini`).

This is the most token-intensive copilot variant because each turn in the loop sends the full context plus accumulated tool results.

### Library Notes Copilot

Sends to OpenAI: the user message, selected `@`-mention context items (with their notes), and chat history.

Single LLM call per message. Uses the `chat` model role.

### PDF Metadata Extraction

Sends to OpenAI: the extracted text of the first three pages of the uploaded PDF (up to 8,000 characters).

Returns: title, authors, date, venue, abstract, and DOI. Single LLM call on PDF upload. Uses the `metadata` model role (default: `gpt-4o-mini`).

### Agent Workflows

All three agent workflows make multiple LLM calls:

- **Literature Reviewer**: 1 query-generation call (light), N screening calls in batches of 15 (light). Typically 3–6 total LLM calls.
- **Model Researcher**: 1 task analysis call (high-tier), N screening calls (light), 1 synthesis report call (high-tier). Typically 4–8 total calls.
- **Experiment Designer**: 1 goal extraction (high-tier), 1 idea generation (high-tier), 1 design (high-tier), 1–2 critique calls (high-tier), 1 code generation (high-tier). Typically 5–8 total calls.

High-tier steps use the `agent` model role (default: `gpt-4o`). Light steps use `agent_light` (default: `gpt-4o-mini`).

### Gap Analysis

Sends to OpenAI: a serialized representation of your experiment tree (up to 80 experiments, with names, statuses, configs, and metrics) and paper abstracts (up to 20 papers, 300 chars each).

Single LLM call. Uses the `agent` model role (default: `gpt-4o`).

### Semantic Search Embeddings

Sends to OpenAI: the title and abstract of each item when it is first searched or when embeddings are requested.

Embeddings are cached in the database after the first generation — the same item is never re-embedded. Uses the `embedding` model role (default: `text-embedding-3-small`).

---

## What Does NOT Go to OpenAI

The following operations are purely local Supabase reads and writes. No LLM calls are made:

- Viewing and editing paper/website/repo metadata
- PDF viewing (blob fetched from Supabase Storage)
- Creating, editing, or deleting notes manually
- Creating, editing, or deleting tasks
- Creating, editing, or deleting experiments
- Managing collections (create, rename, delete, add items)
- Managing libraries (create, rename, delete)
- BibTeX import and export
- Managing projects and research questions
- Author browsing
- Activity feed viewing

---

## Cost Estimates

The following are rough estimates based on typical content lengths and default model assignments. Actual costs depend on how long your papers are, how many notes you have, and which models you configure.

| Feature | Model | Estimated cost |
|---|---|---|
| Auto-note generation | gpt-4o-mini | $0.01–0.03 per paper |
| Copilot chat (item) | gpt-4o-mini | $0.01–0.05 per message |
| Copilot chat (project, agentic) | gpt-4o-mini | $0.05–0.15 per message (up to 6 turns) |
| PDF metadata extraction | gpt-4o-mini | ~$0.01 per upload |
| Agent workflow (Literature Reviewer) | mixed | $0.05–0.20 per run |
| Agent workflow (Experiment Designer) | mostly gpt-4o | $0.20–0.50 per run |
| Gap analysis | gpt-4o | $0.05–0.10 per analysis |
| Semantic search embedding | text-embedding-3-small | ~$0.0001 per item (cached, one-time) |

These estimates assume paper abstracts of ~300 words, note files of ~500 words, and an average conversation history of 5 turns. Long PDFs or large note sets will increase costs.

The Dashboard shows lifetime token usage and estimated spend, pulled from `backend/data/usage.json`.

---

## Reducing Costs

**Disable auto-note generation** — go to Library Settings and turn off "AI Auto-Note-Taker". Notes will no longer be generated automatically on import or PDF upload. You can still trigger generation manually per item.

**Switch to cheaper models** — navigate to **Library Settings > LLM Configuration**. Each model role can be set independently:
- Use `gpt-4o-mini` for `agent` and `agent_light` roles to reduce agent workflow costs significantly, at the expense of output quality.
- The `chat` and `notes` roles default to `gpt-4o-mini` and are already cost-efficient.
- For the `embedding` role, `text-embedding-3-small` is already the cheapest OpenAI embedding model.

**Embeddings are cached** — an item is only embedded once. Re-running searches does not re-embed items.

**Limit context in the project copilot** — every `@`-mention item adds tokens. Only include the items most relevant to your query.

---

## Using ResearchOS Without an OpenAI Key

All core library and project management features work without an `OPENAI_API_KEY`:

| Works without OpenAI | Does not work without OpenAI |
|---|---|
| Import papers by DOI, arXiv ID, URL | AI Auto-Note-Taker |
| PDF upload and viewing | AI Copilot (all variants) |
| Manual note editing | PDF metadata extraction (falls back to manual entry) |
| BibTeX import and export | Agent workflows |
| Collections and libraries | Gap analysis |
| Projects, research questions | Semantic search (falls back to lexical search) |
| Experiments and tasks | Author enrichment |
| LaTeX export | |
| Activity feed | |

If `OPENAI_API_KEY` is not set, AI features will return errors. The backend logs a clear message at startup. Lexical search continues to work via PostgreSQL full-text matching.

---

## External API Calls

The following external APIs are called during paper import. These are free public APIs that do not require API keys (except your own OpenAI key for AI features):

| Service | When called | What is sent |
|---|---|---|
| Crossref | DOI import | The DOI string |
| arXiv API | arXiv import | The arXiv ID |
| OpenReview API | OpenReview URL import | The paper ID from the URL |
| Zenodo API | Zenodo URL import | The record ID from the URL |
| OpenAlex | Related paper discovery | Paper DOI or OpenAlex ID |

These calls retrieve metadata (titles, authors, abstracts, PDF URLs) and are not billed. They are subject to the rate limits of each provider. No authentication is required for any of these services.
