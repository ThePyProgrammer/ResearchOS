# Phase 3: Experiment Tree - Research

**Researched:** 2026-03-15
**Domain:** Hierarchical experiment tracking UI + backend — React tree components, JSONB key-value storage, tiptap notes extension, DnD-kit sibling reorder
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tree Structure & Node Types**
- Unlimited nesting depth (same as RQ tree) — any experiment can have children at any level
- All nodes can have BOTH config/metrics AND children — a parent group can have shared baseline config while children override specific keys
- No strict "group vs leaf" type distinction at the data level — behavior emerges from whether a node has children
- Create flow uses a **modal dialog** (not inline input) with name, status, and initial config key-value rows
- DnD sibling reorder + context menu reparenting (same pattern as RQ tree)
- Delete cascades to all children (same as RQ tree)

**Config & Metrics Editing**
- **Inline table rows** below the experiment name — each row is a key-value pair
- Click '+' to add a row, click a cell to edit, 'x' to remove
- Config and metrics use the **same editor style** — labeled sections ("Config" / "Metrics") distinguish them
- Values **auto-detect types**: number, boolean, or string based on input — stored in JSONB with native types
- Auto-detection enables numeric sorting/comparison in Phase 4 without migration

**Experiment Placement in UI**
- New **"Experiments" tab** in ProjectDetail left nav alongside Overview, Literature, and Notes
- Experiment tree is self-contained within the tab — does NOT appear in the left-nav tree
- Each experiment can optionally reference an **RQ it's testing** via an optional rq_id FK — shown as a dropdown or link on the experiment node
- Notes UX: Claude's discretion (minimize new layout infrastructure)

**Aggregated Parent Summaries**
- Parent nodes show **status counts + metric ranges** for all descendants (recursive, not just direct children)
- Status counts as colored mini pills (e.g., "2✓ 1◆ 1✗")
- Metric ranges as **compact inline chips** next to status: "accuracy: 0.82–0.95 | loss: 0.03–0.12"
- Truncate to top 2-3 metrics if many exist
- Aggregation computed **client-side** from loaded children data — no extra API calls

**Status Badges (NAV-03)**
- Status values: planned (blue), running (amber), completed (emerald), failed (red)
- Colored badge pill dropdown (same native select pattern as RQ status and project status)

### Claude's Discretion
- Visual distinction between parent groups and leaf nodes (icon choice, styling differences)
- Notes UX approach (replace panel vs slide-over vs other)
- Exact modal layout for experiment creation
- Loading skeletons and error states
- Sidebar icon for experiments (Material Symbols Outlined)
- Exact indentation, spacing, and responsive behavior

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXP-01 | User can create experiment nodes in a hierarchical tree per project | `buildExperimentTree()` copied from `buildRqTree()` pattern; modal creation with name+status |
| EXP-02 | User can create parent experiment nodes that group related experiments | Same node type as leaf — parenthood emerges from having children |
| EXP-03 | User can create leaf experiments with name, status, config KV pairs, and metrics KV pairs | `ExperimentStatusDropdown` + inline KV editor; JSONB columns on `experiments` table |
| EXP-04 | User can edit experiment name, status, config, and metrics | Inline name edit + status dropdown + KV cell click-to-edit; `PATCH /api/experiments/{id}` |
| EXP-05 | User can delete experiments (cascade to children) | DB `ON DELETE CASCADE` on `parent_id` FK; confirmation dialog matching RQ pattern |
| EXP-06 | Parent nodes display aggregated summaries of child experiments | Client-side recursive aggregation from flat loaded list; status pill counts + metric range chips |
| EXP-10 | User can add notes to individual experiments (reusing tiptap notes system) | Add `experiment_id` FK to `notes` table (migration 019); new note router endpoints; `listForExperiment`/`createForExperiment` in api.js |
| LIT-02 | User can link specific papers to individual experiments as supporting literature | New `experiment_papers` join table (migration 019 or 020); reuse `MiniSearchPicker` component |
| NAV-03 | Experiment tree shows status badges (color-coded by status) | `ExperimentStatusDropdown` copied from `RQStatusDropdown` with planned/running/completed/failed values |
</phase_requirements>

---

## Summary

Phase 3 is almost entirely a **copy-and-extend of the Phase 2 RQ tree**. The codebase has a mature, well-tested recursive tree pattern (`RQNode`, `RQSection`, `buildRqTree`, `flattenRqTree`, DnD reorder, context-menu reparenting) that maps directly to experiments. The primary new capabilities are: (1) inline key-value editors for config and metrics, (2) client-side recursive aggregation for parent summary nodes, and (3) extending the notes system with an `experiment_id` FK.

The biggest design risk is the key-value type auto-detection and JSONB storage — getting this right at schema time avoids a Phase 4 migration. Values should be stored as native JSON types (numbers as JSON numbers, booleans as JSON booleans, strings as JSON strings) in the JSONB column, not coerced to strings. The Supabase Python client passes JSONB dicts through cleanly; no special encoding is needed.

The notes extension is low-risk: every previous entity (paper, website, github_repo, library, project) added notes via the same `ADD COLUMN IF NOT EXISTS experiment_id TEXT REFERENCES experiments(id) ON DELETE CASCADE` migration pattern. The `note_service.py` already routes by whichever FK is set; adding experiment support is one `elif experiment_id:` branch.

**Primary recommendation:** Clone the RQ tree pattern for ExperimentNode/ExperimentSection, add a KV editor sub-component for config/metrics, add the `experiment_id` FK to notes, and create a new `experiment_papers` join table mirroring `rq_papers`.

---

## Standard Stack

### Core (already installed — no new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.3.1 | Drag-and-drop primitives | Already used for RQ tree sibling reorder |
| @dnd-kit/sortable | ^10.0.0 | SortableContext + useSortable | Already used for RQ tree |
| @dnd-kit/utilities | included | CSS.Transform.toString | Already used |
| tiptap (via NotesPanel) | existing | WYSIWYG note editor | Already used for papers, websites, projects |
| Tailwind CSS 3 | ^3.x | Utility CSS | Project standard |
| React 18 | ^18.x | Component model | Project standard |

### No New Installations Required
All libraries needed for Phase 3 are already in `frontend/package.json`. The backend uses only the Supabase Python client (already installed) and standard FastAPI patterns.

**Installation:**
```bash
# Nothing to install — all dependencies are present
```

---

## Architecture Patterns

### Recommended Project Structure — New Files

```
backend/
├── models/experiment.py          # Experiment, ExperimentCreate, ExperimentUpdate
├── services/experiment_service.py # CRUD, reorder, experiment_papers links
├── routers/experiments.py         # POST/GET /api/projects/{id}/experiments
│                                  # PATCH/DELETE /api/experiments/{id}
│                                  # POST /api/experiments/{id}/reorder
│                                  # GET/POST/DELETE /api/experiments/{id}/papers
│                                  # GET/POST /api/experiments/{id}/notes
├── migrations/019_experiments.sql # experiments table + experiment_papers join + notes experiment_id FK

frontend/src/
├── pages/ProjectDetail.jsx        # Add ExperimentSection, ExperimentNode, KVEditor,
│                                  # ExperimentCreateModal, ExperimentStatusDropdown
│                                  # Add "experiments" tab to LeftNav
├── services/api.js                # Add experimentsApi, update notesApi
```

### Pattern 1: Experiment Data Model

**What:** Flat table with `parent_id` self-reference, `config` and `metrics` JSONB columns, optional `rq_id` FK.
**When to use:** Whenever data is hierarchical with unlimited nesting.

```python
# Source: mirrors backend/models/research_question.py
from typing import Optional, Any
from .base import CamelModel

class Experiment(CamelModel):
    id: str
    project_id: str
    parent_id: Optional[str] = None
    rq_id: Optional[str] = None
    name: str
    status: str = "planned"
    config: dict[str, Any] = {}    # JSONB — native types
    metrics: dict[str, Any] = {}   # JSONB — native types
    position: int = 0
    created_at: str
    updated_at: str

class ExperimentCreate(CamelModel):
    project_id: str = ""
    parent_id: Optional[str] = None
    rq_id: Optional[str] = None
    name: str
    status: str = "planned"
    config: dict[str, Any] = {}
    metrics: dict[str, Any] = {}
    position: int = 0

class ExperimentUpdate(CamelModel):
    name: Optional[str] = None
    status: Optional[Literal["planned", "running", "completed", "failed"]] = None
    parent_id: Optional[str] = None
    rq_id: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    metrics: Optional[dict[str, Any]] = None
    position: Optional[int] = None
```

### Pattern 2: Migration — experiments table

```sql
-- Source: mirrors 017_research_questions.sql pattern
CREATE TABLE IF NOT EXISTS experiments (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES experiments(id) ON DELETE CASCADE,
    rq_id       TEXT REFERENCES research_questions(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'planned',
    config      JSONB NOT NULL DEFAULT '{}',
    metrics     JSONB NOT NULL DEFAULT '{}',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_experiments_project_id ON experiments (project_id);
CREATE INDEX IF NOT EXISTS idx_experiments_parent_id  ON experiments (parent_id);
CREATE INDEX IF NOT EXISTS idx_experiments_rq_id      ON experiments (rq_id);

ALTER TABLE experiments DISABLE ROW LEVEL SECURITY;

-- experiment_papers join table
CREATE TABLE IF NOT EXISTS experiment_papers (
    id            TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    paper_id      TEXT REFERENCES papers(id) ON DELETE CASCADE,
    website_id    TEXT REFERENCES websites(id) ON DELETE CASCADE,
    github_repo_id TEXT REFERENCES github_repos(id) ON DELETE CASCADE,
    created_at    TEXT NOT NULL,
    CONSTRAINT experiment_papers_source_check CHECK (
        (paper_id IS NOT NULL)::int +
        (website_id IS NOT NULL)::int +
        (github_repo_id IS NOT NULL)::int = 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_papers_paper
    ON experiment_papers (experiment_id, paper_id) WHERE paper_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_papers_website
    ON experiment_papers (experiment_id, website_id) WHERE website_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_papers_repo
    ON experiment_papers (experiment_id, github_repo_id) WHERE github_repo_id IS NOT NULL;

ALTER TABLE experiment_papers DISABLE ROW LEVEL SECURITY;

-- Add experiment_id FK to notes
ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS experiment_id TEXT REFERENCES experiments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notes_experiment_id ON notes (experiment_id);
```

### Pattern 3: JSONB Config/Metrics — Type Auto-Detection

**What:** Frontend detects value type on save; stores as native JSON type.
**When to use:** All KV editor saves.

```javascript
// Source: project convention — store native types in JSONB
function detectType(raw) {
  const trimmed = raw.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const num = Number(trimmed)
  if (trimmed !== '' && !isNaN(num)) return num
  return trimmed  // string
}

// On KV row blur/enter:
const typedValue = detectType(rawInput)
const updatedConfig = { ...experiment.config, [key]: typedValue }
await experimentsApi.update(experiment.id, { config: updatedConfig })
```

### Pattern 4: Client-Side Recursive Aggregation

**What:** Compute status counts and metric ranges over all descendants without extra API calls.
**When to use:** Parent ExperimentNode rendering.

```javascript
// Source: follows project's "compute client-side, no extra calls" decision
function aggregateDescendants(node) {
  const counts = { planned: 0, running: 0, completed: 0, failed: 0 }
  const metricAccum = {}  // key → { min, max }

  function walk(n) {
    if (!n.children || n.children.length === 0) {
      // Leaf — count status
      if (n.status) counts[n.status] = (counts[n.status] || 0) + 1
      // Accumulate metrics
      Object.entries(n.metrics || {}).forEach(([k, v]) => {
        if (typeof v === 'number') {
          if (!metricAccum[k]) metricAccum[k] = { min: v, max: v }
          else {
            metricAccum[k].min = Math.min(metricAccum[k].min, v)
            metricAccum[k].max = Math.max(metricAccum[k].max, v)
          }
        }
      })
    } else {
      n.children.forEach(walk)
    }
  }

  node.children.forEach(walk)
  return { counts, metricAccum }
}
```

### Pattern 5: buildExperimentTree (copy of buildRqTree)

```javascript
// Source: ProjectDetail.jsx lines 41-54 — direct copy, rename fields
function buildExperimentTree(flatExperiments) {
  const byId = Object.fromEntries(flatExperiments.map(e => [e.id, { ...e, children: [] }]))
  const roots = []
  for (const exp of Object.values(byId)) {
    if (exp.parentId) byId[exp.parentId]?.children.push(exp)
    else roots.push(exp)
  }
  const sortLevel = nodes => {
    nodes.sort((a, b) => a.position - b.position)
    nodes.forEach(n => sortLevel(n.children))
  }
  sortLevel(roots)
  return roots
}
```

### Pattern 6: ExperimentStatusDropdown (copy of RQStatusDropdown)

```javascript
// Source: ProjectDetail.jsx lines 156-170 — copy with experiment status values
const experimentStatusConfig = {
  planned:   { label: 'Planned',   class: 'bg-blue-100 text-blue-700' },
  running:   { label: 'Running',   class: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', class: 'bg-emerald-100 text-emerald-700' },
  failed:    { label: 'Failed',    class: 'bg-red-100 text-red-700' },
}

function ExperimentStatusDropdown({ status, onChange }) {
  const cfg = experimentStatusConfig[status] || experimentStatusConfig.planned
  return (
    <select
      value={status || 'planned'}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex-shrink-0 ${cfg.class}`}
    >
      {Object.entries(experimentStatusConfig).map(([key, c]) => (
        <option key={key} value={key}>{c.label}</option>
      ))}
    </select>
  )
}
```

### Pattern 7: Note Service Extension

**What:** Add `experiment_id` as another source FK to `note_service.list_notes` and `note_service.create_note`. Update `_SOURCE_FIELDS` in note_service and the notes model.
**When to use:** EXP-10 — notes for experiments.

```python
# Source: backend/services/note_service.py — add elif branch
# In list_notes():
elif experiment_id:
    query = query.eq("experiment_id", experiment_id)

# In create_note() signature:
def create_note(
    data: NoteCreate,
    paper_id: Optional[str] = None,
    website_id: Optional[str] = None,
    github_repo_id: Optional[str] = None,
    library_id: Optional[str] = None,
    project_id: Optional[str] = None,
    experiment_id: Optional[str] = None,  # ADD
) -> Note:
```

Also update `_SOURCE_FIELDS` in note_service.py:
```python
_SOURCE_FIELDS = {"paper_id", "website_id", "github_repo_id", "library_id", "project_id", "experiment_id"}
```

And `Note` model in `backend/models/note.py`:
```python
experiment_id: Optional[str] = None
```

### Pattern 8: experimentsApi in api.js

```javascript
// Source: follows researchQuestionsApi pattern exactly
export const experimentsApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/experiments`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/experiments`, { method: 'POST', body: data }),
  update: (expId, data) => apiFetch(`/experiments/${expId}`, { method: 'PATCH', body: data }),
  remove: (expId) => apiFetch(`/experiments/${expId}`, { method: 'DELETE' }),
  reorder: (expId, ids) => apiFetch(`/experiments/${expId}/reorder`, { method: 'POST', body: { ids } }),
  listPapers: (expId) => apiFetch(`/experiments/${expId}/papers`),
  linkPaper: (expId, data) => apiFetch(`/experiments/${expId}/papers`, { method: 'POST', body: data }),
  unlinkPaper: (expId, linkId) => apiFetch(`/experiments/${expId}/papers/${linkId}`, { method: 'DELETE' }),
}

// Add to notesApi:
notesApi.listForExperiment = (expId) => apiFetch(`/experiments/${expId}/notes`)
notesApi.createForExperiment = (expId, data) => apiFetch(`/experiments/${expId}/notes`, { method: 'POST', body: data })
```

### Pattern 9: Router — absolute paths (same as research_questions router)

```python
# Source: research_questions.py — use absolute paths so project-scoped and
# experiment-scoped routes coexist without nested prefix gymnastics
router = APIRouter(tags=["experiments"])

@router.post("/api/projects/{project_id}/experiments", status_code=201)
@router.get("/api/projects/{project_id}/experiments")
@router.patch("/api/experiments/{exp_id}")
@router.delete("/api/experiments/{exp_id}", status_code=204)
@router.post("/api/experiments/{exp_id}/reorder", status_code=204)
@router.get("/api/experiments/{exp_id}/papers")
@router.post("/api/experiments/{exp_id}/papers", status_code=201)
@router.delete("/api/experiments/{exp_id}/papers/{link_id}", status_code=204)
@router.get("/api/experiments/{exp_id}/notes")
@router.post("/api/experiments/{exp_id}/notes", status_code=201)
```

### Pattern 10: Create Modal (modal dialog, not inline input)

Unlike RQs (which use inline text input), experiment creation uses a modal. The existing project codebase has no reusable `WindowModal` component — modals are built inline with a fixed overlay pattern. Build a simple overlay div:

```jsx
// No external modal library — matches project convention (no modal lib in package.json)
function ExperimentCreateModal({ projectId, parentId, onCreated, onClose }) {
  // name, status select, dynamic config KV rows
  // On submit: experimentsApi.create(projectId, { name, status, config, parent_id: parentId })
  // then onCreated(), onClose()
}
```

Modal overlay pattern (follows Header.jsx QuickAdd modal):
```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
  <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
    {/* content */}
  </div>
</div>
```

### Anti-Patterns to Avoid

- **String-coerced JSONB values:** Never store `config: { "lr": "0.001" }` — store `{ "lr": 0.001 }`. Type detection must happen before API call, not after retrieval.
- **Per-node paper fetching on render:** Do NOT fetch `experiment_papers` for each ExperimentNode individually on render. Fetch all experiment paper links in parallel after loading experiments (mirrors `rqPapersMap` pattern in `fetchRqPapers`).
- **Chaining `.select()` after `.eq()` on update/delete:** The Supabase client's `SyncFilterRequestBuilder` has no `.select()`. Always check existence first, execute mutation, then re-fetch. (CLAUDE.md explicitly documents this.)
- **Aggregation via API:** Parent summaries must be computed client-side from the already-loaded flat experiment list — no extra API calls per parent node.
- **Putting experiments in left-nav sidebar tree:** Experiments are self-contained within the "Experiments" tab only — locked decision.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive tree from flat list | Custom recursive reducer | `buildExperimentTree()` (copy of `buildRqTree()`) | Already battle-tested in Phase 2 |
| Drag-and-drop sortable | Custom mouse listeners | `@dnd-kit/core` + `useSortable` (already installed) | Handles pointer/touch, accessibility, overlay |
| WYSIWYG notes editor | Custom editor | `NotesPanel.jsx` with `experiment_id` prop | tiptap fully integrated; just add new note source |
| Search autocomplete for linking literature | Custom search dropdown | `MiniSearchPicker` component (copy for experiment context) | Already handles debounce, outside-click, multi-type results |
| Status badge pill | Custom CSS chip | Styled native `<select>` (copy `RQStatusDropdown` pattern) | Consistent with project status, RQ status patterns |
| Modal overlay | External modal library | Inline overlay div (matches Header.jsx QuickAdd pattern) | No modal lib in the project; keep pattern consistent |

**Key insight:** This phase is 80% copy-paste-extend. Every major UI pattern (tree, DnD, status dropdown, link picker, notes) already exists in `ProjectDetail.jsx` or `NotesPanel.jsx`. The only genuinely new UI is the KV editor and the parent summary aggregation chips.

---

## Common Pitfalls

### Pitfall 1: JSONB Update Replaces Entire Dict
**What goes wrong:** `PATCH /api/experiments/{id}` with `{ config: { "lr": 0.001 } }` replaces the entire config dict, losing other keys.
**Why it happens:** Supabase JSONB column update is not a merge — it sets the value wholesale.
**How to avoid:** Frontend must always send the **complete** updated config/metrics dict (not just the changed key). When editing a single KV pair, merge client-side before sending: `{ ...exp.config, [key]: newVal }`.
**Warning signs:** User edits one config key and sees other keys disappear.

### Pitfall 2: Aggregation on Shallow Children Only
**What goes wrong:** Parent summary shows only direct children's statuses/metrics, missing grandchildren.
**Why it happens:** `node.children.forEach(count)` without recursion only walks one level.
**How to avoid:** `aggregateDescendants` must `walk()` recursively to all leaf nodes.
**Warning signs:** Parent shows fewer experiments than the total in the subtree.

### Pitfall 3: KV Row Key Conflicts
**What goes wrong:** User renames a key (e.g., "lr" → "learning_rate") but the old key persists alongside the new one.
**Why it happens:** If the edit flow adds a new key without removing the old one.
**How to avoid:** Key rename needs to delete old key and add new key atomically client-side before sending the full dict. The edit UI should distinguish "editing existing key name" from "editing value of existing key".
**Warning signs:** Config has duplicate semantic entries after rename.

### Pitfall 4: Notes Source Field Collision
**What goes wrong:** A note with `experiment_id` set also has `project_id` set, causing it to appear in both project notes and experiment notes.
**Why it happens:** `create_note` receives both kwargs.
**How to avoid:** `_SOURCE_FIELDS` pattern in `note_service.update_note` already clears other source FKs on reassignment. For `create_note`, ensure only one source FK kwarg is non-None when calling from the experiment notes endpoint.
**Warning signs:** Experiment notes show up in project Notes tab.

### Pitfall 5: DnD Crossing Parent Boundaries
**What goes wrong:** DnD drag handler accidentally accepts cross-parent drops, causing an experiment to be silently reparented.
**Why it happens:** `closestCenter` finds the nearest droppable regardless of parent.
**How to avoid:** Copy the RQ tree pattern exactly — in `handleDragEnd`, if `draggedParentId !== targetParentId`, return early. Reparenting is context-menu only.
**Warning signs:** Dragging an experiment to a sibling of its parent moves it under that sibling.

### Pitfall 6: Empty JSONB on Insert
**What goes wrong:** `create_experiment` inserts `config=None` instead of `config={}`, causing null in JSONB column.
**Why it happens:** `ExperimentCreate.config` defaults to `{}` in Python, but if client sends `null` or omits the field, Pydantic may pass `None`.
**How to avoid:** In `ExperimentCreate`, keep `config: dict = {}` default. In `create_experiment` service, validate: `config = data.config or {}`.

---

## Code Examples

Verified patterns from existing codebase:

### Reorder Endpoint (same as RQ pattern)
```python
# Source: backend/routers/research_questions.py lines 71-74
class ReorderRequest(BaseModel):
    ids: List[str]

@router.post("/api/experiments/{exp_id}/reorder", status_code=204)
async def reorder_experiments(exp_id: str, body: ReorderRequest):
    experiment_service.reorder_experiments(body.ids)
```

### Service: reorder (N individual updates, same as rq_service)
```python
# Source: backend/services/rq_service.py lines 72-79
def reorder_experiments(exp_ids: list[str]) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    for position, exp_id in enumerate(exp_ids):
        get_client().table("experiments").update(
            {"position": position, "updated_at": now}
        ).eq("id", exp_id).execute()
```

### ID Format
```python
# Source: rq_service.py line 42 — project convention
id = f"exp_{uuid.uuid4().hex[:8]}"
```

### Delete with Cascade Log
```python
# Source: rq_service.py line 68
def delete_experiment(exp_id: str) -> bool:
    if get_experiment(exp_id) is None:
        return False
    get_client().table("experiments").delete().eq("id", exp_id).execute()
    logger.info("Deleted experiment %s (DB cascade removes children)", exp_id)
    return True
```

### Router Registration in app.py
```python
# Source: backend/app.py line 19 + 51-52 pattern
from routers import experiments  # add to import
app.include_router(experiments.router)  # add after research_questions
```

### ExperimentCreateModal — dynamic KV rows
```jsx
// Pattern: add rows via useState array, map to inputs
const [configRows, setConfigRows] = useState([{ key: '', value: '' }])

function addRow() {
  setConfigRows(prev => [...prev, { key: '', value: '' }])
}
function removeRow(i) {
  setConfigRows(prev => prev.filter((_, idx) => idx !== i))
}
function updateRow(i, field, val) {
  setConfigRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
}

// On submit, convert rows to typed dict:
const config = {}
configRows.forEach(({ key, value }) => {
  if (key.trim()) config[key.trim()] = detectType(value)
})
```

### LeftNav "Experiments" tab addition
```jsx
// Source: ProjectDetail.jsx lines 1246-1294 — add to navItems array
const navItems = [
  { id: 'overview',     icon: 'info',      label: 'Overview' },
  { id: 'literature',   icon: 'menu_book', label: 'Literature' },
  { id: 'experiments',  icon: 'science',   label: 'Experiments' },  // ADD
  { id: 'notes',        icon: 'edit_note', label: 'Notes' },
]
// Remove the "Coming Soon" placeholder block (lines 1279-1291)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| paper_id NOT NULL on notes | Nullable paper_id + multiple source FKs | Migration 003→016 series | Notes can belong to paper, website, repo, library, project — experiment adds one more |
| Inline text input for RQ create | Modal dialog for experiment create | Phase 3 design decision | Modal allows pre-filling config rows at creation time |
| RQ tree DnD cross-parent | Sibling-only DnD, context menu reparent | Phase 2 (implemented) | Same pattern for experiments — no new DnD logic needed |

**Deprecated/outdated:**
- Phase 3 placeholder block in `OverviewTab` (ProjectDetail.jsx lines 1331-1338): Remove the "Experiments will appear here in Phase 3" dashed placeholder — it will be replaced by the Experiments tab.
- `"Coming Soon"` placeholder in `LeftNav` (lines 1279-1291): Remove and replace with the active Experiments nav item.

---

## Open Questions

1. **Notes UX for experiments (Claude's Discretion)**
   - What we know: NotesPanel.jsx is a full-height tiptap editor with file tree, designed for the Paper.jsx full-page layout.
   - What's unclear: Whether to embed it inline in the Experiments tab (height-constrained) or show a slide-over/drawer when an experiment is selected for notes.
   - Recommendation: Use an **expand-in-place panel** below the experiment node — collapse by default, expand when "Notes" is clicked on the node. This avoids any new layout infrastructure. It mirrors how RQ hypothesis expands inline.

2. **rq_id dropdown content**
   - What we know: `rq_id` is an optional FK on experiments referencing `research_questions.id`.
   - What's unclear: Whether ExperimentSection needs to fetch the RQ list to populate the rq_id dropdown.
   - Recommendation: YES — fetch RQs in `ExperimentSection` alongside experiments (both scoped to `projectId`). The existing `researchQuestionsApi.list(projectId)` call is available. Pass RQ list as prop to `ExperimentNode` for the dropdown.

3. **Metric range display when no numeric metrics exist**
   - What we know: Metric chips show "key: min–max" for numeric values.
   - What's unclear: What to show when a parent's descendants have no numeric metrics.
   - Recommendation: Show only status counts; omit the metric range section entirely. Don't show "no metrics" text — status counts alone are sufficient.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no pytest.ini, jest.config, or vitest.config present |
| Config file | Wave 0 must create if validation is desired |
| Quick run command | N/A — no test runner configured |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | `POST /api/projects/{id}/experiments` creates experiment | integration | manual — no test runner | ❌ Wave 0 |
| EXP-03 | JSONB config/metrics stored with native types | unit | manual | ❌ Wave 0 |
| EXP-05 | Delete experiment cascades to children in DB | integration | manual | ❌ Wave 0 |
| EXP-06 | `aggregateDescendants()` returns correct counts+ranges | unit | manual | ❌ Wave 0 |
| EXP-10 | `GET /api/experiments/{id}/notes` returns experiment notes | integration | manual | ❌ Wave 0 |
| LIT-02 | `POST /api/experiments/{id}/papers` creates link with constraint check | integration | manual | ❌ Wave 0 |
| NAV-03 | ExperimentStatusDropdown renders correct color class per status | visual | manual | ❌ Wave 0 |

### Wave 0 Gaps
No automated test infrastructure exists in the project. All validation for Phase 3 will be manual functional testing:
- Create experiment via modal, verify it appears in tree
- Add config KV pairs, verify JSONB stored with native types (check Supabase table editor)
- Delete parent experiment, verify children removed
- Check parent node shows status counts + metric ranges
- Add note to experiment, verify it doesn't appear in project Notes tab
- Link paper to experiment, verify it appears in experiment's literature list

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `frontend/src/pages/ProjectDetail.jsx` — RQNode, RQSection, buildRqTree, flattenRqTree, MiniSearchPicker, LeftNav, RQStatusDropdown (all lines)
- Direct code inspection of `backend/services/rq_service.py` — CRUD, reorder, link patterns
- Direct code inspection of `backend/routers/research_questions.py` — absolute-path router pattern
- Direct code inspection of `backend/models/research_question.py` — model structure
- Direct code inspection of `backend/models/note.py` + `backend/services/note_service.py` — source FK extension pattern
- Direct code inspection of `backend/migrations/017_research_questions.sql` — table + join table + CHECK constraint pattern
- Direct code inspection of `backend/migrations/016_project_notes.sql`, `011_github_repo_notes_chat.sql`, `012_library_notes.sql` — notes FK addition pattern
- Direct code inspection of `frontend/src/services/api.js` — researchQuestionsApi, projectPapersApi patterns
- `CLAUDE.md` — `_SOURCE_FIELDS`, Supabase update pattern, CamelModel convention, ID format

### Secondary (MEDIUM confidence)
- `backend/models/project_paper.py` — CHECK constraint pattern for join tables (verified against 017 migration)
- `backend/app.py` — router registration pattern

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, verified in package.json
- Architecture: HIGH — directly derived from existing Phase 2 RQ tree patterns (code-inspected)
- Schema: HIGH — mirrors 017_research_questions.sql exactly; JSONB columns verified against Supabase Python client behavior
- Pitfalls: HIGH — JSONB whole-replace, DnD cross-parent, source field collision all observed from code inspection of existing service patterns
- Aggregation pattern: HIGH — client-side recursive design verified against CONTEXT.md decision

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable tech stack; no external API dependencies)
