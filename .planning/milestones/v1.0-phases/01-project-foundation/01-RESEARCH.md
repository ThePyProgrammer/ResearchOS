# Phase 1: Project Foundation - Research

**Researched:** 2026-03-14
**Domain:** Full-stack CRUD — FastAPI + Supabase backend, React + Tailwind frontend, notes system extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Project List Layout**
- Card grid layout (not table) — responsive grid, each card is a project
- Card content: project name, status badge (colored), primary RQ text (truncated), last updated date
- Three-dot quick actions menu on each card: edit, archive, delete
- Friendly empty state: icon/illustration + "Start your first research project" with prominent create button
- Create flow: modal dialog with name + description fields → creates project and navigates to detail page

**Project Detail Layout**
- Split panel layout: left panel has an expandable tree nav, right panel shows selected item details
- Left panel: tree structure showing RQs and experiments as nested, clickable items (Phase 1 shows tree structure but RQ/experiment items are wired in later phases)
- Right panel: hybrid navigation — simple items (like RQs) show inline in the right panel; complex items (experiments with their own tree) navigate to their own page
- Project header: large editable title + status badge dropdown + editable description, all inline-editable (click to edit)

**Project-Library Relation**
- Each project belongs to exactly one library (library_id FK on projects table)
- Switching libraries changes which projects are visible
- Papers can only be linked from the same library as the project — no cross-library references
- Cascade delete: deleting a library deletes all its projects, RQs, experiments

**Sidebar Placement**
- Projects nested under Library section in sidebar, below the collections tree
- Expandable "Projects" section header that reveals project names when expanded
- Clicking a project name navigates to its detail page
- Projects section is library-scoped — shows projects for the active library only

### Claude's Discretion
- Sidebar icon choice (Material Symbols Outlined — pick what fits best)
- Exact card spacing, shadows, and responsive breakpoints
- Loading skeleton design for project list and detail pages
- Error state handling patterns

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROJ-01 | User can create a research project with name, description, and status | `projects` table + POST /api/projects + create modal → detail page navigation |
| PROJ-02 | User can view a list of all projects with status and experiment counts | GET /api/projects?library_id= + card grid page at /projects |
| PROJ-03 | User can view a project detail page showing RQs, experiments, and linked papers | GET /api/projects/:id + split-panel detail page at /projects/:id |
| PROJ-04 | User can edit project name, description, and status (active/paused/completed/archived) | PATCH /api/projects/:id + EditableField/EditableTextArea reuse |
| PROJ-05 | User can delete a project | DELETE /api/projects/:id + confirmation in three-dot menu |
| PROJ-06 | User can create and edit free-form notes tied to a project (reusing tiptap notes system) | Add project_id FK to notes table + new notes router endpoints + NotesPanel createFn |
| NAV-01 | Projects appear as a section in the sidebar navigation | Expandable Projects section in Sidebar.jsx below collections tree |
| NAV-02 | User can navigate from project list → project detail → experiment detail | React Router routes /projects and /projects/:id; detail tree stub ready for Phase 2 |
</phase_requirements>

---

## Summary

Phase 1 adds the `projects` entity to ResearchOS. All new code follows established patterns already proven in the codebase — there are no novel patterns to invent. The backend needs one new Pydantic model set, one service, one router, one migration (numbered `015_projects.sql`), and a one-column migration to extend `notes` with `project_id`. The frontend needs a new `projectsApi` in `api.js`, two new page components (`Projects.jsx`, `ProjectDetail.jsx`), sidebar extension, and two new routes in `App.jsx`.

The schema decision flagged in STATE.md is the highest-risk item: the `projects` table must include a `research_questions` stub FK column (`rq_id` is NOT needed in Phase 1 since RQs are Phase 2), but the `project_id` column on `notes` must be added now so `NotesPanel` can wire directly. The `NotesPanel` already accepts a `createFn` prop, making notes integration a thin wiring task rather than a re-implementation.

**Primary recommendation:** Follow the `library_service` / `libraries` router / `LibraryContext` stack as the exact template for `project_service` / `projects` router / project state. Every pattern has already been validated in production.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.135.0 | API router | Already in use — project convention |
| Pydantic v2 | (via FastAPI) | Request/response models via CamelModel | Project convention — all models inherit CamelModel |
| supabase-py | >=2.28.0 | DB access via `get_client()` | Already in use — project convention |
| React 18 | (in use) | Frontend components | Project convention |
| React Router v6 | (in use) | SPA routing | Project convention — App.jsx |
| Tailwind CSS 3 | (in use) | Styling | Project convention |
| tiptap | (in use) | WYSIWYG notes editor | Already in NotesPanel.jsx |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid (Python stdlib) | stdlib | ID generation (proj_{hex8}) | All new entities follow this pattern |
| datetime/timezone (Python stdlib) | stdlib | created_at/updated_at timestamps | Use `datetime.now(timezone.utc).isoformat()` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| project_id column on notes table | Separate project_notes join table | Join table adds complexity; nullable FK column is consistent with how paper_id/website_id/library_id are handled |
| Inline status editing via dropdown | Separate edit modal | Inline editing is the project pattern (EditableField) |

**Installation:** No new packages needed — this phase uses only existing dependencies.

---

## Architecture Patterns

### Recommended Project Structure

New files to create:
```
backend/
├── models/project.py          # Project, ProjectCreate, ProjectUpdate
├── services/project_service.py  # CRUD — exact library_service.py template
├── routers/projects.py         # GET/POST /api/projects, GET/PATCH/DELETE /api/projects/:id
└── migrations/
    ├── 015_projects.sql        # projects table + library_id FK + cascade
    └── 016_project_notes.sql   # ADD COLUMN project_id to notes table

frontend/src/
├── pages/
│   ├── Projects.jsx            # Card grid — project list page
│   └── ProjectDetail.jsx       # Split-panel detail page
```

### Pattern 1: CamelModel CRUD Service (HIGH confidence)

**What:** Every domain entity follows the same service template used by `library_service.py` and `paper_service.py`.
**When to use:** All new entity CRUD operations.

```python
# Source: backend/services/library_service.py (verified in codebase)
import uuid
from datetime import datetime, timezone
from models.project import Project, ProjectCreate, ProjectUpdate
from services.db import get_client

_TABLE = "projects"

def list_projects(library_id: str | None = None) -> list[Project]:
    query = get_client().table(_TABLE).select("*").order("created_at", desc=True)
    if library_id:
        query = query.eq("library_id", library_id)
    result = query.execute()
    return [Project.model_validate(r) for r in result.data]

def get_project(project_id: str) -> Project | None:
    result = get_client().table(_TABLE).select("*").eq("id", project_id).execute()
    if not result.data:
        return None
    return Project.model_validate(result.data[0])

def create_project(data: ProjectCreate) -> Project:
    now = datetime.now(timezone.utc).isoformat()
    proj = Project(id=f"proj_{uuid.uuid4().hex[:8]}", created_at=now, updated_at=now, **data.model_dump())
    get_client().table(_TABLE).insert(proj.model_dump(by_alias=False)).execute()
    return proj

def update_project(project_id: str, data: ProjectUpdate) -> Project | None:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_project(project_id)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    if get_project(project_id) is None:
        return None
    get_client().table(_TABLE).update(updates).eq("id", project_id).execute()
    return get_project(project_id)

def delete_project(project_id: str) -> bool:
    if get_project(project_id) is None:
        return False
    get_client().table(_TABLE).delete().eq("id", project_id).execute()
    return True
```

**CRITICAL — Never chain `.select()` after `.eq()` on update/delete.** The Supabase py client's `.eq()` returns a `SyncFilterRequestBuilder` which has no `.select()`. Check existence with a prior `get_project()` call, execute the mutation, then re-fetch if needed.

### Pattern 2: Thin FastAPI Router (HIGH confidence)

**What:** Route handlers validate, call service, return serialized response. Zero business logic in handlers.
**When to use:** All route handlers.

```python
# Source: backend/routers/libraries.py (verified in codebase)
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from models.project import ProjectCreate, ProjectUpdate
from services import project_service

router = APIRouter(prefix="/api/projects", tags=["projects"])
NOT_FOUND = {"error": "not_found", "detail": "Project not found"}

@router.get("")
async def list_projects(library_id: str | None = None):
    projects = project_service.list_projects(library_id=library_id)
    return JSONResponse([p.model_dump(by_alias=True) for p in projects])

@router.post("", status_code=201)
async def create_project(data: ProjectCreate):
    proj = project_service.create_project(data)
    return JSONResponse(proj.model_dump(by_alias=True), status_code=201)

@router.get("/{project_id}")
async def get_project(project_id: str):
    proj = project_service.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(proj.model_dump(by_alias=True))

@router.patch("/{project_id}")
async def update_project(project_id: str, data: ProjectUpdate):
    proj = project_service.update_project(project_id, data)
    if proj is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(proj.model_dump(by_alias=True))

@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str):
    deleted = project_service.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
```

### Pattern 3: Frontend API Service (HIGH confidence)

**What:** Thin fetch wrapper in `api.js` following the `collectionsApi` / `librariesApi` shape.
**When to use:** All new API surface on the frontend.

```javascript
// Source: frontend/src/services/api.js (verified in codebase)
export const projectsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/projects${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/projects/${id}`),
  create: (data) => apiFetch('/projects', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/projects/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/projects/${id}`, { method: 'DELETE' }),
}

// Notes endpoints for projects follow notes.py pattern:
// notesApi.listForProject  → GET /api/projects/:id/notes
// notesApi.createForProject → POST /api/projects/:id/notes
```

### Pattern 4: NotesPanel with createFn (HIGH confidence)

**What:** `NotesPanel` already accepts a `createFn` prop. Pass project-scoped create function directly.
**When to use:** Wiring notes into ProjectDetail.jsx.

```javascript
// Source: frontend/src/components/NotesPanel.jsx line 285 (verified in codebase)
// NotesPanel signature:
// NotesPanel({ paperId, notes, setNotes, createFn })
//
// For project notes, pass createFn and leave paperId undefined:
<NotesPanel
  notes={notes}
  setNotes={setNotes}
  createFn={(data) => notesApi.createForProject(project.id, data)}
/>
// notesApi.createForProject needs to be added to api.js
```

### Pattern 5: Sidebar Expandable Section (HIGH confidence)

**What:** Expandable Projects section using the same useState expand/collapse pattern already in LibraryTree.
**When to use:** Projects section in Sidebar.jsx.

```javascript
// Source: frontend/src/components/layout/Sidebar.jsx (verified — LibraryTree pattern)
// Use local useState for expanded state.
// Render the section header as a button with chevron_right / expand_more icon.
// When collapsed (sidebar collapsed prop = true), hide the section entirely or show
// the section icon only (matching SidebarLink collapsed behavior).
// Scope projects list to activeLibraryId via projectsApi.list({ library_id: activeLibraryId })
```

### Pattern 6: Inline-Editable Project Header (HIGH confidence)

**What:** Reuse exported `EditableField` and `EditableTextArea` from `PaperInfoPanel.jsx` for project name/description.
**When to use:** Project detail page header.

```javascript
// Source: frontend/src/components/PaperInfoPanel.jsx (verified — exported symbols)
import { EditableField, EditableTextArea } from '../components/PaperInfoPanel'
// EditableField: label, value, onSave, type, placeholder, mono
// EditableTextArea: label, value, onSave, placeholder
```

### Pattern 7: Supabase Migration File (HIGH confidence)

**What:** SQL migration following existing numbering convention. Next number is `015`.
**When to use:** All schema changes.

```sql
-- 015_projects.sql
CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    library_id  TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- 016_project_notes.sql
ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
```

### Pattern 8: Router Wiring in app.py and App.jsx (HIGH confidence)

**What:** Wire the new router in backend `app.py` and add React Router routes in `App.jsx`.

```python
# backend/app.py — add to imports and include_router calls (verified pattern)
from routers import projects  # add to existing import line
app.include_router(projects.router)
```

```javascript
// frontend/src/App.jsx — add within the Layout route group
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
// Inside <Route path="/" element={<Layout />}>:
<Route path="projects" element={<Projects />} />
<Route path="projects/:id" element={<ProjectDetail />} />
```

### Anti-Patterns to Avoid

- **Chaining `.select()` after `.eq()` on update/delete:** The Supabase py client raises `AttributeError`. Always check existence first with a read call, then mutate.
- **Business logic in route handlers:** Keep handlers thin — validate, call service, return. No DB calls or computation in routers.
- **Passing raw dicts across module boundaries:** Use typed Pydantic models everywhere. `model_dump(exclude_unset=True)` for partial updates.
- **Hardcoding `library_id` in the frontend:** Always read from `LibraryContext`'s `activeLibraryId`.
- **Creating a separate state context for projects before it's needed:** A simple `useState` + `useEffect` in `Projects.jsx` is sufficient for Phase 1. Only escalate to a context if multiple pages need shared project state (not needed until Phase 2).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inline field editing | Custom double-click-to-edit | `EditableField`, `EditableTextArea` from PaperInfoPanel.jsx | Already handles save/cancel/keyboard, tested in production |
| WYSIWYG notes | Custom rich text editor | `NotesPanel` with `createFn` prop | tiptap with full extension set already wired |
| Modal dialog | Custom overlay | `WindowModal` component | Already handles Escape, focus trap, portal rendering |
| ID generation | Custom UUID or random | `f"proj_{uuid.uuid4().hex[:8]}"` | Matches all existing entity IDs (lib_, col_, etc.) |
| camelCase serialization | Manual field mapping | `CamelModel` + `model_dump(by_alias=True)` | Already configured via alias_generator |
| Partial updates | Fetching full object first | `model_dump(exclude_unset=True)` | Pydantic v2 pattern — only sends changed fields |

**Key insight:** Every UX primitive and data access pattern needed for projects is already built and in production. This phase is strictly wiring, not invention.

---

## Common Pitfalls

### Pitfall 1: Supabase Update Chain AttributeError
**What goes wrong:** `get_client().table("projects").update(data).eq("id", pid).select().execute()` raises `AttributeError: 'SyncFilterRequestBuilder' object has no attribute 'select'`
**Why it happens:** `.eq()` returns `SyncFilterRequestBuilder`, not `QueryRequestBuilder`. The `.select()` method exists only before `.eq()`.
**How to avoid:** Check existence first with `get_project(project_id)`, then `update(...).eq(...).execute()`, then re-call `get_project()` to return updated data.
**Warning signs:** Any code that chains `.select()` after a filter on an update or delete.

### Pitfall 2: Notes Table FK Extension vs. New Table
**What goes wrong:** Creating a separate `project_notes` join table instead of adding `project_id` FK to the existing `notes` table.
**Why it happens:** Seems cleaner to isolate, but breaks `NotesPanel` which works off a flat `notes` list with a single source column.
**How to avoid:** Add `project_id TEXT REFERENCES projects(id) ON DELETE CASCADE` as a nullable column on the existing `notes` table, exactly as `website_id`, `github_repo_id`, and `library_id` were added. The `note_service.list_notes()` function already accepts optional kwargs for scoping — just add `project_id` as a new optional parameter.
**Warning signs:** Any proposed `project_notes` table.

### Pitfall 3: Migration Number Collision
**What goes wrong:** Choosing migration number `015` when a `015_*.sql` file already exists, or skipping ahead.
**Why it happens:** Not checking the migrations directory before naming a new file.
**How to avoid:** The last migration is `014_pin_notes.sql`, so use `015_projects.sql` and `016_project_notes.sql`. Verify with `ls backend/migrations/` before committing.
**Warning signs:** Any migration file that doesn't continue the sequence.

### Pitfall 4: Library Cascade Not Declared
**What goes wrong:** Deleting a library leaves orphaned project rows in the DB, causing FK violations or phantom data.
**Why it happens:** Missing `ON DELETE CASCADE` on the `library_id` FK in the projects table.
**How to avoid:** Always declare `REFERENCES libraries(id) ON DELETE CASCADE` on `library_id`. Same for `project_id` on notes.
**Warning signs:** Migration SQL that omits `ON DELETE CASCADE`.

### Pitfall 5: Project Status Values Not Validated
**What goes wrong:** Invalid status strings (e.g., "suspended") stored in DB.
**Why it happens:** Pydantic model uses `str` for status without a validator or literal type.
**How to avoid:** Use `Literal["active", "paused", "completed", "archived"]` in `ProjectCreate` and `ProjectUpdate`, or add a field validator. The frontend status badge must use the same four values.
**Warning signs:** Status field typed as plain `str` with no constraint.

### Pitfall 6: Sidebar Projects List Not Scoped to Active Library
**What goes wrong:** All projects from all libraries appear in the sidebar regardless of active library.
**Why it happens:** Forgetting to pass `library_id: activeLibraryId` when fetching projects for the sidebar.
**How to avoid:** Mirror the LibraryTree pattern — use `useEffect` with `activeLibraryId` dependency and pass it as a query param: `projectsApi.list({ library_id: activeLibraryId })`.
**Warning signs:** `projectsApi.list()` called without a `library_id` param in sidebar context.

---

## Code Examples

### Project Pydantic Models

```python
# Source: backend/models/library.py (template), backend/models/base.py (verified)
from typing import Optional, Literal
from .base import CamelModel


class Project(CamelModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str = "active"  # active | paused | completed | archived
    library_id: str
    created_at: str
    updated_at: str


class ProjectCreate(CamelModel):
    name: str
    description: Optional[str] = None
    status: Literal["active", "paused", "completed", "archived"] = "active"
    library_id: str


class ProjectUpdate(CamelModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["active", "paused", "completed", "archived"]] = None
```

### note_service.py Extension for project_id

```python
# Source: backend/services/note_service.py list_notes() (verified)
# Add project_id parameter to list_notes, create_note, and generate_notes:

def list_notes(
    paper_id: Optional[str] = None,
    website_id: Optional[str] = None,
    github_repo_id: Optional[str] = None,
    library_id: Optional[str] = None,
    project_id: Optional[str] = None,      # NEW
) -> list[Note]:
    query = get_client().table(_TABLE).select("*")
    if paper_id:
        query = query.eq("paper_id", paper_id)
    elif website_id:
        query = query.eq("website_id", website_id)
    elif github_repo_id:
        query = query.eq("github_repo_id", github_repo_id)
    elif library_id:
        query = query.eq("library_id", library_id)
    elif project_id:                         # NEW
        query = query.eq("project_id", project_id)
    # ... rest unchanged
```

### Project Notes Router Endpoints

```python
# Source: backend/routers/notes.py pattern (verified)
@router.get("/projects/{project_id}/notes")
async def list_project_notes(project_id: str):
    notes = note_service.list_notes(project_id=project_id)
    return JSONResponse([n.model_dump(by_alias=True) for n in notes])

@router.post("/projects/{project_id}/notes", status_code=201)
async def create_project_note(project_id: str, data: NoteCreate):
    note = note_service.create_note(data, project_id=project_id)
    return JSONResponse(note.model_dump(by_alias=True), status_code=201)
```

### Frontend Project Status Badge Config

```javascript
// Source: frontend/src/components/PaperInfoPanel.jsx statusConfig pattern (verified)
export const projectStatusConfig = {
  'active':    { label: 'Active',    class: 'bg-emerald-100 text-emerald-700' },
  'paused':    { label: 'Paused',    class: 'bg-amber-100 text-amber-700' },
  'completed': { label: 'Completed', class: 'bg-blue-100 text-blue-700' },
  'archived':  { label: 'Archived',  class: 'bg-slate-100 text-slate-500' },
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON file storage (storage.py) | Supabase PostgreSQL via supabase-py | Early in project | All new tables go in Supabase; storage.py is retained for embedding cache only |
| Separate join tables for notes | Nullable FK columns on single notes table | Migration 003–012 | Add project_id as nullable FK column, not a separate table |
| Full `.select()` on update | Check → mutate → re-fetch | Known pattern | Never chain .select() after .eq() on update/delete |

**Deprecated/outdated:**
- `storage.py` for new entity storage: use Supabase exclusively. `storage.py` only serves `embeddings.json`.
- `mockData.js`: kept as reference only — never import it in new pages.

---

## Open Questions

1. **Should `updated_at` be a separate column or derived from `created_at`?**
   - What we know: other entities (papers, notes) use `created_at` only; `updated_at` is used only on notes
   - What's unclear: whether the projects list card shows "last updated" and whether it needs to be queryable
   - Recommendation: Include `updated_at` in the `projects` table from day one (CONTEXT.md says card shows "last updated date"). Update it on every PATCH via the service layer.

2. **Include `rq_id` FK column on the projects table in Phase 1?**
   - What we know: STATE.md flags this as a high-risk schema decision. RQs are a Phase 2 entity.
   - What's unclear: Whether the FK direction is `rqs.project_id` (RQ belongs to project) or `projects.primary_rq_id` (project has one primary RQ)
   - Recommendation: Do NOT add RQ FKs to the projects table in Phase 1. The RQ entity and its FK to projects should be created in Phase 2 (`rqs.project_id`). Adding a forward FK to a non-existent table would require a nullable column that can't be populated — dead weight. The project detail page tree in Phase 1 can render placeholder RQ/experiment rows from stub data without a real FK.

3. **Three-dot card menu: use a context menu portal or an absolute-positioned div within the card?**
   - What we know: Sidebar uses `createPortal` for context menus to avoid overflow clipping; Library table uses a similar approach.
   - What's unclear: Whether the card grid will have overflow:hidden that clips the menu.
   - Recommendation: Use `createPortal` for the three-dot menu, following the sidebar pattern (CollectionNode context menu). Avoids overflow clipping issues with card containers.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.4.0 + pytest-mock 3.14.0 |
| Config file | `backend/pyproject.toml` → `[tool.pytest.ini_options]` testpaths = ["tests"] |
| Quick run command | `cd backend && uv run pytest tests/test_service_behaviors.py -x -q` |
| Full suite command | `cd backend && uv run pytest -x -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | POST /api/projects creates project and returns 201 with correct shape | unit (route) | `uv run pytest tests/test_projects_routes.py::test_create_project -x` | Wave 0 |
| PROJ-02 | GET /api/projects?library_id= returns filtered list | unit (route) | `uv run pytest tests/test_projects_routes.py::test_list_projects_by_library -x` | Wave 0 |
| PROJ-03 | GET /api/projects/:id returns project or 404 | unit (route) | `uv run pytest tests/test_projects_routes.py::test_get_project_not_found -x` | Wave 0 |
| PROJ-04 | PATCH /api/projects/:id updates fields via exclude_unset | unit (service) | `uv run pytest tests/test_projects_routes.py::test_update_project_partial -x` | Wave 0 |
| PROJ-05 | DELETE /api/projects/:id returns 204; GET returns 404 | unit (route) | `uv run pytest tests/test_projects_routes.py::test_delete_project -x` | Wave 0 |
| PROJ-06 | GET/POST /api/projects/:id/notes routes work | unit (route) | `uv run pytest tests/test_projects_routes.py::test_project_notes -x` | Wave 0 |
| NAV-01 | Projects section appears in sidebar (visual) | manual-only | N/A — React component verification | N/A |
| NAV-02 | /projects and /projects/:id routes render without crashing | smoke (React) | manual-only — no frontend test infra | N/A |

### Sampling Rate

- **Per task commit:** `cd backend && uv run pytest tests/test_projects_routes.py -x -q`
- **Per wave merge:** `cd backend && uv run pytest -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_projects_routes.py` — covers PROJ-01 through PROJ-06 route contracts. Follow `test_papers_routes.py` and `test_chat_and_notes_routes.py` as templates. Monkeypatch `project_service.*` functions; assert status codes and response shapes.
- [ ] `backend/models/note.py` — add `project_id: Optional[str] = None` field (non-breaking change; existing tests unaffected)
- [ ] `backend/services/note_service.py` — add `project_id` parameter to `list_notes` and `create_note` (non-breaking change)
- [ ] No new pytest fixtures needed — existing `client` fixture in `conftest.py` covers all route tests

*(Frontend routes and sidebar have no automated test infra in this project; verify manually.)*

---

## Sources

### Primary (HIGH confidence)
- `backend/services/library_service.py` — CRUD service template
- `backend/models/library.py`, `backend/models/note.py` — Pydantic model template
- `backend/routers/notes.py` — router pattern for nested resource endpoints
- `backend/models/base.py` — CamelModel base
- `backend/services/db.py` — Supabase client singleton
- `backend/migrations/001_init.sql` through `014_pin_notes.sql` — migration conventions, cascade patterns
- `frontend/src/services/api.js` — apiFetch wrapper and API service shape
- `frontend/src/components/layout/Sidebar.jsx` — expandable section pattern (LibraryTree), SidebarLink
- `frontend/src/components/PaperInfoPanel.jsx` — EditableField, EditableTextArea, statusConfig exports
- `frontend/src/components/NotesPanel.jsx` — createFn prop, tiptap integration
- `frontend/src/App.jsx` — route registration pattern
- `frontend/src/context/LibraryContext.jsx` — activeLibraryId access pattern
- `backend/app.py` — router include pattern
- `backend/tests/conftest.py`, `backend/tests/test_service_behaviors.py` — test patterns
- `backend/pyproject.toml` — pytest config

### Secondary (MEDIUM confidence)
- None needed — all patterns verified directly from codebase source files.

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — all patterns copied directly from verified production code in this repo
- Pitfalls: HIGH — Supabase `.select()` chaining bug, migration numbering, cascade requirements all verified from source

**Research date:** 2026-03-14
**Valid until:** Stable — no fast-moving external dependencies; valid until project patterns change
