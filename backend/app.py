import logging
import sys
from pathlib import Path

# Load .env before any service imports so OPENAI_API_KEY is available
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass  # python-dotenv not installed; rely on shell environment

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure backend/ is on the path so relative imports work
sys.path.insert(0, str(Path(__file__).parent))

from routers import papers, collections, workflows, runs, proposals, activity, search, libraries, websites, notes, chat, authors, github_repos, settings, notes_copilot, usage, projects, research_questions, experiments, project_notes_copilot, tasks, gap_analysis, batch
from services.db import get_client

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="ResearchOS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(libraries.router)
app.include_router(papers.router)
app.include_router(websites.router)
app.include_router(github_repos.router)
app.include_router(collections.router)
app.include_router(workflows.router)
app.include_router(runs.router)
app.include_router(proposals.router)
app.include_router(activity.router)
app.include_router(search.router)
app.include_router(notes.router)
app.include_router(chat.router)
app.include_router(authors.router)
app.include_router(settings.router)
app.include_router(notes_copilot.router)
app.include_router(usage.router)
app.include_router(projects.router)
app.include_router(research_questions.router)
app.include_router(experiments.router)
app.include_router(project_notes_copilot.router)
app.include_router(tasks.router)
app.include_router(gap_analysis.router)
app.include_router(batch.router)


@app.get("/api/user")
async def get_user():
    return JSONResponse({"name": "Dr. Researcher", "org": "Lab Alpha", "initials": "DR"})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if exc.status_code == 404:
        if isinstance(detail, dict):
            return JSONResponse(
                status_code=404,
                content={
                    "error": str(detail.get("error", "not_found")),
                    "detail": str(detail.get("detail", "Not found")),
                },
            )
        return JSONResponse(
            status_code=404,
            content={"error": "not_found", "detail": str(detail or "Not found")},
        )

    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": "An unexpected error occurred."},
    )


# ---------------------------------------------------------------------------
# Seed data — written once on first startup if data files are missing
# ---------------------------------------------------------------------------

SEED: dict[str, list] = {
    "libraries.json": [
        {
            "id": "lib_default",
            "name": "My Library",
            "description": "Default research library",
            "created_at": "2024-01-01T00:00:00Z",
        },
    ],
    "papers.json": [
        {
            "id": "p1",
            "title": "Attention Is All You Need",
            "authors": ["Vaswani, A.", "Shazeer, N.", "Parmar, N.", "Uszkoreit, J."],
            "year": 2017,
            "venue": "NeurIPS",
            "doi": "10.48550/arXiv.1706.03762",
            "arxiv_id": "1706.03762",
            "status": "read",
            "tags": ["transformers", "attention", "nlp"],
            "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
            "source": "human",
            "agent_run": None,
            "relevance_score": None,
            "agent_reasoning": None,
            "rejected": False,
            "collections": ["c1", "c2"],
            "pdf_url": None,
            "library_id": "lib_default",
            "created_at": "2024-01-01T00:00:00Z",
        },
        {
            "id": "p2",
            "title": "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation",
            "authors": ["Wu, Q.", "Bansal, G.", "Zhang, J.", "Wu, Y.", "Li, B."],
            "year": 2023,
            "venue": "arXiv",
            "doi": None,
            "arxiv_id": "2308.08155",
            "status": "to-read",
            "tags": ["llm", "framework", "multi-agent"],
            "abstract": "We present AutoGen, an open-source framework that allows developers to build LLM applications via multiple agents that can converse with each other to accomplish tasks. AutoGen agents are customizable, conversable, and seamlessly allow human participation.",
            "source": "agent",
            "agent_run": {"id": "wrk_7a9b2c", "name": "Research Planner Agent", "run_number": 42},
            "relevance_score": 98,
            "agent_reasoning": "Directly addresses multi-agent coordination patterns, highly cited (2023), foundational for understanding AutoGen framework architecture.",
            "rejected": False,
            "collections": ["c3"],
            "pdf_url": None,
            "library_id": "lib_default",
            "created_at": "2024-01-02T00:00:00Z",
        },
        {
            "id": "p3",
            "title": "ChatDev: Communicative Agents for Software Development",
            "authors": ["Qian, C.", "Cong, X.", "Yang, C.", "Chen, W.", "Su, Y."],
            "year": 2024,
            "venue": "ACL",
            "doi": None,
            "arxiv_id": "2307.07924",
            "status": "to-read",
            "tags": ["llm", "framework", "software-engineering"],
            "abstract": "Software development is a complex task that poses challenges for software engineers. In this paper, we present ChatDev, a virtual chat-powered software company that conducts software development through unified language-based communication.",
            "source": "agent",
            "agent_run": {"id": "wrk_7a9b2c", "name": "Research Planner Agent", "run_number": 42},
            "relevance_score": 92,
            "agent_reasoning": "Demonstrates role-based multi-agent systems in a concrete software development context; highly relevant to agent coordination patterns.",
            "rejected": False,
            "collections": ["c3"],
            "pdf_url": None,
            "library_id": "lib_default",
            "created_at": "2024-01-03T00:00:00Z",
        },
        {
            "id": "p4",
            "title": "Generative Agents: Interactive Simulacra of Human Behavior",
            "authors": ["Park, J.S.", "O'Brien, J.C.", "Cai, C.J.", "Morris, M.R."],
            "year": 2023,
            "venue": "UIST",
            "doi": "10.1145/3586183.3606763",
            "arxiv_id": "2304.03442",
            "status": "inbox",
            "tags": ["agents", "simulation", "llm"],
            "abstract": "Believable proxies of human behavior can empower interactive applications ranging from immersive environments to rehearsal spaces for interpersonal communication to prototyping tools. In this paper, we introduce generative agents—computational software agents that simulate believable human behavior.",
            "source": "agent",
            "agent_run": {"id": "wrk_7a9b2c", "name": "Research Planner Agent", "run_number": 42},
            "relevance_score": 78,
            "agent_reasoning": "Relevant to agent memory and planning but focus is simulation rather than research workflows.",
            "rejected": True,
            "collections": [],
            "pdf_url": None,
            "library_id": "lib_default",
            "created_at": "2024-01-04T00:00:00Z",
        },
        {
            "id": "p5",
            "title": "RLHF: Training Language Models to Follow Instructions with Human Feedback",
            "authors": ["Ouyang, L.", "Wu, J.", "Jiang, X."],
            "year": 2022,
            "venue": "NeurIPS",
            "doi": "10.48550/arXiv.2203.02155",
            "arxiv_id": "2203.02155",
            "status": "read",
            "tags": ["rlhf", "llm", "alignment"],
            "abstract": "Making language models bigger does not inherently make them better at following a user's intent. A language model trained on next-word prediction may generate toxic, biased, or unhelpful content. We show an avenue for aligning language models with user intent on a wide range of tasks.",
            "source": "human",
            "agent_run": None,
            "relevance_score": None,
            "agent_reasoning": None,
            "rejected": False,
            "collections": ["c2"],
            "pdf_url": None,
            "library_id": "lib_default",
            "created_at": "2024-01-05T00:00:00Z",
        },
        {
            "id": "p6",
            "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
            "authors": ["Lewis, P.", "Perez, E.", "Piktus, A."],
            "year": 2020,
            "venue": "NeurIPS",
            "doi": "10.48550/arXiv.2005.11401",
            "arxiv_id": "2005.11401",
            "status": "to-read",
            "tags": ["rag", "retrieval", "nlp"],
            "abstract": "Large pre-trained language models have been shown to store factual knowledge in their parameters, and achieve state-of-the-art results when fine-tuned on downstream NLP tasks. However, their ability to access and precisely manipulate knowledge is still limited.",
            "source": "human",
            "agent_run": None,
            "relevance_score": None,
            "agent_reasoning": None,
            "rejected": False,
            "collections": ["c1"],
            "pdf_url": None,
            "library_id": "lib_default",
            "created_at": "2024-01-06T00:00:00Z",
        },
    ],
    "collections.json": [
        {"id": "c1", "name": "ML / Transformers", "parent_id": None, "type": "folder", "paper_count": 0, "library_id": "lib_default"},
        {"id": "c2", "name": "RLHF", "parent_id": "c1", "type": "folder", "paper_count": 0, "library_id": "lib_default"},
        {"id": "c3", "name": "Multi-Agent Systems", "parent_id": None, "type": "folder", "paper_count": 0, "library_id": "lib_default"},
        {"id": "c4", "name": "RAG Optimization", "parent_id": None, "type": "folder", "paper_count": 0, "library_id": "lib_default"},
        {"id": "c5", "name": "Run #42: Lit Review", "parent_id": None, "type": "agent-output", "paper_count": 0, "library_id": "lib_default"},
    ],
    "workflows.json": [
        {
            "id": "wf1",
            "name": "Literature Reviewer",
            "description": "Generates a comprehensive literature review from a research topic prompt. Searches arXiv and OpenAlex, screens candidates with an LLM, and proposes a curated collection.",
            "icon": "menu_book",
            "icon_color": "text-blue-500",
            "icon_bg": "bg-blue-50",
            "status": "stable",
            "steps": ["Query Gen", "Retrieve", "Screen", "Synthesize"],
            "tools": ["arXiv API", "OpenAlex", "Write Library"],
            "tool_colors": ["bg-slate-100 text-slate-700", "bg-slate-100 text-slate-700", "bg-blue-100 text-blue-700"],
            "estimated_time": "5–15 min",
            "can_run_directly": True,
        },
        {
            "id": "wf2",
            "name": "Model Researcher",
            "description": "Given a model architecture or technique, decomposes the topic into sub-questions, finds relevant literature, validates citations, and produces a structured research summary.",
            "icon": "psychology",
            "icon_color": "text-purple-500",
            "icon_bg": "bg-purple-50",
            "status": "beta",
            "steps": ["Task Decomp", "Lit Search", "Validate"],
            "tools": ["Semantic Scholar", "PDF Parser"],
            "tool_colors": ["bg-slate-100 text-slate-700", "bg-slate-100 text-slate-700"],
            "estimated_time": "2–5 min",
            "can_run_directly": False,
        },
        {
            "id": "wf3",
            "name": "Experiment Designer",
            "description": "Retrieves relevant literature with hybrid RAG, generates experiment ideas using Monte Carlo Tree Search, runs a critique loop, and outputs code stubs for experiments.",
            "icon": "science",
            "icon_color": "text-orange-500",
            "icon_bg": "bg-orange-50",
            "status": "experimental",
            "steps": ["RAG Context", "Idea Gen", "Critique Loop", "Code Gen"],
            "tools": ["High-tier LLM API", "Workspace Write"],
            "tool_colors": ["bg-red-100 text-red-700", "bg-slate-100 text-slate-700"],
            "estimated_time": "15–30 min",
            "can_run_directly": False,
        },
    ],
    "runs.json": [
        {
            "id": "wrk_7a9b2c",
            "workflow_id": "wf1",
            "workflow_name": "Research Planner Agent",
            "prompt": "Find recent papers (2023+) on multi-agent frameworks and coordination patterns for LLM-based systems.",
            "target_collection": "Multi-Agent Systems",
            "target_collection_id": "c3",
            "constraints": ["Year \u2265 2023", "Citation count > 10", "Must have DOI or arXiv ID"],
            "started_at": "2 hours ago",
            "started_by": "Agent Researcher",
            "duration": "4m 22s",
            "status": "completed",
            "progress": 100,
            "current_step": None,
            "logs": None,
            "cost": {
                "llm": {"label": "LLM Tokens (GPT-4o)", "amount": "$0.14", "tokens": "~14,200 tokens", "pct": 25},
                "openAlex": {"label": "OpenAlex API", "amount": "$0.02", "calls": "150 calls", "limit": "daily limit $1.00", "pct": 15},
                "unpaywall": {"label": "Unpaywall Lookups", "amount": "Free", "calls": "45 items checked", "pct": 0},
                "total": "$0.16",
            },
            "trace": [
                {"step": "Query Generation", "status": "done", "detail": "Agent formulated 3 search queries"},
                {"step": "OpenAlex Search", "status": "done", "detail": "Retrieved 45 candidate papers"},
                {"step": "LLM Screening", "status": "done", "detail": "Filtered to 12 highly relevant papers"},
                {"step": "Awaiting Approval", "status": "pending", "detail": "Pending user review"},
            ],
        },
        {
            "id": "run_current",
            "workflow_id": "wf1",
            "workflow_name": "Literature Review: Graph RAG",
            "prompt": None,
            "target_collection": None,
            "target_collection_id": None,
            "constraints": None,
            "started_at": "4m ago",
            "started_by": "Dr. Researcher",
            "duration": None,
            "status": "running",
            "progress": 65,
            "current_step": "Screening papers (Step 3/4)",
            "logs": [
                {"time": "10:42:01", "level": "INFO", "message": "Initializing workflow 'Literature Reviewer'"},
                {"time": "10:42:05", "level": "INFO", "message": "Query Gen: Generated 4 query variations"},
                {"time": "10:42:12", "level": "TOOL", "message": "Call arXiv API (query=\"graph rag\", limit=50)"},
                {"time": "10:42:58", "level": "INFO", "message": "arXiv: Retrieved 50 candidates"},
                {"time": "10:43:01", "level": "TOOL", "message": "Call OpenAlex API (query=\"graph retrieval augmented generation\")"},
                {"time": "10:43:45", "level": "INFO", "message": "OpenAlex: Retrieved 38 candidates, merged to 71 unique"},
                {"time": "10:44:00", "level": "AGENT", "message": "Screening agent starting batch 1/6..."},
                {"time": "10:44:52", "level": "AGENT", "message": "Batch 1/6 complete: 8 relevant, 4 borderline, 3 rejected"},
                {"time": "10:45:40", "level": "AGENT", "message": "Batch 2/6 complete: 7 relevant, 2 borderline, 6 rejected"},
                {"time": "10:46:28", "level": "AGENT", "message": "Screening agent processing batch 3/6..."},
            ],
            "cost": None,
            "trace": None,
        },
        {
            "id": "run_past",
            "workflow_id": "wf2",
            "workflow_name": "Model Researcher: BioBERT",
            "prompt": None,
            "target_collection": None,
            "target_collection_id": None,
            "constraints": None,
            "started_at": "Yesterday",
            "started_by": "Dr. Researcher",
            "duration": "3m 12s",
            "status": "completed",
            "progress": 100,
            "current_step": None,
            "logs": None,
            "cost": None,
            "trace": None,
        },
    ],
    "proposals.json": [
        {"id": "pp1", "paper_id": "p2", "run_id": "wrk_7a9b2c", "status": "pending", "checked": True},
        {"id": "pp2", "paper_id": "p3", "run_id": "wrk_7a9b2c", "status": "pending", "checked": True},
        {"id": "pp3", "paper_id": "p4", "run_id": "wrk_7a9b2c", "status": "rejected", "checked": False},
    ],
    "activity.json": [
        {
            "id": "a1",
            "type": "agent",
            "icon": "smart_toy",
            "icon_color": "text-purple-600",
            "icon_bg": "bg-purple-100",
            "title": "Daily arXiv Scanner completed",
            "detail": "Scanned 142 preprints, proposed 3 additions to RLHF collection",
            "badges": None,
            "time": "10 min ago",
            "running": None,
            "progress": None,
            "current_step": None,
            "action": {"label": "Review & Approve", "href": "/proposals"},
        },
        {
            "id": "a2",
            "type": "human",
            "icon": "person",
            "icon_color": "text-blue-600",
            "icon_bg": "bg-blue-100",
            "title": "Added \"Attention Is All You Need\" via DOI",
            "detail": None,
            "badges": ["PDF Extracted", "Metadata enriched (Crossref)"],
            "time": "32 min ago",
            "running": None,
            "progress": None,
            "current_step": None,
            "action": None,
        },
        {
            "id": "a3",
            "type": "agent",
            "icon": "smart_toy",
            "icon_color": "text-emerald-600",
            "icon_bg": "bg-emerald-100",
            "title": "Lit Review Generator — running",
            "detail": None,
            "badges": None,
            "time": "45 min ago",
            "running": True,
            "progress": 65,
            "current_step": "Screening papers (Step 3/4)",
            "action": {"label": "View Run", "href": "/agents"},
        },
        {
            "id": "a4",
            "type": "human",
            "icon": "person",
            "icon_color": "text-blue-600",
            "icon_bg": "bg-blue-100",
            "title": "Added \"RLHF\" to collection \"RLHF\"",
            "detail": None,
            "badges": None,
            "time": "2h ago",
            "running": None,
            "progress": None,
            "current_step": None,
            "action": None,
        },
    ],
}


def seed_data() -> None:
    """Seed each Supabase table once if it is empty."""
    db = get_client()
    # Order matters: proposals FK → papers + runs
    table_map = [
        ("libraries",   SEED["libraries.json"]),
        ("papers",      SEED["papers.json"]),
        ("websites",    []),
        ("github_repos", []),
        ("collections", SEED["collections.json"]),
        ("workflows",   SEED["workflows.json"]),
        ("runs",        SEED["runs.json"]),
        ("proposals",   SEED["proposals.json"]),
        ("activity",    SEED["activity.json"]),
    ]
    for table, rows in table_map:
        try:
            check = db.table(table).select("id", count="exact").limit(1).execute()
            if (check.count or 0) == 0:
                # collections table has no paper_count column
                if table == "collections":
                    rows = [{k: v for k, v in r.items() if k != "paper_count"} for r in rows]
                db.table(table).insert(rows).execute()
                logger.info("Seeded table %s (%d rows)", table, len(rows))
        except Exception:
            logger.exception("Failed to seed table %s", table)


@app.on_event("startup")
async def on_startup() -> None:
    seed_data()
    _check_migrations()
    logger.info("ResearchOS API ready")


def _check_migrations() -> None:
    """
    Probe for optional DB columns added after the initial schema and log
    actionable migration SQL when they are missing.  We never auto-apply DDL
    here — just surface the issue early so the developer can run it once in
    the Supabase SQL editor.
    """
    db = get_client()

    # library_id on chat_messages — required for Notes Copilot history
    try:
        db.table("chat_messages").select("library_id").limit(1).execute()
    except Exception:
        logger.warning(
            "\n"
            "┌─ MIGRATION REQUIRED ──────────────────────────────────────────────────────┐\n"
            "│ chat_messages is missing the library_id column.                           │\n"
            "│ Notes Copilot chat history will NOT persist across page reloads until     │\n"
            "│ you run the following SQL once in the Supabase SQL editor:                │\n"
            "│                                                                           │\n"
            "│   ALTER TABLE chat_messages                                               │\n"
            "│     ADD COLUMN IF NOT EXISTS library_id text                             │\n"
            "│     REFERENCES libraries(id) ON DELETE CASCADE;                          │\n"
            "│                                                                           │\n"
            "│   CREATE INDEX IF NOT EXISTS idx_chat_messages_library_id                │\n"
            "│     ON chat_messages (library_id);                                        │\n"
            "└───────────────────────────────────────────────────────────────────────────┘"
        )
