---
phase: 01-project-foundation
plan: 02
subsystem: ui
tags: [react, vite, tailwind, react-router, tiptap]

# Dependency graph
requires:
  - phase: 01-01
    provides: Projects CRUD API at /api/projects and /api/projects/:id/notes
provides:
  - Projects list page with card grid, empty state, create modal, three-dot menu
  - ProjectDetail split-panel page with editable header, status dropdown, notes
  - Sidebar ProjectsTree section scoped to active library with status dots
  - projectsApi and notesApi.listForProject/createForProject in api.js
  - React Router routes /projects and /projects/:id
affects:
  - 01-03, 01-04 (future plans that may extend project views)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Card grid layout with responsive breakpoints (1/2/3 cols) for collection-style pages
    - Three-dot menu with inline delete confirmation overlay (no portal needed for card-level menus)
    - Split panel detail pages: fixed left nav (w-56) + scrollable right panel
    - Inline editing via click-to-edit inputs/textareas (blur-to-save, Escape-to-cancel)
    - Sidebar tree sections follow LibraryTree expand/collapse pattern with useEffect scoped to activeLibraryId

key-files:
  created:
    - frontend/src/pages/Projects.jsx
    - frontend/src/pages/ProjectDetail.jsx
  modified:
    - frontend/src/services/api.js
    - frontend/src/App.jsx
    - frontend/src/components/layout/Sidebar.jsx

key-decisions:
  - "ProjectDetail uses Layout route (not LayoutBare) so sidebar is visible — matches Agents/Library navigation pattern"
  - "Status dropdown is a native <select> styled as a badge pill — simple, no custom dropdown needed"
  - "ProjectsTree placed between collections and Authors in sidebar to keep research items together"

patterns-established:
  - "Status config maps string keys to label+class: reuse projectStatusConfig in future experiment/RQ views"
  - "formatRelativeDate utility duplicated from PaperInfoPanel — could be extracted to utils if needed in more places"

requirements-completed: [PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06, NAV-01, NAV-02]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 1 Plan 02: Projects Frontend Summary

**React project list (card grid) and detail (split-panel) pages with tiptap notes, sidebar integration, and full CRUD wiring to the /api/projects backend**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-15T01:39:37Z
- **Completed:** 2026-03-15T01:44:34Z
- **Tasks:** 2 of 3 (Task 3 is human-verify checkpoint)
- **Files modified:** 5

## Accomplishments

- Complete project list page: responsive 3-column card grid, empty state with create prompt, create modal (name + description), three-dot menu (edit/archive/delete with inline confirmation), status badges, relative timestamps
- Complete project detail page: split panel with left nav (Overview/Notes), inline-editable name/status/description, Phase 2/3 placeholders, tiptap NotesPanel with project-scoped notes
- Sidebar extended with expandable ProjectsTree section below collections, scoped to activeLibraryId, showing status dots and project names with active highlight
- API service extended: projectsApi (list/get/create/update/remove) + notesApi.listForProject/createForProject

## Task Commits

Each task was committed atomically:

1. **Task 1: Add projectsApi, Projects list page, and route wiring** - `24f9e62` (feat)
2. **Task 2: Create ProjectDetail page and extend sidebar with Projects section** - `3abd0b2` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `frontend/src/pages/Projects.jsx` - Project list page with card grid, empty state, create modal, three-dot menu
- `frontend/src/pages/ProjectDetail.jsx` - Project detail split panel with editable header, notes, left nav
- `frontend/src/services/api.js` - Added projectsApi and notesApi project methods
- `frontend/src/App.jsx` - Added /projects and /projects/:id routes with imports
- `frontend/src/components/layout/Sidebar.jsx` - Added ProjectsTree component and projectsApi import

## Decisions Made

- ProjectDetail placed inside Layout route (with sidebar) rather than LayoutBare — the sidebar Projects section makes navigation more natural when inside a project
- Status dropdown uses native `<select>` styled as a badge pill — simple solution, no custom dropdown or portal needed
- ProjectsTree placed between collections and Authors sections in sidebar, keeping research items (library + projects) co-located

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both builds passed with zero errors on first attempt.

## User Setup Required

Database migrations from Plan 01 must be executed before the frontend is functional:
1. `backend/migrations/015_projects.sql` — creates `projects` table
2. `backend/migrations/016_project_notes.sql` — adds `project_id` to `notes` table

Backend must be running: `cd backend && uv run uvicorn app:app --reload --port 8000`

## Next Phase Readiness

- All project CRUD views fully wired to the API
- Human-verify checkpoint (Task 3) requires backend running + migrations applied
- After verification, plan 02 is fully complete; ready for plan 03

---
*Phase: 01-project-foundation*
*Completed: 2026-03-15*
