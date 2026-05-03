---
phase: 03-experiment-tree
plan: "01"
subsystem: backend-api
tags: [experiments, migration, pydantic, fastapi, api-client]
dependency_graph:
  requires: []
  provides: [experiment-api, experiment-models, experiment-service, experiment-migration]
  affects: [notes, frontend-api]
tech_stack:
  added: []
  patterns: [rq_service-pattern, absolute-path-router, camel-model-inheritance]
key_files:
  created:
    - backend/migrations/019_experiments.sql
    - backend/models/experiment.py
    - backend/services/experiment_service.py
    - backend/routers/experiments.py
  modified:
    - backend/models/note.py
    - backend/services/note_service.py
    - backend/app.py
    - frontend/src/services/api.js
decisions:
  - "experiment_id added to note_service._SOURCE_FIELDS so reassigning notes to an experiment nulls other source FKs (consistent with existing pattern)"
  - "notesApi experiment extensions added inline to existing notesApi object (not a second export) to avoid duplicate export error"
  - "experiment_papers join table uses CHECK constraint enforcing exactly-one-of paper_id/website_id/github_repo_id (same pattern as rq_papers)"
metrics:
  duration: "~8 min"
  completed: "2026-03-15"
  tasks: 2
  files: 8
---

# Phase 3 Plan 1: Experiment Infrastructure (Backend + Frontend API Client) Summary

Experiments CRUD backend + frontend API client: migration with hierarchical experiments table and join table, Pydantic models, service layer following rq_service pattern, 10-route FastAPI router, and experimentsApi + notesApi extensions in api.js.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migration, Pydantic models, experiment service, note updates | feecbd6 | 019_experiments.sql, experiment.py, experiment_service.py, note.py, note_service.py |
| 2 | Experiments router, app.py wiring, frontend API client | 8311099 | experiments.py, app.py, api.js |

## What Was Built

### backend/migrations/019_experiments.sql
- `experiments` table: hierarchical (self-referencing `parent_id`), `rq_id` FK (ON DELETE SET NULL), `config`/`metrics` JSONB with `{}` defaults, `position` for ordering
- `experiment_papers` join table: exactly-one-of CHECK constraint for paper_id/website_id/github_repo_id; partial unique indexes prevent duplicate links
- `ALTER TABLE notes ADD COLUMN IF NOT EXISTS experiment_id` with cascade delete and index

### backend/models/experiment.py
- `Experiment`: full read model with config/metrics as `dict[str, Any]`
- `ExperimentCreate`: project_id defaults to "" (overridden by router path param), status defaults to "planned"
- `ExperimentUpdate`: all fields Optional, status is Literal union
- `ExperimentPaper` / `ExperimentPaperCreate`: join table models

### backend/services/experiment_service.py
- 9 exported functions: `list_experiments`, `get_experiment`, `create_experiment`, `update_experiment`, `delete_experiment`, `reorder_experiments`, `list_experiment_papers`, `link_experiment_paper`, `unlink_experiment_paper`
- Follows rq_service.py pattern exactly: UUID prefix `exp_` / `ep_`, ISO timestamps, exclude_unset updates, existence checks before mutations
- `link_experiment_paper` strips None FK columns before insert (prevents NULL constraint violations)

### backend/routers/experiments.py
- 10 routes using absolute paths (same pattern as research_questions.py)
- Project-scoped: POST/GET `/api/projects/{project_id}/experiments`
- Experiment-scoped: PATCH/DELETE, reorder, papers (GET/POST/DELETE), notes (GET/POST)
- Path param `project_id` is authoritative for create — body project_id overridden

### backend/models/note.py + backend/services/note_service.py
- `experiment_id: Optional[str] = None` added to `Note` model
- `_SOURCE_FIELDS` now includes `"experiment_id"` for consistent source reassignment logic
- `list_notes()` and `create_note()` accept `experiment_id` parameter

### frontend/src/services/api.js
- `experimentsApi`: 8 methods (list, create, update, remove, reorder, listPapers, linkPaper, unlinkPaper)
- `notesApi` extended inline with `listForExperiment` and `createForExperiment`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate notesApi export**
- **Found during:** Task 2 verification (acorn parse failed)
- **Issue:** Plan instructed adding `notesApi.listForExperiment = ...` as standalone export statements, but `notesApi` was already exported as an object literal at line 214. Adding a second `export const notesApi` caused a duplicate identifier parse error.
- **Fix:** Added `listForExperiment` and `createForExperiment` as properties inside the existing `notesApi` object literal instead of creating a second export.
- **Files modified:** frontend/src/services/api.js
- **Commit:** 8311099

## Self-Check: PASSED

- FOUND: backend/migrations/019_experiments.sql
- FOUND: backend/models/experiment.py
- FOUND: backend/services/experiment_service.py
- FOUND: backend/routers/experiments.py
- FOUND: commit feecbd6 (Task 1)
- FOUND: commit 8311099 (Task 2)
