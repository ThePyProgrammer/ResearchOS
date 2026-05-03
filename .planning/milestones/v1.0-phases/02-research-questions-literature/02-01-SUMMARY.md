---
phase: 02-research-questions-literature
plan: 01
subsystem: api
tags: [fastapi, pydantic, supabase, postgresql, react]

# Dependency graph
requires:
  - phase: 01-project-foundation
    provides: projects table + project_service + projects router that this extends

provides:
  - research_questions table (hierarchical with parent_id, position ordering)
  - project_papers table (FK join table for project-paper/website links)
  - rq_papers table (FK join table for rq-paper/website links)
  - RQ CRUD API (8 routes under /api/projects/{id}/research-questions and /api/research-questions/{id})
  - Project-paper link API (3 routes under /api/projects/{id}/papers)
  - researchQuestionsApi and projectPapersApi in frontend api.js

affects:
  - 02-02 (frontend RQ UI depends on these endpoints)
  - 02-03 (literature panel depends on project-paper API)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Service functions follow project_service.py pattern (check-exists, mutate, re-fetch)
    - Router follows APIRouter(prefix, tags) pattern with NOT_FOUND dict constants
    - RQ IDs prefixed rq_, project-paper link IDs prefixed pp_, rq-paper link IDs prefixed rqp_

key-files:
  created:
    - backend/migrations/017_research_questions.sql
    - backend/models/research_question.py
    - backend/models/project_paper.py
    - backend/services/rq_service.py
    - backend/services/project_papers_service.py
    - backend/routers/research_questions.py
  modified:
    - backend/routers/projects.py
    - backend/app.py
    - frontend/src/services/api.js

key-decisions:
  - "research_questions router uses absolute paths (/api/...) rather than prefix so project-scoped and rq-scoped routes can coexist in one router"
  - "ReorderRequest uses plain BaseModel (not CamelModel) since it holds only a list[str] with no snake_case/camelCase mapping needed"
  - "project_id from path param is authoritative for create_rq — body project_id is overridden to prevent cross-project creation"

patterns-established:
  - "FK join tables use CHECK constraint to enforce exactly-one-of paper_id/website_id pattern"
  - "Partial unique indexes on (project_id, paper_id) WHERE paper_id IS NOT NULL prevent duplicate links without preventing nulls"

requirements-completed: [RQ-01, RQ-02, RQ-03, RQ-04, RQ-06, LIT-01, LIT-04]

# Metrics
duration: 10min
completed: 2026-03-15
---

# Phase 2 Plan 1: Research Questions & Project-Paper API Summary

**FastAPI backend for hierarchical research questions and project-paper linking: 3 DB tables, 8 Pydantic models, 12 service functions, 11 API routes, and frontend JS client**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-15T08:20:00Z
- **Completed:** 2026-03-15T08:30:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Migration SQL with `research_questions`, `project_papers`, and `rq_papers` tables with FK cascades, check constraints, and partial unique indexes
- Full RQ CRUD service (create, read, update, delete, reorder) plus rq-paper link/unlink — follows project_service.py patterns exactly
- 8-route research_questions router wired into app.py alongside extended projects router (3 new project-paper routes)
- Frontend API client with `researchQuestionsApi` (8 methods) and `projectPapersApi` (3 methods) added to api.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration, Pydantic models, and service layer** - `d19196a` (feat)
2. **Task 2: Create routers, wire to app.py, and add frontend API client** - `8965a2b` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `backend/migrations/017_research_questions.sql` - 3 tables with FK constraints, check constraints, partial unique indexes, RLS disabled
- `backend/models/research_question.py` - ResearchQuestion, ResearchQuestionCreate, ResearchQuestionUpdate
- `backend/models/project_paper.py` - ProjectPaper, ProjectPaperCreate, RqPaper, RqPaperCreate
- `backend/services/rq_service.py` - RQ CRUD + reorder + rq_papers link/unlink (9 exported functions)
- `backend/services/project_papers_service.py` - project-paper list/link/unlink (3 exported functions)
- `backend/routers/research_questions.py` - 8 routes for RQ CRUD, reorder, and paper linking
- `backend/routers/projects.py` - extended with 3 project-paper link routes
- `backend/app.py` - import and include_router for research_questions
- `frontend/src/services/api.js` - researchQuestionsApi and projectPapersApi exports

## Decisions Made

- research_questions router uses absolute paths (/api/...) rather than a single prefix so project-scoped routes (/api/projects/{id}/research-questions) and rq-scoped routes (/api/research-questions/{id}) can coexist in one router without nested prefix gymnastics.
- project_id from the URL path param is authoritative when creating an RQ — the body's project_id is overridden to prevent cross-project creation bugs.
- ReorderRequest is a plain BaseModel (not CamelModel) because it holds only `ids: list[str]` with no snake_case/camelCase mapping required.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Run `backend/migrations/017_research_questions.sql` once in the Supabase SQL editor to create the three new tables before using any research question endpoints.

## Next Phase Readiness

- All backend API endpoints and frontend JS client ready for 02-02 (RQ UI components)
- project_papers API ready for 02-03 (literature panel linking)
- Migration SQL must be applied to Supabase before endpoints function

---
*Phase: 02-research-questions-literature*
*Completed: 2026-03-15*
