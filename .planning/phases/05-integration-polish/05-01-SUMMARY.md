---
phase: 05-integration-polish
plan: "01"
subsystem: frontend-backend
tags: [integration, library-scoping, experiment-count, gap-closure]
dependency_graph:
  requires: []
  provides: [INT-01-closed, INT-02-closed]
  affects: [ProjectDetail.jsx, Projects.jsx, project_service.py, project.py]
tech_stack:
  added: []
  patterns: [prop-threading, computed-field-pattern]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx
    - frontend/src/pages/Projects.jsx
    - backend/models/project.py
    - backend/services/project_service.py
decisions:
  - experiment_count is computed in list_projects via a second query (fetch all experiment rows, count client-side) — Supabase Python client does not support GROUP BY in select
  - experiment_count defaults to 0 in Project model so single-project fetches (get_project) continue to work without a join
  - libraryId threading follows the exact same pattern used by RQSection (confirmed at line 2570 it also threads libraryId={libraryId} to MiniSearchPicker)
metrics:
  duration: "~10 min"
  completed_date: "2026-03-16"
  tasks: 2
  files_changed: 4
requirements: [LIT-02, PROJ-02]
---

# Phase 05 Plan 01: Integration Gap Closure Summary

**One-liner:** Library-scoped experiment literature search (libraryId threaded to MiniSearchPicker) and experiment counts on project cards (backend join + frontend display) close INT-01 and INT-02 from the v1.0 milestone audit.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Thread libraryId through ExperimentSection to MiniSearchPicker | 1a8aa6b | ProjectDetail.jsx |
| 2 | Add experiment count to project cards | bfb4294 | project.py, project_service.py, Projects.jsx |

## What Was Built

### Task 1 — INT-01: Library-scoped experiment literature search

ExperimentSection now accepts a `libraryId` prop and passes it down through ExperimentNode to MiniSearchPicker. MiniSearchPicker already handled `libraryId` correctly (applying `library_id` filter when present at line 361). The fix was purely a prop-threading change:

- `ExperimentSection({ projectId, libraryId })` — signature updated
- `<ExperimentSection projectId={project.id} libraryId={project.libraryId} />` — render site updated
- `ExperimentNode({ ..., libraryId, ... })` — prop added
- `<MiniSearchPicker ... libraryId={libraryId} />` — libraryId passed at line 1692
- Recursive child ExperimentNode renders also pass `libraryId={libraryId}` at line 1722

### Task 2 — INT-02: Experiment counts on project cards

Backend:
- `Project` model gains `experiment_count: int = 0` (computed, not stored in DB)
- `list_projects()` fetches all experiment rows for the listed project IDs, counts per project_id client-side, and sets `experiment_count` on each project object before returning

Frontend:
- `ProjectCard` footer replaced with a flex row showing: `science` icon + count, then "Updated {date}"
- Uses `project.experimentCount ?? 0` (camelCase alias from CamelModel)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: frontend/src/pages/ProjectDetail.jsx
- FOUND: frontend/src/pages/Projects.jsx
- FOUND: backend/models/project.py
- FOUND: backend/services/project_service.py
- FOUND: commit 1a8aa6b (Task 1)
- FOUND: commit bfb4294 (Task 2)
