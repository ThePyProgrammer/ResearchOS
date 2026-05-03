---
phase: 01-project-foundation
plan: 01
subsystem: api
tags: [fastapi, pydantic, supabase, postgresql, tdd, pytest]

# Dependency graph
requires: []
provides:
  - Project, ProjectCreate, ProjectUpdate Pydantic models with CamelModel base
  - project_service CRUD (list/get/create/update/delete) backed by Supabase projects table
  - REST endpoints at /api/projects (GET list, POST create, GET/:id, PATCH/:id, DELETE/:id)
  - projects table DDL (migration 015) and project_id FK on notes table (migration 016)
  - note_service and Note model extended with project_id scope
  - GET/POST /api/projects/:id/notes endpoints in notes router
  - 11 route-level tests covering all endpoints
affects:
  - 01-02 (frontend project views will consume this API)
  - future experiment plans that scope data to projects

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD route tests: write failing tests first, then implement, run to green
    - CamelModel inheritance for all new domain models
    - Thin router handlers calling service layer functions
    - project_service follows library_service pattern exactly (check-before-update, no .select() after .eq())

key-files:
  created:
    - backend/models/project.py
    - backend/services/project_service.py
    - backend/routers/projects.py
    - backend/migrations/015_projects.sql
    - backend/migrations/016_project_notes.sql
    - backend/tests/test_projects_routes.py
  modified:
    - backend/app.py
    - backend/models/note.py
    - backend/services/note_service.py
    - backend/routers/notes.py

key-decisions:
  - "Used proj_{uuid4.hex[:8]} ID format, consistent with other entities (lib_, note_, etc.)"
  - "project_id added to _SOURCE_FIELDS in note_service so reassignment to project nulls other source fields"
  - "Migration files ready for manual Supabase SQL editor execution (never auto-applied)"

patterns-established:
  - "Project notes endpoints follow the same paper/website/repo pattern in notes router"
  - "project_service.update_project uses exclude_unset and checks existence before mutating"

requirements-completed: [PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06]

# Metrics
duration: 12min
completed: 2026-03-15
---

# Phase 1 Plan 01: Projects Backend Summary

**FastAPI project CRUD API with Supabase migrations, notes integration, and 11 TDD route tests — all 45 suite tests pass**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-15T01:32:32Z
- **Completed:** 2026-03-15T01:44:30Z
- **Tasks:** 1 (single TDD task covering all backend components)
- **Files modified:** 10

## Accomplishments

- Complete project CRUD backend: model, service, 5-endpoint REST router, wired into app.py
- Database schema ready: 015_projects.sql table DDL + 016_project_notes.sql FK column on notes
- Notes system extended: project_id on Note model, note_service, and new /api/projects/:id/notes endpoints
- 11 route-level tests written TDD-style; all pass; no regressions in existing 45-test suite

## Task Commits

Each task was committed atomically:

1. **Task 1: Projects backend (models, service, router, migrations, notes extension)** - `775950f` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `backend/models/project.py` - Project, ProjectCreate, ProjectUpdate Pydantic models
- `backend/services/project_service.py` - CRUD functions for projects table (list/get/create/update/delete)
- `backend/routers/projects.py` - REST router at /api/projects with all CRUD endpoints
- `backend/migrations/015_projects.sql` - projects table DDL with library_id FK and index
- `backend/migrations/016_project_notes.sql` - project_id FK column on notes table with index
- `backend/tests/test_projects_routes.py` - 11 route-level tests (TDD)
- `backend/app.py` - Added projects router import and include_router
- `backend/models/note.py` - Added project_id field to Note and NoteUpdate
- `backend/services/note_service.py` - Added project_id param to list_notes, create_note; updated _SOURCE_FIELDS
- `backend/routers/notes.py` - Added GET/POST /api/projects/:id/notes endpoints

## Decisions Made

- Used `proj_{uuid4.hex[:8]}` ID format, consistent with existing entity conventions
- Added `project_id` to `_SOURCE_FIELDS` in note_service so reassigning a note to a project correctly nulls other source FK columns
- Migration files created for manual execution in Supabase SQL editor (no auto-DDL per project convention)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All 11 new tests passed on first run. Full 45-test suite green with no regressions.

## User Setup Required

**Database migrations require manual execution.** Run in the Supabase SQL editor in order:

1. `backend/migrations/015_projects.sql` — creates `projects` table
2. `backend/migrations/016_project_notes.sql` — adds `project_id` column to `notes` table

## Next Phase Readiness

- Project CRUD API fully operational and tested
- Frontend (Plan 02) can immediately consume `/api/projects` endpoints
- Notes system already wired for project scope — no further backend work needed for basic project notes

---
*Phase: 01-project-foundation*
*Completed: 2026-03-15*
