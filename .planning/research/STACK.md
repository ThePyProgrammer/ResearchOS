# Technology Stack

**Project:** ResearchOS — Research Projects & Experiment Tracking
**Researched:** 2026-03-14
**Scope:** Stack additions only — what's needed beyond the existing FastAPI + Supabase + React + Tailwind baseline

---

## Existing Stack (Do Not Re-Research)

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend framework | FastAPI + uvicorn | >=0.135.0 / >=0.32 |
| AI/agent framework | pydantic-ai | >=1.63.0 |
| Database | Supabase (PostgreSQL + Storage) | >=2.28.0 client |
| PDF processing | pymupdf4llm | >=0.3.4 |
| Frontend framework | React + Vite | ^18.3.1 / ^6.0.5 |
| Routing | React Router v6 | ^6.28.0 |
| Styling | Tailwind CSS | ^3.4.16 |
| Rich text editor | tiptap | ^3.20.1 |
| Charts | recharts | ^3.7.0 |
| Package manager (backend) | uv | lockfile: uv.lock |
| Package manager (frontend) | npm | package.json |

All decisions below must fit within this baseline. No new infrastructure is allowed.

---

## New Stack Requirements

### 1. Database Schema — Hierarchical Experiment Tree

**Decision: Adjacency list with recursive CTE queries (no new extension)**

Supabase/PostgreSQL already supports `WITH RECURSIVE` CTEs. The experiment tree model needs:
- `parent_id UUID REFERENCES experiments(id)` on the experiments table
- Recursive CTE to fetch a full subtree in one query
- No `ltree` extension required for this depth/query pattern

**Why not `ltree`:**
- `ltree` requires enabling the extension in Supabase via SQL (`CREATE EXTENSION ltree`) — adds operational surface for a feature not strictly needed
- For a single-user app with at most hundreds of experiments per project, `WITH RECURSIVE` is fast enough and simpler to reason about
- `ltree` is only worth it when you need path-based prefix queries across millions of nodes
- Confidence: HIGH — PostgreSQL recursive CTEs are well-documented standard SQL

**Why not nested sets / closure table:**
- Nested sets require updating large ranges of rows on every insert — wrong tradeoff for write-heavy experiment tracking
- Closure table (all ancestor-descendant pairs) is robust but adds a join table with no benefit at this scale
- Adjacency list + recursive CTE is the standard PostgreSQL tree pattern and the simplest to maintain

**Schema additions (no new Supabase tables beyond what the feature needs):**

```sql
-- 008_projects.sql
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id  UUID REFERENCES libraries(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | archived
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 009_research_questions.sql
CREATE TABLE research_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES research_questions(id),  -- NULL = primary RQ
  text        TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 010_project_papers.sql (join table — papers live in the library)
CREATE TABLE project_papers (
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  paper_id    UUID REFERENCES papers(id) ON DELETE CASCADE,
  website_id  UUID REFERENCES websites(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, COALESCE(paper_id, website_id))
  -- note: enforced in application layer; use two partial unique indexes instead
);

-- 011_experiments.sql
CREATE TABLE experiments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES experiments(id),   -- NULL = root node
  name         TEXT NOT NULL,
  description  TEXT,
  is_leaf      BOOLEAN NOT NULL DEFAULT true,     -- leaf = concrete run; false = group node
  status       TEXT NOT NULL DEFAULT 'planned',   -- planned | running | completed | failed
  config       JSONB,                             -- hyperparameters / settings
  metrics      JSONB,                             -- key results (loss, accuracy, etc.)
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

**Confidence: HIGH** — all PostgreSQL built-ins, follows existing migration numbering pattern.

---

### 2. Backend Python — No New Dependencies Required

The existing backend dependencies cover everything needed:

| Need | How Covered | Confidence |
|------|-------------|------------|
| Recursive CTE queries | Raw SQL via `supabase` client `.rpc()` or `postgrest` RPC | HIGH |
| JSONB for config/metrics | Already used in existing tables (`authors`, `logs`, `cost`, etc.) | HIGH |
| Pydantic models for new entities | `CamelModel` base already defined | HIGH |
| New FastAPI routers | Pattern established (projects.py, experiments.py) | HIGH |
| Notes on projects | Existing `notes` table — add `project_id` nullable FK in a migration | HIGH |

**Do not add:**
- `sqlalchemy` — would conflict with the existing Supabase client pattern; all DB access uses the supabase-py client
- `alembic` — migrations are managed manually via SQL files in `backend/migrations/`, which matches Supabase's SQL editor workflow
- `networkx` — no graph analysis needed; tree traversal is handled in SQL or simple Python recursion
- Any experiment tracking SDK (MLflow, W&B, Aim) — these are full platforms, not embeddable libraries; out of scope per PROJECT.md

**Confidence: HIGH** — verified against existing `pyproject.toml`.

---

### 3. Frontend — Minimal Additions

#### 3a. Tree Rendering — No New Library

**Decision: Build the experiment tree view with React + Tailwind directly.**

Rationale:
- The experiment tree is a specialized domain component, not a general file-system tree. Custom rendering gives full control over status badges, metric summaries, and expand/collapse behavior that match the existing UI patterns.
- The existing sidebar already implements a draggable collections tree (`Sidebar.jsx`) — the experiment tree can follow the same pattern.
- Third-party tree libraries (react-arborist, rc-tree, @tanstack/react-virtual + custom) add bundle weight and impose component APIs that fight the existing design system.
- D3.js is already in the frontend bundle (`^7.9.0`) — if a collapsible tree diagram is needed (not just a list-tree), D3's tree layout can render it without adding another dependency.

**Confidence: HIGH** — existing Sidebar.jsx proves the pattern works; D3 availability confirmed in package.json.

#### 3b. State Management — No New Library

**Decision: Component-level state with prop drilling / context, following the existing LibraryContext.jsx pattern.**

The project detail view (RQs + experiment tree + linked papers) is a single-page concern. A `ProjectContext` following `LibraryContext`'s shape (active project, CRUD operations) is sufficient. No Redux, Zustand, or Jotai needed.

**Confidence: HIGH** — single-user, single-page scope; existing context pattern documented in CLAUDE.md.

#### 3c. Metrics Display — recharts (already installed)

**Decision: Use recharts `^3.7.0` (already in package.json) for any experiment metrics charts.**

Simple bar/line charts for metric comparison across experiments — recharts already handles this. No Vega, Observable Plot, or new charting library needed.

**Confidence: HIGH** — recharts confirmed in package.json.

#### 3d. Configuration Editor — No New Library

**Decision: Use a plain controlled `<textarea>` with JSON syntax for experiment config input, with client-side `JSON.parse()` validation.**

Rationale:
- Experiment config is a JSONB blob. A `<textarea>` with validation is the lowest-friction approach.
- Monaco Editor or CodeMirror would give syntax highlighting but add ~500KB+ to the bundle — disproportionate for a config field.
- If a richer experience is needed, tiptap's existing CodeBlock extension (already installed as `@tiptap/extension-code-block-lowlight`) can render read-only config display in notes.

**Confidence: HIGH** — proportionate to feature scope; avoids bundle bloat.

---

### 4. API Conventions — No Changes

All new endpoints follow the established conventions:

| Convention | Value |
|------------|-------|
| Prefix | `/api/projects`, `/api/experiments` |
| Serialization | `model.model_dump(by_alias=True)` → camelCase JSON |
| Error format | `{"error": "not_found", "detail": "..."}` |
| Model base | `CamelModel` from `backend/models/base.py` |
| DB access | supabase-py client in `backend/services/` |

For recursive tree fetches, use Supabase `.rpc()` to call a PostgreSQL function that runs the `WITH RECURSIVE` CTE. This keeps query logic in SQL and the Python service thin.

**Confidence: HIGH** — follows established CLAUDE.md conventions.

---

## Recommended New Supabase RPC Functions

These PostgreSQL functions are called via `supabase.rpc()` and avoid N+1 queries when loading the full experiment tree:

```sql
-- Get full experiment subtree rooted at a project
CREATE OR REPLACE FUNCTION get_experiment_tree(p_project_id UUID)
RETURNS TABLE (
  id UUID, parent_id UUID, name TEXT, description TEXT,
  is_leaf BOOLEAN, status TEXT, config JSONB, metrics JSONB,
  order_index INTEGER, depth INTEGER
) AS $$
WITH RECURSIVE tree AS (
  SELECT *, 0 AS depth
  FROM experiments
  WHERE project_id = p_project_id AND parent_id IS NULL
  UNION ALL
  SELECT e.*, t.depth + 1
  FROM experiments e
  JOIN tree t ON e.parent_id = t.id
)
SELECT id, parent_id, name, description, is_leaf, status, config, metrics, order_index, depth
FROM tree
ORDER BY depth, order_index;
$$ LANGUAGE sql STABLE;
```

**Confidence: HIGH** — standard PostgreSQL recursive CTE; works with Supabase's `.rpc()`.

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| MLflow | Full platform requiring separate server process — violates "no new infrastructure" constraint |
| Weights & Biases SDK | External SaaS dependency; import as data source later if needed |
| SQLAlchemy / Alembic | Conflicts with existing supabase-py client pattern; migrations are manual SQL files |
| `ltree` extension | Unnecessary complexity at this scale; `WITH RECURSIVE` CTEs are sufficient |
| react-arborist / rc-tree | Third-party tree components fight the existing design system; custom component is ~100 lines |
| Redux / Zustand / Jotai | Overkill for single-user single-page state; context pattern already established |
| Monaco Editor | ~500KB bundle cost for a JSONB config field; textarea + JSON.parse is sufficient |
| Temporal / durable workflow runtime | Phase 6 concern per existing roadmap; not needed for project/experiment CRUD |

---

## Installation

No new packages needed. All required capabilities are covered by:

```bash
# Backend — no changes to pyproject.toml
# (supabase client, FastAPI, pydantic-ai, uvicorn all already present)

# Frontend — no changes to package.json
# (React, recharts, D3, tiptap all already present)
```

The only "installation" step is running new migration SQL files in the Supabase SQL editor.

---

## Sources

- PostgreSQL `WITH RECURSIVE` documentation — standard SQL:1999 feature, well-established
- Supabase `.rpc()` documentation — confirmed in supabase-py client
- Existing `pyproject.toml` — confirmed dependency versions (FastAPI >=0.135.0, supabase >=2.28.0)
- Existing `package.json` — confirmed frontend dependencies (React ^18.3.1, recharts ^3.7.0, D3 ^7.9.0)
- `CLAUDE.md` — existing architecture patterns, CamelModel convention, migration numbering
- `PROJECT.md` — explicit constraint "no new infrastructure", single-user scope
- Confidence: HIGH for all core decisions (verified against project files); MEDIUM for "custom tree vs library" (based on existing Sidebar.jsx pattern as evidence)
