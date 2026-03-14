# Architecture Patterns

**Domain:** Research project management and experiment tracking integrated into an existing reference manager
**Researched:** 2026-03-14
**Confidence:** HIGH for integration patterns (derived from direct codebase analysis); MEDIUM for experiment tracking patterns (training knowledge, well-established domain)

---

## Recommended Architecture

The new capability adds two layers on top of the existing library system:
- **Projects layer** — a container for research questions, linked literature, and an experiment tree
- **Experiment layer** — a hierarchical tree of planned/running/completed/failed experiment nodes

Both layers sit above and reference the existing library layer (papers, websites, collections) without duplicating or replacing any of it.

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React SPA)                    │
│  /projects  /projects/:id  /projects/:id/experiments/:id   │
└───────────────────────┬─────────────────────────────────────┘
                        │ REST /api/
┌───────────────────────▼─────────────────────────────────────┐
│                  FastAPI Backend                             │
│  routers/projects.py   routers/experiments.py               │
│  services/project_service.py                                │
│  services/experiment_service.py                             │
│  models/project.py     models/experiment.py                 │
└───────────────────────┬─────────────────────────────────────┘
                        │ foreign keys / joins
┌───────────────────────▼─────────────────────────────────────┐
│                  Supabase (PostgreSQL)                       │
│  projects  research_questions  project_papers               │
│  experiments  experiment_metrics  experiment_artifacts      │
└───────────────────────┬─────────────────────────────────────┘
                        │ references (no duplication)
┌───────────────────────▼─────────────────────────────────────┐
│            Existing Library System (unchanged)              │
│  papers  websites  collections  notes  libraries            │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

### New Backend Components

| Component | File(s) | Responsibility | Communicates With |
|-----------|---------|----------------|-------------------|
| Project model | `models/project.py` | Pydantic schema for Project, ProjectCreate, ProjectUpdate | — |
| Research question model | `models/project.py` | ResearchQuestion, RQCreate, RQUpdate (nested under project) | — |
| Experiment model | `models/experiment.py` | Experiment, ExperimentCreate, ExperimentUpdate; tree node structure | — |
| Project service | `services/project_service.py` | CRUD for projects; link/unlink papers; list RQs | `services/db.py`, `services/paper_service.py` (read-only) |
| Experiment service | `services/experiment_service.py` | CRUD for experiments; tree traversal; aggregate parent metrics | `services/db.py`, `services/project_service.py` (read-only) |
| Projects router | `routers/projects.py` | REST endpoints for projects + RQs + paper linkage | `services/project_service.py`, `services/note_service.py` |
| Experiments router | `routers/experiments.py` | REST endpoints for experiment tree CRUD, metrics, artifacts | `services/experiment_service.py` |

### New Frontend Components

| Component | File(s) | Responsibility | Communicates With |
|-----------|---------|----------------|-------------------|
| Projects list page | `pages/Projects.jsx` | List all projects; create/archive; navigate into | `api.js projectsApi` |
| Project detail page | `pages/ProjectDetail.jsx` | RQs panel + experiment tree panel + linked literature panel | `api.js`, `NotesPanel.jsx` |
| Experiment tree | `components/ExperimentTree.jsx` | Recursive tree render; expand/collapse; drag-reorder siblings | `api.js experimentsApi` |
| Experiment detail panel | `components/ExperimentDetail.jsx` | Config params editor, metrics table, status badge, artifacts list | `api.js experimentsApi` |
| Link literature modal | `components/LinkLiteratureModal.jsx` | Searchable list of existing library papers/websites to link to project | `api.js papersApi`, `api.js projectsApi` |

### Existing Components Used Without Modification

| Component | How Used |
|-----------|---------|
| `NotesPanel.jsx` | Project-level notes via `project_id` foreign key added to `notes` table |
| `CopilotPanel.jsx` | Per-experiment or per-project copilot chat (if added later) |
| `Layout.jsx` / `Sidebar.jsx` | Projects nav link added to sidebar; no structural changes |
| `note_service.py` | Extended to accept `project_id` — same pattern as `paper_id`, `website_id` |

---

## Database Schema

### New Tables

```sql
-- Projects: top-level research containers
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    library_id  TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active',  -- active | completed | archived
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Research questions: belong to a project, form a flat list (not hierarchical)
CREATE TABLE research_questions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,  -- exactly one primary per project
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Junction: papers linked to a project as relevant literature
-- Papers are NOT duplicated — they stay in the library; this is a reference
CREATE TABLE project_papers (
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    paper_id    TEXT REFERENCES papers(id) ON DELETE CASCADE,
    website_id  TEXT REFERENCES websites(id) ON DELETE CASCADE,
    note        TEXT,  -- optional free-form note on why this item is relevant
    added_at    TEXT NOT NULL,
    PRIMARY KEY (project_id, COALESCE(paper_id, ''), COALESCE(website_id, ''))
);

-- Experiments: tree nodes (parent_id = NULL means root of tree for a project)
CREATE TABLE experiments (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id     TEXT REFERENCES experiments(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    hypothesis    TEXT,  -- what this experiment tests
    status        TEXT NOT NULL DEFAULT 'planned',  -- planned | running | completed | failed
    is_leaf       BOOLEAN NOT NULL DEFAULT TRUE,  -- leaf = concrete run; parent = grouping node
    config        JSONB NOT NULL DEFAULT '{}',   -- key-value params (hyperparameters, settings)
    metrics       JSONB NOT NULL DEFAULT '{}',   -- key-value results (accuracy, loss, etc.)
    order_index   INTEGER NOT NULL DEFAULT 0,    -- sibling ordering
    started_at    TEXT,
    completed_at  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- Experiment artifacts: logs, outputs, file references for a completed run
CREATE TABLE experiment_artifacts (
    id            TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL DEFAULT 'log',  -- log | output | file | url
    name          TEXT NOT NULL,
    content       TEXT,   -- inline text (logs, short outputs)
    url           TEXT,   -- external reference (GitHub, Supabase Storage)
    created_at    TEXT NOT NULL
);
```

### Existing Tables Extended

```sql
-- notes: add project_id so project-level notes work via existing note_service
ALTER TABLE notes ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
```

The `note_service.py` `list_notes`, `create_note`, `update_note` functions all accept optional source kwargs — adding `project_id` follows the same pattern already used for `paper_id`, `website_id`, `github_repo_id`, `library_id`.

---

## Data Flow

### Top-Down Workflow (researcher starts with a question)

```
User creates project
  → POST /api/projects → projects table

User adds research questions
  → POST /api/projects/:id/questions → research_questions table

User creates experiment tree
  → POST /api/projects/:id/experiments (parent_id=null → root node)
  → POST /api/projects/:id/experiments (parent_id=root → leaf nodes)

User links relevant papers from library
  → POST /api/projects/:id/papers → project_papers junction table
  (papers stay in library; project_papers is a reference only)

User runs experiment (externally), records results
  → PATCH /api/experiments/:id with config + metrics + status=completed
```

### Bottom-Up Workflow (researcher reads literature, then identifies gaps)

```
User is in Library reading papers (existing flow — unchanged)
  ↓
User identifies a gap or question from reading
  → Creates a new project from the Library page (quick-create modal)
  → Immediately links the paper(s) they were reading

User formulates research questions
  → Adds RQs to the project

User plans experiments to answer questions
  → Builds experiment tree from project detail view
```

### Notes Flow (reusing existing infrastructure)

```
User opens project → NotesPanel renders with project_id
  → GET /api/projects/:id/notes → note_service.list_notes(project_id=...)
  → POST /api/projects/:id/notes → note_service.create_note(..., project_id=...)
  → PATCH/DELETE /api/notes/:id (unchanged shared endpoint)
```

### Experiment Tree Aggregation (parent node summary)

```
Parent experiment metrics are NOT stored independently.
When GET /api/experiments/:id is called on a parent:
  → experiment_service fetches all leaf descendants
  → aggregates their metrics (avg, min, max, count) on the fly
  → returns computed summary alongside raw children list
```

This avoids stale aggregated data and keeps the schema simple. At scale (> 1000 experiments per project), a materialized view or cached summary can be added without changing the API contract.

---

## Patterns to Follow

### Pattern 1: Hierarchical Tree via Adjacency List

The `experiments` table uses `parent_id` (adjacency list). This is the right choice for this scale: single-user, typically < 100 experiments per project. Recursive tree fetch in Python:

```python
def get_experiment_tree(project_id: str) -> list[Experiment]:
    """Return all experiments for a project, with children nested under parents."""
    result = get_client().table("experiments").select("*").eq("project_id", project_id).execute()
    all_nodes = {e["id"]: Experiment.model_validate(e) for e in result.data}
    roots = []
    for node in all_nodes.values():
        if node.parent_id is None:
            roots.append(node)
        else:
            parent = all_nodes.get(node.parent_id)
            if parent:
                parent.children.append(node)  # requires children: list[Experiment] = [] on model
    return sorted(roots, key=lambda e: e.order_index)
```

Confidence: HIGH — adjacency list is the standard pattern for single-owner trees at this scale. Nested set or closure table add complexity with no benefit here.

### Pattern 2: Junction Table for Literature Links (Reference, Not Copy)

`project_papers` holds only foreign keys back to `papers`/`websites`. Paper metadata (title, authors, abstract) is never duplicated into the projects domain. When the frontend needs paper details for a project's literature list, it joins or fetches by ID.

```python
def get_project_literature(project_id: str) -> list[dict]:
    """Return papers + websites linked to a project with full metadata."""
    rows = get_client().table("project_papers").select("*").eq("project_id", project_id).execute()
    papers = []
    for row in rows.data:
        if row["paper_id"]:
            paper = paper_service.get_paper(row["paper_id"])
            if paper:
                papers.append({"type": "paper", "item": paper, "note": row.get("note")})
        elif row["website_id"]:
            website = website_service.get_website(row["website_id"])
            if website:
                papers.append({"type": "website", "item": website, "note": row.get("note")})
    return papers
```

### Pattern 3: Config and Metrics as JSONB

Experiment configurations (hyperparameters) and metrics (results) are open-ended key-value maps. Store as JSONB — do not create rigid columns. This matches the existing codebase pattern (JSONB used for `authors`, `tags`, `cost`, `trace`).

Frontend renders them as a generic key-value table that supports add/edit/delete rows.

### Pattern 4: Extend notes Table, Don't Fork It

Add `project_id` to the existing `notes` table via migration, and extend `note_service.py` with the same optional-kwarg pattern. This means:
- `NotesPanel.jsx` works unchanged — it already accepts `createFn` and `fetchFn` as props
- AI note generation for projects reuses the same `_generate_multi_notes` infrastructure
- No parallel notes system to maintain

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Embedding Paper Metadata in Projects

**What it looks like:** Copying title/authors/abstract into a `project_papers` table for "convenience"
**Why bad:** Creates stale data divergence when papers are edited in the library. The existing dedup system already normalizes papers as the source of truth.
**Instead:** `project_papers` stores only the foreign key. Fetch paper details from `paper_service` at read time.

### Anti-Pattern 2: Storing Experiment Results Outside the experiments Table

**What it looks like:** A separate `experiment_runs` table for each "execution" of an experiment
**Why bad:** The PROJECT.md requirements specify leaf experiments = concrete runs. A leaf IS a run. Adding a sub-run concept before it's needed creates premature complexity.
**Instead:** One experiment node = one configuration + one set of results. If re-running with different params is needed, the pattern is: duplicate the leaf node (clone with new parent), not adding a run sub-record.

### Anti-Pattern 3: Recursive SQL CTE for Tree Fetch

**What it looks like:** `WITH RECURSIVE` PostgreSQL query to fetch the experiment tree in one DB call
**Why bad:** ResearchOS uses the Supabase Python client which doesn't support raw SQL through the `.table().select()` chainable API without special handling. The Python-side tree assembly (Pattern 1 above) is simpler, just as fast at this scale, and testable without a DB.
**Instead:** Fetch all experiments for a project_id in one flat query, then assemble the tree in Python.

### Anti-Pattern 4: Separate Notes System for Projects

**What it looks like:** `project_notes` table, `project_note_service.py`
**Why bad:** Doubles maintenance burden, diverges from existing note editor UX.
**Instead:** Add `project_id` FK to the existing `notes` table (Migration 008 or 009) and extend `note_service.py`.

### Anti-Pattern 5: New Sidebar Top-Level Section for Each Feature

**What it looks like:** A "Projects" section, an "Experiments" section, a "Literature" section all in the top navigation
**Why bad:** The sidebar already has: Library, Authors, Agents, Proposals. Adding two more breaks the layout at small viewport widths and buries navigation context.
**Instead:** One "Projects" sidebar nav item. All experiment tree navigation lives inside the Project Detail page as a nested drill-down.

---

## Suggested Build Order (Dependencies)

The build order is driven by data dependencies. Each layer must exist before the layers that reference it.

```
1. DB Migration (projects + research_questions + experiments + project_papers + notes.project_id)
   └─ Required by: everything else

2. Backend models (project.py, experiment.py)
   └─ Required by: services and routers

3. project_service.py (CRUD + paper linking)
   └─ Required by: projects router

4. experiment_service.py (CRUD + tree fetch + metric aggregation)
   └─ Required by: experiments router

5. Extend note_service.py (add project_id parameter)
   └─ Required by: project notes endpoints

6. projects router + experiments router
   └─ Required by: frontend API calls

7. Frontend API service extension (projectsApi, experimentsApi in api.js)
   └─ Required by: all frontend pages

8. Projects list page (Projects.jsx)
   └─ Dependency: projectsApi

9. Project detail page (ProjectDetail.jsx) — RQs + linked literature panels
   └─ Dependencies: projectsApi, papersApi (for link modal), note_service (notes panel)

10. Experiment tree + detail (ExperimentTree.jsx + ExperimentDetail.jsx)
    └─ Dependencies: experimentsApi, ProjectDetail.jsx

11. Sidebar nav link + route wiring
    └─ Dependencies: all pages exist
```

Phases map to these layers:
- **Phase 1**: Steps 1–6 (backend infrastructure, no UI)
- **Phase 2**: Steps 7–9 (projects list + detail without experiment tree)
- **Phase 3**: Steps 10–11 (experiment tree + sidebar integration)

---

## Scalability Considerations

| Concern | Current (single user) | If multi-user later |
|---------|----------------------|---------------------|
| Project isolation | `library_id` FK + Python-side filtering | Add `user_id` FK; enable Supabase RLS |
| Experiment tree depth | Python adjacency list, O(n) on all experiments per project | Closure table if trees exceed ~500 nodes |
| Metrics aggregation | On-read Python aggregation | Materialized view or cached `metrics_summary` column |
| Literature linkage | Junction table fetch + individual paper lookups | Supabase join (`.select("*, papers(*)")`) |

For the current single-user scope, none of these optimizations are needed.

---

## Frontend Route Structure

```
/projects                    → Projects.jsx (list + create)
/projects/:id                → ProjectDetail.jsx (RQs, literature, experiment tree)
/projects/:id/experiments/:expId  → Optional: deep-link to a specific experiment node
                                   (can be handled as URL state in ProjectDetail.jsx instead)
```

The experiment tree detail (config/metrics panel) should render as a side panel within `/projects/:id`, not as a separate route — same pattern as Library.jsx renders `PaperInfoPanel` as a right panel.

---

## Sources

- Direct codebase analysis: `backend/models/note.py`, `backend/services/note_service.py`, `backend/routers/notes.py`, `backend/models/paper.py`, `backend/migrations/001_init.sql`, `backend/app.py`, `frontend/src/App.jsx`
- Project requirements: `.planning/PROJECT.md`
- Confidence for adjacency list tree pattern: HIGH (well-established, multiple authoritative references)
- Confidence for JSONB for config/metrics: HIGH (matches existing codebase pattern, standard Postgres practice)
- Confidence for notes extension pattern: HIGH (derived directly from existing codebase implementation)
