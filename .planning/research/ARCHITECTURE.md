# Architecture Research

**Domain:** ResearchOS v1.1 — Task Database, LaTeX Export, AI Experiment Gap Analysis
**Researched:** 2026-03-19
**Confidence:** HIGH — derived from direct codebase analysis of existing architecture (migrations 001–020, all services, routers, frontend components)

---

## Context: What Already Exists

This research answers integration questions for new v1.1 features against an existing, mature codebase. Before detailing new patterns, the key existing patterns that new code must follow:

- **Backend:** CamelModel base → snake_case fields, camelCase JSON; service layer owns all DB access; thin routers validate + call service + return response
- **Database:** Supabase Postgres, manual SQL migration files (001–020), JSONB for open-ended structured data, TEXT primary keys (prefixed: `exp_`, `note_`, `msg_`)
- **Frontend:** React 18 + Vite + Tailwind; `useState`/`useEffect`; `useLocalStorage` for persistence; `@dnd-kit` for drag-and-drop; `apiFetch` wrapper in `services/api.js`; `DndContext` + `SortableContext` already imported in `ProjectDetail.jsx`
- **AI pattern:** Tool-calling agentic loop in service layer (see `project_notes_copilot_service.py`), tools are `suggest_note_edit`, `suggest_note_create`, `read_note`, `list_item_notes`; suggestions returned as JSONB on `chat_messages.suggestions`
- **Notes:** Single `notes` table with nullable `paper_id`, `website_id`, `github_repo_id`, `library_id`, `project_id`, `experiment_id`; reused via prop injection

---

## System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        Frontend (React SPA)                        │
│                                                                    │
│  ProjectDetail.jsx                                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────────────┐ │
│  │  TaskBoard.jsx  │ │ ProjectNotesIDE │ │  GapAnalysis.jsx     │ │
│  │  (Kanban/List/  │ │   + LaTeX       │ │  (AI suggestions +   │ │
│  │   Calendar)     │ │   export panel  │ │   planning board)    │ │
│  └────────┬────────┘ └────────┬────────┘ └──────────┬───────────┘ │
└───────────┼──────────────────┼──────────────────────┼─────────────┘
            │                  │                       │
            │            REST /api/                    │
┌───────────▼──────────────────▼──────────────────────▼─────────────┐
│                        FastAPI Backend                             │
│  routers/tasks.py      routers/experiments.py (extended)          │
│  services/task_service.py                                         │
│  services/latex_service.py   (new — pure Python, no LLM)          │
│  services/gap_analysis_service.py  (new — agentic loop)           │
└───────────┬──────────────────┬──────────────────────┬─────────────┘
            │                  │                       │
┌───────────▼──────────────────▼──────────────────────▼─────────────┐
│                    Supabase (PostgreSQL)                           │
│  tasks  task_columns                                               │
│  (experiments — existing, read-only for gap analysis)             │
│  (notes — existing, read-only for LaTeX export)                   │
│  (papers — existing, read-only for BibTeX generation)             │
└────────────────────────────────────────────────────────────────────┘
```

---

## Feature 1: Task Database (Kanban / List / Calendar Views)

### Integration Point

Tasks are a new first-class entity scoped to a project, stored in a new `tasks` table. The task database integrates with `ProjectDetail.jsx` as a new tab — alongside the existing Experiments, Literature, and Notes tabs.

### New Database Schema (Migration 021)

```sql
-- Task columns define the Kanban board structure (custom statuses per project)
CREATE TABLE IF NOT EXISTS task_columns (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366f1',  -- hex color for column header
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_columns_project_id ON task_columns (project_id);
ALTER TABLE task_columns DISABLE ROW LEVEL SECURITY;

-- Tasks belong to a project and a column (status)
CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    column_id   TEXT NOT NULL REFERENCES task_columns(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date    TEXT,           -- ISO date string, nullable; used by calendar view
    priority    TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high
    position    INTEGER NOT NULL DEFAULT 0,      -- ordering within a column
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks (column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
```

**Why two tables (not status enum on tasks):** Researchers need custom column names and colors per project (e.g., "Backlog", "In Writing", "Submitted"). Hardcoding statuses would break this. `task_columns` is the source of truth for what columns exist; `column_id` on `tasks` is the FK. This mirrors how Notion/Linear separate "status options" from "status value".

**Why not extend experiments:** Experiments track research runs with config/metrics — a fundamentally different entity from a task (which has a title, due date, priority). Mixing them would produce a confused data model and break the experiment tree's aggregation logic.

### New Backend Components

| File | Type | Purpose |
|------|------|---------|
| `backend/models/task.py` | NEW | `Task`, `TaskCreate`, `TaskUpdate`, `TaskColumn`, `TaskColumnCreate`, `TaskColumnUpdate` models (CamelModel base) |
| `backend/services/task_service.py` | NEW | CRUD for tasks and task_columns; `reorder_tasks(column_id, task_ids)` for Kanban drag; `seed_default_columns(project_id)` for new projects |
| `backend/routers/tasks.py` | NEW | `GET/POST /api/projects/{id}/task-columns`, `PATCH/DELETE /api/task-columns/{id}`, `GET/POST /api/projects/{id}/tasks`, `PATCH/DELETE /api/tasks/{id}`, `POST /api/tasks/{id}/reorder` |

Register `tasks.router` in `backend/app.py` alongside existing routers.

### New Frontend Components

| File | Type | Purpose |
|------|------|---------|
| `frontend/src/pages/TaskBoard.jsx` | NEW | Tab-level component with view switcher (Kanban/List/Calendar) and all three view implementations |
| `frontend/src/services/api.js` | MODIFIED | Add `tasksApi` and `taskColumnsApi` objects following existing `apiFetch` pattern |

**TaskBoard.jsx internal structure:**

```
TaskBoard (manages tasks[] + columns[] state, view mode, CRUD handlers)
  ├── ViewSwitcher (Kanban | List | Calendar toggle buttons)
  ├── KanbanView
  │   └── DndContext (from @dnd-kit/core — already installed)
  │       ├── SortableContext (per column) → TaskCard (draggable)
  │       └── Column headers (editable, color picker, add column)
  ├── ListView
  │   └── Sortable table: title, column, due date, priority
  └── CalendarView
      └── Month grid built with JS Date API — no new library
          Tasks appear as chips on their due_date cell
```

**@dnd-kit is already installed** (`@dnd-kit/core ^6.3.1`, `@dnd-kit/sortable ^10.0.0`) and already used in `ProjectDetail.jsx`. `TaskBoard.jsx` imports from the same packages.

**Kanban drag-drop integration point:** On `onDragEnd`, call `PATCH /api/tasks/{id}` to update `column_id` and `position`. For same-column reordering, call `POST /api/tasks/{id}/reorder` with the new `task_ids` array (same pattern as `experiment_service.reorder_experiments`).

**Calendar view:** Render a plain React month grid. Iterate over `tasks.filter(t => t.dueDate)` and place chips on matching day cells. No third-party calendar component needed — this is ~150 lines of JSX with JS `Date` arithmetic.

### Integration with ProjectDetail.jsx

`ProjectDetail.jsx` is the parent page. Add a "Tasks" tab entry alongside existing tabs ("Overview", "Experiments", "Literature", "Notes"). Render `<TaskBoard projectId={project.id} />` when the Tasks tab is active.

Pass no data down from ProjectDetail — TaskBoard fetches its own data on mount. This matches the existing pattern where `ProjectNotesIDE` receives only `projectId` and `experiments` via `useOutletContext`.

**Modified files:**
- `frontend/src/pages/ProjectDetail.jsx` — add Tasks tab and lazy-mount `TaskBoard`
- `frontend/src/services/api.js` — add `tasksApi`, `taskColumnsApi`

---

## Feature 2: LaTeX Export from Notes IDE

### Integration Point

LaTeX export is a pure frontend-to-backend data transformation. The tiptap editor in `ProjectNotesIDE.jsx` already exports to Markdown and PDF (client-side). LaTeX export adds a server-side transformation endpoint that converts the tiptap HTML content plus project-linked papers into a `.tex` + `.bib` bundle.

The trigger is a new toolbar button in `ProjectNotesIDE.jsx` that opens an export modal. The modal sends the current note's HTML and a list of `[[wikilink]]` or `@cite{key}` patterns found in the content to a new backend endpoint. The backend returns a `.zip` of `.tex` + `.bib` files.

### Why Server-Side (Not Client-Side Like Markdown Export)

The existing `exportMarkdown` and `exportPDF` functions in `ProjectNotesIDE.jsx` are client-side because they only manipulate HTML/text. LaTeX requires:
1. Resolving `\cite{key}` entries against the project's linked papers
2. Generating a `.bib` file with correct BibTeX entries
3. Converting HTML to valid LaTeX (tables, math, lists have non-trivial mappings)

The `bibtex_service.py` already handles BibTeX generation from `Paper` objects. The LaTeX service can call it directly.

### New Backend Components

| File | Type | Purpose |
|------|------|---------|
| `backend/services/latex_service.py` | NEW | HTML-to-LaTeX conversion; calls `bibtex_service.paper_to_bibtex()` for linked papers; returns `(tex_content, bib_content)` tuple |
| `backend/routers/projects.py` | MODIFIED | Add `POST /api/projects/{id}/notes/export-latex` endpoint that accepts note IDs + returns zip or multipart response |

**`latex_service.py` core logic:**

```python
def html_to_latex(html: str) -> str:
    """Convert tiptap HTML to LaTeX body content."""
    # Walk DOM: p → paragraph, h1/h2/h3 → \section/\subsection/\subsubsection
    # strong → \textbf{}, em → \textit{}, code → \texttt{}
    # ul/ol → itemize/enumerate environments
    # table → tabular environment
    # math spans (data-latex attribute from tiptap Mathematics extension) → $ ... $
    ...

def generate_latex_export(
    project_id: str,
    note_ids: list[str],
    cite_keys: dict[str, str],  # cite_key → paper_id mapping from frontend
) -> tuple[str, str]:
    """Returns (tex_content, bib_content)."""
    ...
```

**`cite_keys` mapping:** The frontend scans the exported note's HTML for citation patterns (either `[[Paper Title]]` wikilinks that resolve to linked papers, or an explicit `\cite{}` TipTap extension if added). It sends `{cite_key: paper_id}` to the backend. The backend resolves papers by ID and calls `bibtex_service.paper_to_bibtex()`. This avoids the backend needing to parse HTML for citation detection.

**`bibtex_service` reuse:** The existing `backend/services/bibtex_service.py` already has `paper_to_bibtex(paper: Paper) -> str` logic used for the BibTeX export feature. `latex_service.py` imports and calls it directly — no duplication.

### New Frontend Components

| File | Type | Purpose |
|------|------|---------|
| `frontend/src/pages/ProjectNotesIDE.jsx` | MODIFIED | Add "Export LaTeX" toolbar button; add `LaTeXExportModal` inline component |
| `frontend/src/services/api.js` | MODIFIED | Add `projectsApi.exportLatex(projectId, noteIds, citeKeys)` |

**LaTeXExportModal:** Opens on button click, shows a preview of what will be exported (list of selected notes, detected citations), and provides a "Download .zip" button. The zip contains `main.tex` and `references.bib`.

**LaTeX Preview Panel (read-only):** The PROJECT.md requirement includes "LaTeX preview panel (read-only formatted output from tiptap notes)". This is distinct from the export and is purely client-side: render a `<pre>` or syntax-highlighted code block showing the LaTeX source. The preview is generated client-side by `htmlToLatex()` (a JS port of the Python `html_to_latex()` logic). No backend call needed for preview.

**Modified files:**
- `frontend/src/pages/ProjectNotesIDE.jsx` — toolbar button, modal, preview panel
- `frontend/src/services/api.js` — `projectsApi.exportLatex`
- `backend/services/latex_service.py` (NEW)
- `backend/routers/projects.py` (add export endpoint)

---

## Feature 3: AI Experiment Gap Analysis + Planning Board

### Integration Point

This is the most architecturally complex feature. It builds a new agentic service that analyzes the existing experiment tree (already in the DB) and returns structured suggestions. Suggestions are accepted into the planning board, which can then create real experiments in the DB.

The feature integrates at three points:
1. **Gap analysis service** (new backend) — reads experiments, calls OpenAI, returns structured suggestions
2. **`project_notes_copilot_service.py`** (existing) — extended with a new tool `suggest_experiment` so the notes copilot can also suggest experiments
3. **Planning board UI** (new frontend component) — displays AI suggestions as draggable cards; drag into the experiment tree to create a real experiment

### New Backend Components

| File | Type | Purpose |
|------|------|---------|
| `backend/services/gap_analysis_service.py` | NEW | Reads experiment tree + project RQs + linked papers; calls OpenAI with structured output; returns `GapAnalysisSuggestion` list |
| `backend/models/gap_analysis.py` | NEW | `GapAnalysisSuggestion`, `GapAnalysisRequest`, `GapAnalysisResponse` Pydantic models |
| `backend/routers/experiments.py` | MODIFIED | Add `POST /api/projects/{id}/gap-analysis` endpoint |

**`gap_analysis_service.py` design:**

```python
class GapAnalysisSuggestion(CamelModel):
    id: str                        # sug_{uuid8}
    type: str                      # "missing_baseline" | "ablation" | "config_sweep" | "replication"
    title: str                     # e.g., "Add ResNet-50 baseline"
    rationale: str                 # 1–2 sentences explaining why
    suggested_config: dict         # JSONB config for the proposed experiment
    parent_id: Optional[str]       # suggested parent in existing tree
    priority: str                  # "high" | "medium" | "low"

def run_gap_analysis(project_id: str) -> list[GapAnalysisSuggestion]:
    """
    1. Fetch all experiments for the project (flat list → assembled to tree in Python)
    2. Fetch project RQs and linked papers (title + abstract only)
    3. Build a compact context string (experiment tree summary, metric coverage, config dimensions)
    4. Call OpenAI with JSON schema response_format (same pattern as note_service._call_openai_json)
    5. Parse and return GapAnalysisSuggestion list
    """
```

**OpenAI call pattern:** Mirror `note_service._call_openai_json` — use `response_format` with `json_schema` for models that support it, fall back to `json_object` for older models. Call `record_openai_usage` for cost tracking.

**Context building:** Pass the experiment tree as a compact text summary (name, status, config keys, metric values) rather than raw JSON to save tokens. Linked paper titles + abstracts provide literature context. Total context target: < 4000 tokens.

**No streaming needed:** Gap analysis is a one-shot synchronous call (like note generation). The frontend shows a loading spinner while the request is in flight.

### Planning Board — Frontend Architecture

The planning board is a panel within `ProjectDetail.jsx` on the Experiments tab. It has two zones:

```
Experiments Tab
┌─────────────────────────────────────┬───────────────────────────────┐
│  Experiment Tree (existing)         │  Planning Board (NEW)         │
│                                     │  ┌───────────────────────┐    │
│  [exp group]                        │  │ Run Gap Analysis btn  │    │
│    └─ [leaf exp] completed          │  └───────────────────────┘    │
│    └─ [leaf exp] completed          │                               │
│                                     │  Suggestions (draggable):     │
│                                     │  ┌───────────────────────┐    │
│  Drop zone: drag suggestion here    │  │ [HIGH] Add baseline   │    │
│  to create a planned experiment     │  │ rationale text...     │    │
│                                     │  │ config: {lr: 0.001}   │    │
│                                     │  └───────────────────────┘    │
│                                     │  ┌───────────────────────┐    │
│                                     │  │ [MED] Dropout sweep   │    │
│                                     │  └───────────────────────┘    │
└─────────────────────────────────────┴───────────────────────────────┘
```

**Drag-drop to create experiment:** When a suggestion card is dragged from the planning board onto the experiment tree, an `onDrop` handler calls `POST /api/projects/{id}/experiments` with the suggestion's `title` as `name`, `suggested_config` as `config`, `suggested_parent_id` as `parent_id`, and `status: "planned"`. The suggestion card is removed from the board.

**`@dnd-kit` integration:** Already present in `ProjectDetail.jsx`. The planning board is a droppable zone. Suggestion cards are draggable items. No new DnD library needed.

**Suggestion persistence:** Suggestions are NOT stored in the database. They are transient frontend state (React `useState`). Each "Run Gap Analysis" call replaces the current suggestion list. If the user wants to keep a suggestion, they drag it into the tree (which creates a real experiment in the DB). This avoids a suggestions table migration and keeps the flow simple.

**"Dismiss" action:** Each suggestion card has an X button to dismiss it from the local state.

### Extension to `project_notes_copilot_service.py`

The AI copilot in `ProjectNotesIDE` can also suggest experiments via a new tool:

```python
# Add to TOOLS list in project_notes_copilot_service.py:
{
    "type": "function",
    "function": {
        "name": "suggest_experiment",
        "description": "Suggest a new planned experiment to add to the project's experiment tree.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "rationale": {"type": "string"},
                "config": {"type": "object"},
                "parent_id": {"type": ["string", "null"]},
            },
            "required": ["name", "rationale"],
        },
    },
}
```

This allows the researcher to type "What experiment am I missing to answer RQ2?" in the copilot and get an experiment suggestion in the chat. The suggestion card in the copilot uses the same accept/reject pattern as note suggestions, but on accept calls `POST /api/projects/{id}/experiments` instead of `PATCH /api/notes/{id}`.

**Modified files:**
- `backend/services/gap_analysis_service.py` (NEW)
- `backend/models/gap_analysis.py` (NEW)
- `backend/routers/experiments.py` (add gap-analysis endpoint)
- `backend/services/project_notes_copilot_service.py` (add `suggest_experiment` tool + `_process_tool_call` case)
- `frontend/src/pages/ProjectDetail.jsx` (add planning board panel, integrate DnD)
- `frontend/src/services/api.js` (add `experimentsApi.runGapAnalysis`)
- `frontend/src/components/NotesCopilotPanel.jsx` (handle `suggest_experiment` suggestion type on accept)

---

## Data Flow

### Task CRUD Flow (Kanban)

```
User drags task to new column
  → onDragEnd in TaskBoard.jsx
  → tasksApi.update(taskId, { columnId: newColumnId, position: newPosition })
  → PATCH /api/tasks/{id}
  → task_service.update_task(task_id, data)
  → Supabase UPDATE tasks SET column_id=..., position=..., updated_at=...
  → Return updated Task (camelCase JSON)
  → TaskBoard state update (optimistic or on response)
```

### LaTeX Export Flow

```
User clicks "Export LaTeX" in ProjectNotesIDE
  → LaTeXExportModal opens, scans active note HTML for [[wikilinks]]
  → Resolve wikilinks against projectPapers (from parent context) → citeKey map
  → User clicks "Download"
  → projectsApi.exportLatex(projectId, [noteId], citeKeys)
  → POST /api/projects/{id}/notes/export-latex
  → latex_service.generate_latex_export(project_id, note_ids, cite_keys)
      → note_service.get_note(note_id) → HTML content
      → html_to_latex(html) → .tex body
      → paper_service.get_paper(paper_id) for each cite_key
      → bibtex_service.paper_to_bibtex(paper) for each paper
  → Return {"tex": "...", "bib": "..."} JSON
  → Frontend creates Blob, triggers download of two files
```

### Gap Analysis Flow

```
User clicks "Run Gap Analysis"
  → experimentsApi.runGapAnalysis(projectId)
  → POST /api/projects/{id}/gap-analysis
  → gap_analysis_service.run_gap_analysis(project_id)
      → experiment_service.list_experiments(project_id) → flat list
      → rq_service.list_rqs(project_id) → RQ list
      → project_papers_service.list_project_papers(project_id) → linked paper IDs
      → Build context string (experiment tree summary + RQ texts + paper titles)
      → OpenAI call with JSON schema → list[GapAnalysisSuggestion]
  → Return [{id, type, title, rationale, suggestedConfig, parentId, priority}]
  → Frontend stores in React state as planning board cards

User drags suggestion card onto experiment tree
  → onDrop handler in ProjectDetail.jsx
  → experimentsApi.create(projectId, {name, config, parentId, status: "planned"})
  → POST /api/projects/{id}/experiments
  → experiment_service.create_experiment(...)
  → Remove suggestion from local state
```

### LaTeX Preview Flow (client-side only)

```
User clicks "Preview LaTeX" button
  → htmlToLatex(editor.getHTML()) [client-side JS function]
  → Render output in <pre> block or syntax-highlighted CodeBlock
  → No API call
```

---

## Component Boundaries

### New Backend Components (Summary)

| Component | File | New/Modified | Communicates With |
|-----------|------|-------------|-------------------|
| Task model | `models/task.py` | NEW | — |
| Task service | `services/task_service.py` | NEW | `services/db.py` |
| Tasks router | `routers/tasks.py` | NEW | `services/task_service.py` |
| LaTeX service | `services/latex_service.py` | NEW | `services/note_service.py`, `services/paper_service.py`, `services/bibtex_service.py` |
| Gap analysis model | `models/gap_analysis.py` | NEW | — |
| Gap analysis service | `services/gap_analysis_service.py` | NEW | `services/experiment_service.py`, `services/rq_service.py`, `services/project_papers_service.py` |
| Experiments router | `routers/experiments.py` | MODIFIED | + `gap_analysis_service` |
| Projects router | `routers/projects.py` | MODIFIED | + `latex_service` |
| Notes copilot service | `services/project_notes_copilot_service.py` | MODIFIED | + `suggest_experiment` tool case |

### New Frontend Components (Summary)

| Component | File | New/Modified | Communicates With |
|-----------|------|-------------|-------------------|
| Task board | `pages/TaskBoard.jsx` | NEW | `tasksApi`, `taskColumnsApi` |
| Task API | `services/api.js` | MODIFIED | `/api/tasks`, `/api/task-columns` |
| LaTeX export modal | `pages/ProjectNotesIDE.jsx` (inline) | MODIFIED | `projectsApi.exportLatex` |
| Planning board panel | `pages/ProjectDetail.jsx` (inline) | MODIFIED | `experimentsApi.runGapAnalysis`, `experimentsApi.create` |
| Copilot experiment accept handler | `components/NotesCopilotPanel.jsx` | MODIFIED | `experimentsApi.create` (on accept) |

---

## Architectural Patterns

### Pattern 1: Transient AI Suggestions (Don't Persist What Users May Discard)

**What:** Gap analysis suggestions live in React `useState` only. They are not persisted to the DB until the researcher drags one into the tree.
**When to use:** Any AI-generated proposal that requires user acceptance before becoming canonical data.
**Trade-offs:** Suggestions are lost on page refresh — acceptable because re-running gap analysis is cheap and suggestions are context-dependent anyway.

This matches the existing pattern in `NotesCopilotPanel` where note suggestions are held in state and only applied to the DB when accepted.

### Pattern 2: Service Composition Over Service Duplication

**What:** `latex_service.py` calls `note_service.get_note()`, `paper_service.get_paper()`, and `bibtex_service.paper_to_bibtex()` directly — it does not re-implement any of their logic.
**When to use:** Any new service that transforms existing domain objects.
**Trade-offs:** Creates coupling between services, but avoids duplication and ensures LaTeX export reflects the same data as BibTeX export (same `paper_to_bibtex` function).

This matches how `notes_copilot_service.py` imports from `note_service` and `pdf_text_service` rather than re-implementing DB access.

### Pattern 3: Extend Existing Tool Lists, Don't Fork Services

**What:** Adding `suggest_experiment` to `project_notes_copilot_service.py`'s `TOOLS` list rather than creating a separate copilot service for experiment-aware chat.
**When to use:** When a new output type fits the existing agentic loop structure.
**Trade-offs:** Makes `project_notes_copilot_service.py` slightly larger. Avoids a parallel copilot infrastructure.

The existing pattern already handles multiple tool types in `_process_tool_call()` with if/elif branches. Adding one more branch is the right extension point.

### Pattern 4: View Mode Switcher Within a Single Component

**What:** Kanban, List, and Calendar are three rendering modes of the same dataset in `TaskBoard.jsx` — one component, one data fetch, a local `viewMode` state.
**When to use:** Multiple visual representations of the same underlying data.
**Trade-offs:** TaskBoard.jsx will be 400–600 lines. This is acceptable — `ProjectDetail.jsx` is already large and the project follows a "one page = one large component" pattern.

Mirror the existing pattern in `Library.jsx` which renders both table view and detail panel in one component.

---

## Build Order (Dependencies)

Dependencies flow bottom-up. Each item must exist before the items that depend on it.

```
1. DB Migration 021 (tasks + task_columns tables)
   └─ Required by: task_service, tasks router, TaskBoard.jsx

2. backend/models/task.py + backend/services/task_service.py
   └─ Required by: tasks router

3. backend/routers/tasks.py + registration in app.py
   └─ Required by: frontend API calls to /api/tasks

4. frontend/services/api.js — tasksApi + taskColumnsApi
   └─ Required by: TaskBoard.jsx

5. frontend/pages/TaskBoard.jsx (Kanban + List views first)
   └─ Required by: ProjectDetail.jsx Tasks tab

6. ProjectDetail.jsx — add Tasks tab, mount TaskBoard
   └─ Calendar view can land separately (same component, add viewMode)

7. backend/services/latex_service.py (no migration needed)
   └─ Required by: LaTeX export endpoint

8. backend/routers/projects.py — add export-latex endpoint
   └─ Required by: frontend export call

9. ProjectNotesIDE.jsx — LaTeX export button + modal + preview
   └─ Independent of tasks; can land in any order relative to steps 1–6

10. backend/models/gap_analysis.py + backend/services/gap_analysis_service.py
    └─ Required by: gap-analysis endpoint

11. backend/routers/experiments.py — add gap-analysis endpoint
    └─ Required by: frontend gap analysis call

12. ProjectDetail.jsx — add planning board panel + DnD integration
    └─ Required by: nothing (self-contained after step 11)

13. project_notes_copilot_service.py — add suggest_experiment tool
    └─ Required by: NotesCopilotPanel accept handler for experiment type

14. NotesCopilotPanel.jsx — handle suggest_experiment accept action
    └─ Last; depends on experimentsApi.create already existing
```

**Suggested phase grouping:**
- **Phase A (Tasks):** Steps 1–6 — delivers working task database with Kanban + List + Calendar
- **Phase B (LaTeX):** Steps 7–9 — independent, can be built in parallel with Phase A
- **Phase C (Gap Analysis):** Steps 10–14 — depends on existing experiment data being populated (users need Phase A tasks running before gap analysis is useful for experiments; but technically can be built independently)

---

## Anti-Patterns

### Anti-Pattern 1: Merging Tasks and Experiments

**What people do:** Add a `task_type` column to `experiments` and render some experiments as tasks.
**Why it's wrong:** Experiments have config/metrics/status/parent-child tree semantics. Tasks have title/due_date/priority/column semantics. Merging them produces a model that satisfies neither use case and breaks the experiment tree's aggregation logic.
**Do this instead:** Separate `tasks` table scoped to `project_id`. The two entities coexist but don't share a schema.

### Anti-Pattern 2: Server-Side LaTeX Compilation

**What people do:** Run `pdflatex` on the server to return a compiled PDF.
**Why it's wrong:** LaTeX distribution is ~500MB, creates a server dependency, and compilation can hang or fail on malformed input. The scope is "export for Overleaf/local compilation", not "compile to PDF".
**Do this instead:** Return `.tex` + `.bib` source files. Researchers compile locally or upload to Overleaf. The existing client-side PDF export (`window.open + window.print()`) handles "I want a PDF right now" use cases.

### Anti-Pattern 3: Storing Gap Analysis Suggestions in the DB

**What people do:** Persist suggestions to a `gap_analysis_suggestions` table so they survive page refreshes.
**Why it's wrong:** Suggestions are stale immediately after the experiment tree changes. Stale suggestions mislead researchers. A new analysis run takes ~2 seconds and is cheap.
**Do this instead:** Transient React state. On page refresh, re-run the analysis if needed. The only durable record is the planned experiment created when a suggestion is accepted.

### Anti-Pattern 4: New DnD Library for Planning Board

**What people do:** Install `react-beautiful-dnd` or `react-dnd` for the planning board because "it's different from what's already there."
**Why it's wrong:** `@dnd-kit` is already installed and already used in `ProjectDetail.jsx` for experiment reordering. Using the same library avoids bundle duplication and keeps DnD semantics consistent.
**Do this instead:** Extend the existing `DndContext` in `ProjectDetail.jsx` to include planning board cards as draggable items and the experiment tree as a droppable zone.

### Anti-Pattern 5: Blocking the API on LaTeX Citation Resolution

**What people do:** Have the backend scan note HTML for citation keys, resolve them to papers, and build the BibTeX.
**Why it's wrong:** The backend would need to parse HTML and detect citation patterns — fragile and depends on the frontend's note structure. The frontend already knows what papers are linked to the project.
**Do this instead:** Frontend sends `{citeKey: paperId}` map to the backend. Frontend knows the linked papers (already fetched for the project); it just maps them to citation keys at export time. Backend trusts this map and resolves paper data by ID.

---

## Integration Points Summary

| New Feature | Existing System | Integration Type | Notes |
|------------|----------------|-----------------|-------|
| Task database | `projects` table | New child table via FK | `task_columns` + `tasks` → `project_id` |
| Task Kanban | `@dnd-kit` (already installed) | Reuse existing library | Same `DndContext` pattern as experiment reorder |
| LaTeX export | `bibtex_service.py` | Direct service call | Reuse `paper_to_bibtex()` for `.bib` generation |
| LaTeX export | `note_service.py` | Direct service call | Fetch note HTML content by note_id |
| LaTeX export | `ProjectNotesIDE.jsx` | Toolbar button + modal | Add to existing export toolbar alongside MD/PDF |
| Gap analysis | `experiment_service.py` | Read-only data source | Fetches flat experiment list for context building |
| Gap analysis | `rq_service.py` | Read-only data source | Fetches RQ texts for analysis context |
| Gap analysis | OpenAI (via existing `get_openai_client()`) | Same client pattern | Same `record_openai_usage` cost tracking |
| Gap analysis suggestions | `project_notes_copilot_service.py` | Add tool to `TOOLS` list | `suggest_experiment` tool + `_process_tool_call` case |
| Planning board DnD | `experimentsApi.create` | Create on drop | Accepted suggestion → `POST /api/projects/{id}/experiments` |
| Planning board DnD | `ProjectDetail.jsx` `DndContext` | Extend existing | Add droppable zone, draggable suggestion cards |

---

## Sources

- Direct codebase analysis: `backend/migrations/019_experiments.sql`, `backend/models/experiment.py`, `backend/services/experiment_service.py`, `backend/services/project_notes_copilot_service.py`, `backend/services/note_service.py`, `backend/services/bibtex_service.py`, `backend/routers/experiments.py`, `frontend/src/pages/ProjectDetail.jsx`, `frontend/src/pages/ProjectNotesIDE.jsx`, `frontend/src/components/NotesCopilotPanel.jsx`, `frontend/src/services/api.js`, `frontend/package.json`
- Project requirements: `.planning/PROJECT.md` (v1.1 milestone features)
- Previous research: `.planning/research/STACK.md` (confirms no new libraries needed), `.planning/research/FEATURES.md`
- Confidence: HIGH for all integration points (derived from direct codebase reading, not assumptions)

---

*Architecture research for: ResearchOS v1.1 — Task Database, LaTeX Export, AI Experiment Gap Analysis*
*Researched: 2026-03-19*
