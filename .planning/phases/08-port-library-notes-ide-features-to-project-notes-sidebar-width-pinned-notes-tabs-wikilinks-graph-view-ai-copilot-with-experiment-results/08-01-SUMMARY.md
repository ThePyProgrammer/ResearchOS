---
phase: 08-port-library-notes-ide-features-to-project-notes-sidebar-width-pinned-notes-tabs-wikilinks-graph-view-ai-copilot-with-experiment-results
plan: 01
subsystem: ai, api, ui
tags: [fastapi, react, openai, copilot, experiment-context, notes]

# Dependency graph
requires:
  - phase: 03-experiment-tree
    provides: experiments table + note service experiment_id support
  - phase: 08-port-library-notes-ide-features
    provides: NotesCopilotPanel + NoteGraphView shared components
provides:
  - POST /api/projects/{id}/notes-copilot endpoint with experiment context building
  - project_id column on chat_messages (migration 020)
  - NoteGraphView: customSourceColors, customSourceLabels, storagePrefix props
  - NotesCopilotPanel: sendFn, scopeId, experiments props + experiments in @ mention dropdown
  - projectNotesCopilotApi exported from api.js
affects: [08-02-project-notes-ide]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sendFn/scopeId prop injection to NotesCopilotPanel for project-scoped sends without forking component"
    - "storagePrefix prop on NoteGraphView to prevent localStorage key collisions between library/project graphs"
    - "Experiment context block: config KVs + metrics KVs + children summaries serialized into system message"
    - "ITEM_STYLE lookup table extended with experiment type (indigo/science icon)"
    - "EXPERIMENT_STATUS_COLOR map for colored status dots in @ mention dropdown"

key-files:
  created:
    - backend/migrations/020_project_notes_copilot.sql
    - backend/services/project_notes_copilot_service.py
    - backend/routers/project_notes_copilot.py
  modified:
    - backend/models/chat.py
    - backend/app.py
    - frontend/src/components/NoteGraphView.jsx
    - frontend/src/components/NotesCopilotPanel.jsx
    - frontend/src/services/api.js

key-decisions:
  - "project_notes_copilot_service.py copies architecture from notes_copilot_service.py but scopes to project_id — avoids overloading one service with branching logic"
  - "suggest_note_create target_type enum extended to include 'project' and 'experiment' so AI can propose notes under either entity"
  - "storagePrefix prop on NoteGraphView replaces hardcoded 'researchos.graph.' prefix — project graph settings stored at 'researchos.project.graph.' to avoid collision"
  - "experiments prop passed to NotesCopilotPanel with children pre-filtered client-side — avoids extra server round-trip at mention selection time"
  - "Show type checkboxes in NoteGraphView now iterate Object.keys(mergedColors) instead of hardcoded list — allows custom types added via customSourceColors to appear"

patterns-established:
  - "Backend copilot pattern: service handles persistence+LLM, router is a thin wrapper — same as library notes copilot"
  - "Context item metadata pattern: arbitrary dict field allows experiment config/metrics/children without schema changes"

requirements-completed: [IDE-05, IDE-04]

# Metrics
duration: 20min
completed: 2026-03-18
---

# Phase 08 Plan 01: Project Notes Copilot Backend + Component Prop Extensions Summary

**Project-scoped AI copilot backend (POST /api/projects/{id}/notes-copilot) with experiment context building + NoteGraphView/NotesCopilotPanel prop extensions for reuse in ProjectNotesIDE**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-18T16:00:00Z
- **Completed:** 2026-03-18T16:20:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created full backend copilot stack: migration adding project_id to chat_messages, service with experiment context building (_build_context_block handles status/config/metrics/children for experiment items), and router with GET/POST/DELETE endpoints under /api/projects/{id}/notes-copilot
- Extended NoteGraphView with customSourceColors, customSourceLabels, and storagePrefix props; all SOURCE_COLOR/SOURCE_LABEL references replaced with merged counterparts; Show checkboxes now dynamic over merged keys
- Extended NotesCopilotPanel with sendFn/scopeId override and experiments prop; @ mention dropdown shows experiments with status dot + metrics preview; projectNotesCopilotApi exported from api.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend migration, service, router for project notes copilot** - `4338bbd` (feat)
2. **Task 2: Extend NoteGraphView, NotesCopilotPanel props + frontend API client** - `61de0a7` (feat)

## Files Created/Modified
- `backend/migrations/020_project_notes_copilot.sql` - Adds project_id column + index to chat_messages
- `backend/models/chat.py` - Added project_id to ChatMessage; extended NotesCopilotContextItem docstring; added ProjectNotesCopilotMessageCreate model
- `backend/services/project_notes_copilot_service.py` - Project-scoped copilot service with experiment context block building
- `backend/routers/project_notes_copilot.py` - GET/POST/DELETE /api/projects/{id}/notes-copilot router
- `backend/app.py` - Wire project_notes_copilot router
- `frontend/src/components/NoteGraphView.jsx` - Added customSourceColors, customSourceLabels, storagePrefix props; replaced hardcoded SOURCE_COLOR/SOURCE_LABEL with merged versions
- `frontend/src/components/NotesCopilotPanel.jsx` - Added sendFn, scopeId, experiments props; experiment @ mention with status dot + metrics preview; ITEM_STYLE + EXPERIMENT_STATUS_COLOR extended
- `frontend/src/services/api.js` - Added projectNotesCopilotApi export

## Decisions Made
- project_notes_copilot_service.py is a separate service (not merged with notes_copilot_service.py) to avoid branching complexity — same architecture, different scope key
- suggest_note_create target_type enum includes 'project' and 'experiment' so the AI can propose notes at either scope
- storagePrefix prop replaces hardcoded 'researchos.graph.' so library and project graph views don't share localStorage keys
- Children for experiment context items are pre-filtered client-side by parentId at @ mention selection time — no extra round-trip

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
Run `backend/migrations/020_project_notes_copilot.sql` in the Supabase SQL editor to add the project_id column to chat_messages before using the project notes copilot.

## Next Phase Readiness
- Plan 02 (ProjectNotesIDE) can now import NoteGraphView with storagePrefix='researchos.project.graph.' and NotesCopilotPanel with sendFn=projectNotesCopilotApi.send + experiments prop without modifying shared components
- projectNotesCopilotApi is ready for wiring in ProjectNotesIDE

---
*Phase: 08-port-library-notes-ide-features-to-project-notes*
*Completed: 2026-03-18*
