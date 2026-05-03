---
phase: 08-port-library-notes-ide-features-to-project-notes-sidebar-width-pinned-notes-tabs-wikilinks-graph-view-ai-copilot-with-experiment-results
plan: 02
subsystem: ui
tags: [react, tiptap, wikilinks, notes-ide, experiments]

# Dependency graph
requires:
  - phase: 08-port-library-notes-ide-features
    provides: NoteGraphView + NotesCopilotPanel prop extensions, projectNotesCopilotApi
  - phase: 03-experiment-tree
    provides: experiments table + notesApi experiment extensions
provides:
  - ProjectNotesIDE component at frontend/src/pages/ProjectNotesIDE.jsx
  - /projects/:id/notes route renders full IDE (replaces ProjectNotes wrapper)
affects: [08-03-if-any]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "activeEditorSourceRef tracks current note's sourceKey so createNote routes to correct API without folder selection state"
    - "Tab label prefixes experiment name (15-char truncated) for cross-experiment note identification"
    - "getAllNotesForSuggestion returns allLoadedNotes + pseudo-entries for experiments enabling [[ExpName]] wikilinks"
    - "Project-scoped graph via customSourceColors/customSourceLabels/storagePrefix props added in Plan 01"
    - "loadedExps keyed by expId with 'loading' sentinel prevents duplicate concurrent fetches"

key-files:
  created:
    - frontend/src/pages/ProjectNotesIDE.jsx
  modified:
    - frontend/src/App.jsx

key-decisions:
  - "useOutletContext() gets project and id from ProjectDetail — experiments loaded independently in ProjectNotesIDE to keep ProjectDetail lean"
  - "activeEditorSourceRef (useRef, not useState) tracks current note source without triggering re-renders — set on openNoteInTab and on tab activation"
  - "Tab label truncates experiment name to 15 chars for readable display at max 200px tab width"
  - "No virtual folder node injection (unlike old ProjectNotes) — experiments are first-class ExperimentFolder components"
  - "createNote() function remains as internal routing helper for wiki-link auto-create; not exported"
  - "NotesCopilotPanel sendFn passes projectNotesCopilotApi.send (unbound) + scopeId=projectId — panel calls sendFn(scopeId, payload)"

patterns-established:
  - "ProjectNotesIDE follows LibraryNotes structure exactly: sidebar w-64 | tab bar | editor area"
  - "ExperimentFolder mirrors ItemFolder pattern with indigo color scheme and science icon"

requirements-completed: [IDE-01, IDE-02, IDE-03]

# Metrics
duration: 10min
completed: 2026-03-18
---

# Phase 08 Plan 02: ProjectNotesIDE — Full IDE Component Summary

**Full-featured project notes IDE with w-64 sidebar (Pinned/Recent/Project Notes/Experiment folders), multi-tab editor, wikilink autocomplete with experiment pseudo-entries, and correct note creation routing via activeEditorSourceRef**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-18T08:14:20Z
- **Completed:** 2026-03-18T08:24:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `ProjectNotesIDE.jsx` (1682 lines) adapting LibraryNotes patterns for project scope: w-64 sidebar, Pinned section, Recent section, Project Notes tree, per-experiment ExperimentFolder components
- Multi-tab editor with experiment name prefix labels ("ExpName > NoteName"), max 12 tabs, close oldest on overflow
- Tiptap editor with full toolbar (bold/italic/underline/strike/highlight/link/lists/tasks/blockquote/code/math/table/export)
- WikiLink autocomplete returns allLoadedNotes + experiment pseudo-entries; onWikiLinkClick navigates to note or auto-creates in current scope
- Note creation routing via `activeEditorSourceRef` — project notes go to `notesApi.createForProject`, experiment notes to `notesApi.createForExperiment`
- Graph view wired to NoteGraphView with `storagePrefix="researchos.project.graph."`, custom indigo/slate source colors, project vs experiment node types
- NotesCopilotPanel wired with `sendFn=projectNotesCopilotApi.send`, `scopeId=projectId`, `experiments=experiments`
- Updated App.jsx: replaced `ProjectNotes` import with `ProjectNotesIDE`, removed unused `ProjectNotes` named export

## Task Commits

1. **Task 1: Create ProjectNotesIDE with sidebar, tabs, pinned notes, and editor** - `889f83f` (feat)
2. **Task 2: Wire ProjectNotesIDE into routes and replace ProjectNotes** - `f3ce182` (feat)

## Files Created/Modified
- `frontend/src/pages/ProjectNotesIDE.jsx` - Full IDE component (1682 lines)
- `frontend/src/App.jsx` - Route updated to ProjectNotesIDE, ProjectNotes import removed

## Decisions Made
- ProjectDetail Outlet context provides `{ project, id }` — experiments are fetched inside ProjectNotesIDE to keep ProjectDetail lightweight
- `activeEditorSourceRef` (useRef) rather than useState to avoid re-renders on every tab click
- Tab labels truncate experiment name to 15 chars to keep tabs readable at 200px max width
- No virtual folder nodes — ExperimentFolder is a proper component unlike the old ProjectNotes hack
- `sendFn` receives the raw `projectNotesCopilotApi.send` bound function; NotesCopilotPanel calls it as `sendFn(scopeId, payload)`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Self-Check: PASSED
- `frontend/src/pages/ProjectNotesIDE.jsx` — FOUND (1682 lines)
- `frontend/src/App.jsx` contains `ProjectNotesIDE` — FOUND
- Task 1 commit `889f83f` — FOUND
- Task 2 commit `f3ce182` — FOUND
- All 78 tests passing — CONFIRMED

---
*Phase: 08-port-library-notes-ide-features-to-project-notes*
*Completed: 2026-03-18*
