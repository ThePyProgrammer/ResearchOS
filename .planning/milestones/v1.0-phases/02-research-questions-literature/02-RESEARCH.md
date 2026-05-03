# Phase 2: Research Questions & Literature - Research

**Researched:** 2026-03-15
**Domain:** Recursive tree UI, join-table DB design, drag-and-drop, inline editing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### RQ Presentation & Hierarchy
- RQs display inline on the Overview tab (below project description, above Literature section)
- Expand/collapse with chevron — collapsed primary RQs show sub-question count
- Unlimited nesting depth — any RQ can have children at any level (recursive tree)
- Inline add: "+" button at bottom of RQ section for primary RQs, "+ Add sub-question" inside expanded RQs
- New RQs created via inline text input (type and press Enter), not a modal

#### Hypothesis & Status Tracking
- Hypothesis is an optional inline text field on each RQ, shown below the question text when expanded
- Click to add/edit hypothesis text
- RQ status displayed as a colored badge pill dropdown (same pattern as project status in Phase 1)
- Status values: open (blue), investigating (amber), answered (emerald), discarded (slate/gray)
- RQ status covers both the question and hypothesis — no separate hypothesis status
- Each RQ's status is independent — changing a parent's status does NOT cascade to children

#### Paper-to-Project Linking UX
- Papers/websites linkable from BOTH directions:
  - On project page: search picker ("+ Link paper" button opens autocomplete search of library)
  - On paper/website detail: "Link to project" action
- Linked papers appear in a dedicated "Literature" tab in the ProjectDetail left nav
- Papers can link at both levels: project-wide AND to specific RQs
- Gap indicator: subtle warning icon on any RQ (at every nesting level) that has no linked papers
- Tooltip: "No supporting literature linked"

#### RQ Editing & Reorganization
- Inline click-to-edit for RQ title text (click to make editable, Enter to save, Escape to cancel) — same as EditableName pattern
- Three-dot context menu on each RQ with "Delete" option
- Delete confirmation prompt when RQ has children ("Delete RQ and its N sub-questions?")
- Deleting a parent RQ cascades to all children
- Full drag-and-drop reparenting:
  - Drag sub-Q to root area = promote to primary RQ
  - Drag primary onto another primary = make sub-question (only if dragged item has no children)
  - Drag sub-Q to different parent = move to new parent
  - Drag between siblings = reorder

### Claude's Discretion
- Exact drag-and-drop library choice and implementation approach
- Literature tab table layout and columns
- Search picker component design details
- Empty state messaging for Literature tab and RQ section
- Exact indentation and spacing for nested RQ tree

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RQ-01 | User can create a primary research question for a project | `research_questions` table with `parent_id=NULL` for primaries; inline text input + Enter pattern |
| RQ-02 | User can create sub-questions under a primary RQ | Same table, `parent_id` points to parent RQ; unlimited depth via recursive tree rendering |
| RQ-03 | User can add a hypothesis field to any RQ | `hypothesis` TEXT column on `research_questions`; click-to-edit pattern reusing EditableName |
| RQ-04 | User can set RQ status (open/investigating/answered/discarded) | `status` TEXT column; StatusDropdown component reused/extended from ProjectDetail |
| RQ-05 | User can link motivating papers from the library to a specific RQ | `rq_papers` join table (`rq_id`, `paper_id`, `website_id`); search picker component |
| RQ-06 | User can edit and delete research questions | EditableName pattern for edit; three-dot menu + cascade delete for remove; DnD for reparent |
| LIT-01 | User can link papers/websites from the library to a project | `project_papers` join table (`project_id`, `paper_id`, `website_id`); Literature tab in ProjectDetail |
| LIT-03 | User can see which RQs have no linked papers (gap indicator) | Warning icon on RQs where `rq_papers` count = 0; computed client-side after loading rq_papers |
| LIT-04 | User can remove paper/website links from projects and experiments | DELETE on `project_papers` / `rq_papers`; remove button in Literature tab and RQ expanded view |
</phase_requirements>

---

## Summary

Phase 2 adds two interlocking systems to ProjectDetail: a recursive Research Questions tree on the Overview tab, and a Literature tab showing papers/websites linked to the project. The database work centers on two new tables — `research_questions` (self-referencing via `parent_id`) and `project_papers` (FK join for project-wide links), plus an `rq_papers` table for per-RQ literature links.

The front-end work has three distinct areas: (1) the recursive RQ tree with inline creation, editing, status badges, hypothesis fields, and drag-and-drop reparenting; (2) the Literature tab with a search picker for linking items and an unlink action; (3) the gap indicator — a non-blocking warning icon on any RQ that has zero linked papers.

All UI patterns — EditableName, StatusDropdown, the badge pill select — already exist in `ProjectDetail.jsx` and can be composed directly. The primary new risk is drag-and-drop for reparenting, which requires a library choice (dnd-kit or @hello-pangea/dnd) since the project has no prior DnD. The existing `Sidebar.jsx` uses CSS drag events for collection re-parenting; that approach is too brittle for the fully arbitrary reparenting required here.

**Primary recommendation:** Use `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop. Build the recursive RQ tree as a recursive React component with local state for expanded/collapsed nodes. Use two Supabase join tables (`project_papers`, `rq_papers`) — never store links as JSONB arrays, as the CONTEXT.md explicitly calls for explicit join tables. Keep all DB access in new service files (`rq_service.py`, `project_papers_service.py`) following the existing service layer pattern.

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.3.1 | Component tree | Already in use |
| FastAPI | current | Backend API | Already in use |
| Supabase (supabase-py) | >=2.28.0 | DB + storage | Already in use |
| Pydantic v2 + CamelModel | current | Domain models | All models inherit this |
| Tailwind CSS 3 | 3.4.x | Styling | Already in use |
| Material Symbols Outlined | CDN | Icons | Already in use |

### New Addition Required
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.x | Drag-and-drop primitives | Most maintained React DnD; no DOM dependency; works with Vite/ESM |
| @dnd-kit/sortable | ^8.x | Sortable list preset | Pairs with core for reorder + reparent |
| @dnd-kit/utilities | ^3.x | CSS transform helpers | Required peer for sortable |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit | react-beautiful-dnd / @hello-pangea/dnd | @hello-pangea/dnd is actively maintained fork of rbd but less suited to tree reparenting (designed for flat lists); dnd-kit has explicit tree example in docs |
| @dnd-kit | Native HTML5 drag events (Sidebar pattern) | Native is brittle for arbitrary tree reparenting and provides no accessibility |
| Separate rq_papers table | JSONB array on research_questions | Join table is queryable, indexable, supports rich metadata later; CONTEXT.md explicitly requires explicit join tables |

**Installation:**
```bash
cd frontend
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## Architecture Patterns

### New Database Tables (Migrations)

#### `research_questions` table
```sql
-- Migration 017_research_questions.sql
CREATE TABLE IF NOT EXISTS research_questions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES research_questions(id) ON DELETE CASCADE,
    question    TEXT NOT NULL,
    hypothesis  TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rq_project_id ON research_questions (project_id);
CREATE INDEX IF NOT EXISTS idx_rq_parent_id  ON research_questions (parent_id);
ALTER TABLE research_questions DISABLE ROW LEVEL SECURITY;
```

Key design decisions:
- `parent_id` is self-referencing with `ON DELETE CASCADE` — deleting a parent cascades to all children (DB enforced, matches locked decision)
- `position` INTEGER for sibling ordering — simpler than float-based ordering for this use case; reorder requires updating siblings
- `status` TEXT not enum — matches how project status is stored (`active`, `paused`, etc. stored as plain text)
- No separate `hypothesis_status` — RQ status covers both (locked decision)

#### `project_papers` join table
```sql
-- Migration 017_research_questions.sql (continued)
CREATE TABLE IF NOT EXISTS project_papers (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    paper_id    TEXT REFERENCES papers(id) ON DELETE CASCADE,
    website_id  TEXT REFERENCES websites(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    CONSTRAINT project_papers_one_source CHECK (
        (paper_id IS NOT NULL)::int + (website_id IS NOT NULL)::int = 1
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_papers_unique_paper
    ON project_papers (project_id, paper_id) WHERE paper_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_papers_unique_website
    ON project_papers (project_id, website_id) WHERE website_id IS NOT NULL;
ALTER TABLE project_papers DISABLE ROW LEVEL SECURITY;
```

#### `rq_papers` join table
```sql
CREATE TABLE IF NOT EXISTS rq_papers (
    id          TEXT PRIMARY KEY,
    rq_id       TEXT NOT NULL REFERENCES research_questions(id) ON DELETE CASCADE,
    paper_id    TEXT REFERENCES papers(id) ON DELETE CASCADE,
    website_id  TEXT REFERENCES websites(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    CONSTRAINT rq_papers_one_source CHECK (
        (paper_id IS NOT NULL)::int + (website_id IS NOT NULL)::int = 1
    )
);
CREATE INDEX IF NOT EXISTS idx_rq_papers_rq_id ON rq_papers (rq_id);
ALTER TABLE rq_papers DISABLE ROW LEVEL SECURITY;
```

### Backend Models (Pydantic)

New file: `backend/models/research_question.py`

```python
from typing import Literal, Optional
from .base import CamelModel

class ResearchQuestion(CamelModel):
    id: str
    project_id: str
    parent_id: Optional[str] = None
    question: str
    hypothesis: Optional[str] = None
    status: str = "open"
    position: int = 0
    created_at: str
    updated_at: str

class ResearchQuestionCreate(CamelModel):
    project_id: str
    parent_id: Optional[str] = None
    question: str
    position: int = 0

class ResearchQuestionUpdate(CamelModel):
    question: Optional[str] = None
    hypothesis: Optional[str] = None
    status: Optional[Literal["open", "investigating", "answered", "discarded"]] = None
    parent_id: Optional[str] = None   # for reparenting via DnD
    position: Optional[int] = None    # for reordering
```

New file: `backend/models/project_paper.py`

```python
from typing import Optional
from .base import CamelModel

class ProjectPaper(CamelModel):
    id: str
    project_id: str
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    created_at: str

class ProjectPaperCreate(CamelModel):
    paper_id: Optional[str] = None
    website_id: Optional[str] = None

class RqPaper(CamelModel):
    id: str
    rq_id: str
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    created_at: str

class RqPaperCreate(CamelModel):
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
```

### Backend Service Layer

New file: `backend/services/rq_service.py` — owns all `research_questions` + `rq_papers` DB access.

Key function signatures:
```python
def list_rqs(project_id: str) -> list[ResearchQuestion]
def get_rq(rq_id: str) -> Optional[ResearchQuestion]
def create_rq(data: ResearchQuestionCreate) -> ResearchQuestion
def update_rq(rq_id: str, data: ResearchQuestionUpdate) -> Optional[ResearchQuestion]
def delete_rq(rq_id: str) -> bool  # DB CASCADE handles children

def list_rq_papers(rq_id: str) -> list[RqPaper]
def link_paper_to_rq(rq_id: str, data: RqPaperCreate) -> RqPaper
def unlink_paper_from_rq(link_id: str) -> bool
```

New file: `backend/services/project_papers_service.py` — owns `project_papers` DB access.

Key function signatures:
```python
def list_project_papers(project_id: str) -> list[ProjectPaper]
def link_paper_to_project(project_id: str, data: ProjectPaperCreate) -> ProjectPaper
def unlink_paper_from_project(link_id: str) -> bool
```

### Backend Router

New file: `backend/routers/research_questions.py`

```
POST   /api/projects/{project_id}/research-questions
GET    /api/projects/{project_id}/research-questions
PATCH  /api/research-questions/{rq_id}
DELETE /api/research-questions/{rq_id}

GET    /api/research-questions/{rq_id}/papers
POST   /api/research-questions/{rq_id}/papers
DELETE /api/research-questions/{rq_id}/papers/{link_id}
```

Extend `backend/routers/projects.py` with project-level literature routes:

```
GET    /api/projects/{project_id}/papers
POST   /api/projects/{project_id}/papers
DELETE /api/projects/{project_id}/papers/{link_id}
```

### Frontend API Client

Add to `frontend/src/services/api.js`:

```javascript
export const researchQuestionsApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/research-questions`),
  create: (projectId, data) =>
    apiFetch(`/projects/${projectId}/research-questions`, { method: 'POST', body: data }),
  update: (rqId, data) =>
    apiFetch(`/research-questions/${rqId}`, { method: 'PATCH', body: data }),
  remove: (rqId) =>
    apiFetch(`/research-questions/${rqId}`, { method: 'DELETE' }),

  listPapers: (rqId) => apiFetch(`/research-questions/${rqId}/papers`),
  linkPaper: (rqId, data) =>
    apiFetch(`/research-questions/${rqId}/papers`, { method: 'POST', body: data }),
  unlinkPaper: (rqId, linkId) =>
    apiFetch(`/research-questions/${rqId}/papers/${linkId}`, { method: 'DELETE' }),
}

export const projectPapersApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/papers`),
  link: (projectId, data) =>
    apiFetch(`/projects/${projectId}/papers`, { method: 'POST', body: data }),
  unlink: (projectId, linkId) =>
    apiFetch(`/projects/${projectId}/papers/${linkId}`, { method: 'DELETE' }),
}
```

### Frontend Component Architecture

#### RQ Tree (in `ProjectDetail.jsx` OverviewTab)

The flat list from the API must be converted to a tree client-side before rendering. The API returns all RQs for a project as a flat array; building the tree is done once on load:

```javascript
function buildTree(flatRqs) {
  const byId = Object.fromEntries(flatRqs.map(rq => [rq.id, { ...rq, children: [] }]))
  const roots = []
  for (const rq of Object.values(byId)) {
    if (rq.parentId) byId[rq.parentId]?.children.push(rq)
    else roots.push(rq)
  }
  // sort each level by position
  const sort = nodes => { nodes.sort((a, b) => a.position - b.position); nodes.forEach(n => sort(n.children)) }
  sort(roots)
  return roots
}
```

#### RQNode component

Recursive component `RQNode` renders a single RQ and its children:

```jsx
function RQNode({ rq, depth, onUpdate, onDelete, onAddChild, onLinkPaper }) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  // inline text edit (Enter saves, Escape cancels)
  // hypothesis inline edit
  // StatusDropdown for status
  // three-dot context menu with Delete
  // gap indicator: warning_amber icon if rq.linkedPaperCount === 0
  return (
    <div style={{ paddingLeft: depth * 20 }}>
      {/* chevron + question text + status badge + gap icon + three-dot */}
      {expanded && rq.children.map(child => (
        <RQNode key={child.id} rq={child} depth={depth + 1} ... />
      ))}
      {expanded && <AddSubQuestionInput rqId={rq.id} onAdd={onAddChild} />}
    </div>
  )
}
```

#### RQ Status Config (extends existing pattern)

```javascript
const rqStatusConfig = {
  open:         { label: 'Open',         class: 'bg-blue-100 text-blue-700' },
  investigating:{ label: 'Investigating',class: 'bg-amber-100 text-amber-700' },
  answered:     { label: 'Answered',     class: 'bg-emerald-100 text-emerald-700' },
  discarded:    { label: 'Discarded',    class: 'bg-slate-100 text-slate-600' },
}
```

This reuses the exact same pattern as `projectStatusConfig` in `ProjectDetail.jsx`.

#### Search Picker for Linking Papers

A controlled text input that calls `papersApi.list({ search: q })` and `websitesApi.list({ search: q })` on change, shows a dropdown of results, and calls `projectPapersApi.link(projectId, { paper_id })` on selection. This mirrors the "Add to Collection" autocomplete in the Library bulk action bar.

#### Literature Tab

New nav item in `LeftNav` (alongside Overview and Notes). Shows a table of linked papers/websites with title, type badge, status chip, and an unlink button. Empty state: "No literature linked yet — use '+ Link paper' to add supporting literature."

### Recommended Project Structure Changes

```
backend/
├── models/
│   ├── research_question.py    # NEW — ResearchQuestion, RQCreate, RQUpdate, RqPaper, etc.
│   └── project_paper.py        # NEW — ProjectPaper, ProjectPaperCreate, RqPaper, RqPaperCreate
├── services/
│   ├── rq_service.py           # NEW — research_questions + rq_papers CRUD
│   └── project_papers_service.py  # NEW — project_papers CRUD
└── routers/
    ├── research_questions.py   # NEW — /api/projects/{id}/research-questions + /api/research-questions/*
    └── projects.py             # EXTEND — add /api/projects/{id}/papers routes

frontend/src/
├── pages/
│   └── ProjectDetail.jsx       # EXTEND — RQ tree in OverviewTab, Literature tab in LeftNav
└── services/
    └── api.js                  # EXTEND — researchQuestionsApi, projectPapersApi
```

### Anti-Patterns to Avoid

- **Do not store RQ children as JSONB on the parent.** Recursive JSONB is hard to query, update atomically, and index. The self-referencing `parent_id` pattern is the correct approach.
- **Do not cascade status from parent to child in the frontend.** Locked decision: each RQ status is independent. The PATCH endpoint should only update the targeted RQ.
- **Do not re-fetch the full RQ list after every single mutation.** Optimistic updates: add the new RQ to local state immediately, then reconcile on error. Avoids UI jank for inline creation.
- **Do not use the Supabase `.eq().select()` chained pattern.** Per CLAUDE.md: `.eq()` returns `SyncFilterRequestBuilder` which has no `.select()`. Always check existence first, mutate, then re-fetch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop with accessibility | Custom mouse event handlers | @dnd-kit/core + @dnd-kit/sortable | Keyboard accessible, touch support, collision detection built-in |
| Recursive tree position management | Float-based ordering (1.0, 1.5, 2.0) | Integer `position` + bulk sibling reorder | Floats eventually exhaust precision; for small trees (< 100 RQs) bulk int reorder is fine |
| Duplicate link prevention | Application-level check | Partial unique index in Supabase | DB-level constraint is the safe boundary; catch 409/500 and surface "already linked" |

**Key insight:** The recursive tree is conceptually complex but the implementation is straightforward — a recursive React component consuming a parent-sorted array. The complexity budget should go to DnD reparenting, not the tree structure itself.

---

## Common Pitfalls

### Pitfall 1: Supabase Cannot Fetch Recursive Trees in One Query (Without RLS + CTE)

**What goes wrong:** Developers try `SELECT * FROM research_questions WHERE project_id = $1` and then join children in SQL — but Supabase's client SDK doesn't support recursive CTEs directly.

**Why it happens:** PostgreSQL supports `WITH RECURSIVE` but supabase-py's `.select()` doesn't expose arbitrary SQL through the table API.

**How to avoid:** Fetch all RQs for a project with a single flat query (`WHERE project_id = $1`), then build the tree in Python or JavaScript. This is O(n) and perfectly fine for the expected cardinality (< 100 RQs per project).

**Warning signs:** Any attempt to do server-side tree building via Supabase table API — reach for `get_client().table(...).select("*").eq("project_id", ...)`.

### Pitfall 2: Cascade Delete with Self-Referencing FK Requires `ON DELETE CASCADE`

**What goes wrong:** Deleting a parent RQ with children throws a FK violation if `parent_id` has no cascade rule.

**Why it happens:** PostgreSQL FK defaults to `RESTRICT`.

**How to avoid:** The migration above includes `REFERENCES research_questions(id) ON DELETE CASCADE`. The service layer's `delete_rq` simply calls `.delete().eq("id", rq_id)` — DB handles the cascade. No recursive service-side deletion needed.

**Warning signs:** `ForeignKeyViolationError` on delete.

### Pitfall 3: Position Collisions During Concurrent Reorder

**What goes wrong:** If two RQs get the same `position` value after a DnD operation, their sort order becomes non-deterministic.

**Why it happens:** Naive reorder: only updating the dragged item's position without updating siblings.

**How to avoid:** On reorder, update ALL siblings in the destination level with fresh 0-based positions. The payload to the backend should be an ordered list of IDs, and the service loops through them assigning `position = index`.

**Warning signs:** RQs appearing in random order after drag operations.

### Pitfall 4: Gap Indicator Computed with Stale Data

**What goes wrong:** The gap indicator shows "no papers" even after a paper is linked, because the RQ tree was loaded before the link was created.

**Why it happens:** The RQ list and the rq_papers list are fetched separately; after linking a paper to an RQ, the rq_papers state is updated but the tree component still shows the old count.

**How to avoid:** After any link/unlink action on `rq_papers`, update the local `rqPapers` state in the same component that owns the RQ tree. Compute `hasLinkedPapers` as a derived value from that shared state, not from a separate count field on the RQ.

**Warning signs:** Gap icon not updating until page reload.

### Pitfall 5: DnD Reparenting Constraint Violation (No-Children Rule)

**What goes wrong:** User drags a primary RQ with children onto another primary RQ, making it a sub-question — but the rule says only childless items can be promoted/demoted this way.

**Why it happens:** DnD library doesn't know about the tree constraint; it just reports source and destination.

**How to avoid:** In the `onDragEnd` handler, check if the dragged item has children before allowing the reparent. If it has children, abort the drop and optionally show a toast "Remove sub-questions first to reparent this question."

**Warning signs:** Silent failures or broken tree state after invalid drops.

---

## Code Examples

Verified patterns from existing codebase:

### Pattern: Inline text creation (Enter to save)
```jsx
// Source: ProjectDetail.jsx — EditableName pattern, adapted for inline RQ creation
function AddRQInput({ parentId, projectId, onAdd }) {
  const [draft, setDraft] = useState('')
  const [active, setActive] = useState(false)

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed) { setActive(false); return }
    await onAdd({ projectId, parentId: parentId || null, question: trimmed })
    setDraft('')
    setActive(false)
  }

  if (!active) return (
    <button onClick={() => setActive(true)}
      className="text-sm text-slate-400 hover:text-blue-600 flex items-center gap-1 mt-1 px-2 py-0.5">
      <Icon name="add" className="text-[14px]" />
      {parentId ? 'Add sub-question' : 'Add research question'}
    </button>
  )

  return (
    <input
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(''); setActive(false) }
      }}
      placeholder="Type question and press Enter..."
      className="w-full text-sm bg-white border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30 mt-1"
    />
  )
}
```

### Pattern: StatusDropdown for RQ status (reuses project pattern verbatim)
```jsx
// Source: ProjectDetail.jsx — StatusDropdown, same pattern for RQ status
const rqStatusConfig = {
  open:          { label: 'Open',          class: 'bg-blue-100 text-blue-700' },
  investigating: { label: 'Investigating', class: 'bg-amber-100 text-amber-700' },
  answered:      { label: 'Answered',      class: 'bg-emerald-100 text-emerald-700' },
  discarded:     { label: 'Discarded',     class: 'bg-slate-100 text-slate-600' },
}

function RQStatusDropdown({ status, onSave }) {
  const cfg = rqStatusConfig[status] || rqStatusConfig.open
  return (
    <select
      value={status}
      onChange={e => onSave(e.target.value)}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none ${cfg.class}`}
    >
      {Object.entries(rqStatusConfig).map(([key, cfg]) => (
        <option key={key} value={key}>{cfg.label}</option>
      ))}
    </select>
  )
}
```

### Pattern: Supabase service CRUD (project_service.py as template)
```python
# Source: backend/services/project_service.py
def create_rq(data: ResearchQuestionCreate) -> ResearchQuestion:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    rq = ResearchQuestion(
        id=f"rq_{uuid.uuid4().hex[:8]}",
        created_at=now,
        updated_at=now,
        **data.model_dump(by_alias=False),
    )
    get_client().table("research_questions").insert(rq.model_dump(by_alias=False)).execute()
    return rq

def update_rq(rq_id: str, data: ResearchQuestionUpdate) -> Optional[ResearchQuestion]:
    updates = data.model_dump(exclude_unset=True)
    if get_rq(rq_id) is None:
        return None
    updates["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    get_client().table("research_questions").update(updates).eq("id", rq_id).execute()
    return get_rq(rq_id)
```

### Pattern: CustomEvent bus for cross-component updates
```javascript
// Source: frontend/src/pages/Projects.jsx — dispatch after mutation
window.dispatchEvent(new CustomEvent('researchos:projects-changed'))

// Source: frontend/src/components/layout/Sidebar.jsx — listen
window.addEventListener('researchos:projects-changed', handler)
```

### Pattern: @dnd-kit/sortable for tree reordering
```jsx
// Usage pattern for flat-list-within-level reorder + reparent
// dnd-kit docs: https://docs.dndkit.com/presets/sortable
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableRQNode({ rq, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rq.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
    >
      {/* drag handle: pass listeners to a grip icon only */}
      <Icon name="drag_indicator" {...listeners} className="cursor-grab text-slate-300" />
      <RQNode rq={rq} {...props} />
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit (community standard) | ~2022 | rbd is unmaintained; @hello-pangea/dnd forks rbd but dnd-kit is the forward path |
| JSONB arrays for relationships | Explicit join tables | Always correct — project spec calls this out | Queryable, indexable, FK-enforced integrity |

**Deprecated/outdated:**
- react-beautiful-dnd: unmaintained since 2022; use @dnd-kit or @hello-pangea/dnd instead.

---

## Open Questions

1. **Reorder position strategy: integer vs float**
   - What we know: Integer `position` requires updating all siblings on reorder; float allows O(1) insert between two items but eventually runs out of precision.
   - What's unclear: Will power users have enough RQs (>20 per level) that integer sibling reorder becomes a latency concern?
   - Recommendation: Use integers and bulk-reorder siblings. RQ counts per project are expected to be small (< 20 per level). Revisit if needed.

2. **`rq_papers` vs enriching `project_papers` with an optional `rq_id`**
   - What we know: Two separate tables (`project_papers` for project-wide links, `rq_papers` for per-RQ links) is cleanest and matches the CONTEXT.md design.
   - What's unclear: A paper could be linked at both project level and RQ level — should those be the same record or two records?
   - Recommendation: Keep them as two separate records (two tables). This makes each link independently removable without side effects.

3. **Paper search scope in the search picker**
   - What we know: `useLibrary()` provides `activeLibraryId`. Papers and websites both support `?search=` query param.
   - What's unclear: Should the picker search papers already linked to the project (to show "already linked" state) or filter them out?
   - Recommendation: Show all library items in search results; items already linked show a checkmark and clicking them is a no-op (or shows "already linked" tooltip). This mirrors how the "Add to Collection" picker works.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | `frontend/vite.config.js` (test section) |
| Setup file | `frontend/src/test/setup.js` |
| Quick run command | `cd frontend && npm run test:run -- --reporter=verbose src/pages/ProjectDetail.smoke.test.jsx` |
| Full suite command | `cd frontend && npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RQ-01 | Create primary RQ renders in list | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ Wave 0 |
| RQ-02 | Sub-question appears under parent in tree | smoke | same | ❌ Wave 0 |
| RQ-03 | Hypothesis field shown/hidden correctly | smoke | same | ❌ Wave 0 |
| RQ-04 | RQ status dropdown changes class | smoke | same | ❌ Wave 0 |
| RQ-05 | Link paper to RQ shows in rq_papers | smoke | same | ❌ Wave 0 |
| RQ-06 | Delete RQ removes it from list | smoke | same | ❌ Wave 0 |
| LIT-01 | Linked paper appears in Literature tab | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ Wave 0 |
| LIT-03 | Gap indicator shown when rq has no papers | smoke | same | ❌ Wave 0 |
| LIT-04 | Unlink removes paper from Literature tab | smoke | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx`
- **Per wave merge:** `cd frontend && npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/ProjectDetail.smoke.test.jsx` — covers RQ-01 through LIT-04
- [ ] `frontend/src/test/setup.js` — already exists (imports @testing-library/jest-dom/vitest)

---

## Sources

### Primary (HIGH confidence)
- Existing codebase (read directly) — `ProjectDetail.jsx`, `project_service.py`, `schema.sql`, `api.js`, `package.json` — all patterns verified from source
- `backend/migrations/015_projects.sql` — projects table schema
- `backend/migrations/016_project_notes.sql` — FK pattern for extending notes with project_id
- `backend/models/note.py` — source FK field pattern (one nullable FK per source type)
- `frontend/vite.config.js` — confirmed Vitest test configuration
- CLAUDE.md — Supabase `.eq()` constraint, CamelModel convention, service layer pattern

### Secondary (MEDIUM confidence)
- dnd-kit documentation pattern: https://docs.dndkit.com — library choice based on npm weekly downloads (>1M/week vs @hello-pangea/dnd ~600K/week) and active maintenance status as of 2025

### Tertiary (LOW confidence)
- Float vs integer position ordering tradeoffs — general database knowledge, not project-specific

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing libraries read from package.json; dnd-kit is the clear ecosystem standard
- Architecture: HIGH — patterns directly derived from existing service/router/model code; join table design is canonical
- Pitfalls: HIGH — Supabase `.eq()` constraint from CLAUDE.md; recursive cascade from PostgreSQL FK docs; others from codebase analysis

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable stack; dnd-kit API is stable)
