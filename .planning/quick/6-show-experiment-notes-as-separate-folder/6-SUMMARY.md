---
phase: quick
plan: 6
subsystem: frontend/notes
tags: [notes, experiments, composite-state, virtual-folders]
dependency_graph:
  requires: [experimentsApi.list, notesApi.listForExperiment, notesApi.createForExperiment, notesApi.listForProject, notesApi.createForProject, NotesPanel]
  provides: [ProjectNotes with experiment folders]
  affects: [frontend/src/pages/ProjectDetail.jsx]
tech_stack:
  added: []
  patterns: [composite-notes-array, virtual-folder-nodes, state-partitioning, eager-loading]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx
decisions:
  - Composite array approach chosen over custom two-pane layout — avoids duplicating NotesPanel's tree rendering, editor, context menu, and auto-save
  - Eager loading of all experiment notes on mount chosen over lazy-load-on-toggle — NotesPanel does not expose an onToggle callback; eager loading is simpler and correct for typical experiment counts
  - Virtual folder IDs use 'exp_' prefix to distinguish from real note IDs in routing logic
  - noteToExpMap (useMemo Map of noteId -> expId) used for O(1) routing in combinedSetNotes
  - combinedSetNotes un-reparents experiment notes before storing in expNotesMap (restores original parentId: null)
  - combinedCreateFn detects exp_ prefix in parentId to route to createForExperiment; falls through to createForProject otherwise
metrics:
  duration: 8 min
  completed: 2026-03-18
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 6: Show Experiment Notes as Separate Folder — Summary

**One-liner:** ProjectNotes tab now shows experiment folders alongside project-level notes using a composite notes array with virtual 'exp_*' folder nodes that route CRUD operations to the correct API.

## What Was Built

Enhanced the `ProjectNotes` export in `frontend/src/pages/ProjectDetail.jsx` from a simple wrapper around `NotesPanel` into a richer component that merges project-level notes and experiment notes into a single unified tree.

### Component Architecture

The component uses a **composite notes array** approach:

1. **State:**
   - `experiments` — list of all project experiments, fetched via `experimentsApi.list(id)` on mount
   - `expNotesMap` — object keyed by experiment ID, values are note arrays (eagerly loaded)
   - `loadedExpsRef` — ref tracking which experiment IDs have been fetched (prevents duplicate fetches)

2. **`combinedNotes` (useMemo):** Merges:
   - All project-level notes (from outlet context)
   - Virtual folder nodes: `{ id: 'exp_{expId}', name: 'Experiment: {name}', type: 'folder', parentId: null, _isVirtualExpFolder: true }`
   - Reparented experiment notes (top-level notes get `parentId: 'exp_{expId}'` so they appear inside the virtual folder)

3. **`combinedSetNotes` (useCallback):** Intercepts all `setNotes` calls from NotesPanel:
   - Evaluates the updater function against `combinedNotes` to get the new array
   - Partitions by note identity: virtual folders discarded, experiment notes (tracked in `noteToExpMap`) routed to `setExpNotesMap`, remainder to `setProjectNotes`
   - Un-reparents experiment notes before storing (restores `parentId: null` for top-level exp notes)

4. **`combinedCreateFn` (useCallback):** Routes note creation:
   - `parentId` starts with `'exp_'` → `notesApi.createForExperiment(expId, {...data, parentId: null})`
   - `parentId` exists in `noteToExpMap` → `notesApi.createForExperiment(expId, data)` (nested under exp note)
   - Otherwise → `notesApi.createForProject(id, data)` (default)

### Result

- Project notes render at root (unchanged behavior)
- Each experiment appears as a collapsible folder below project notes
- Experiment notes appear nested inside the folder when expanded
- Create, edit, rename, delete, and auto-save all work for both project and experiment notes via NotesPanel's existing handlers
- `notesApi.update(noteId, ...)` works for any note regardless of source (same endpoint)

## Deviations from Plan

### Auto-changed Implementation Detail (No Plan Deviation)

The plan described "lazy loading on folder toggle" but NotesPanel does not expose an `onToggle` callback. Switched to **eager loading** all experiment notes on mount (once experiments are fetched). This is simpler, avoids the need to intercept folder toggle events, and is correct for typical experiment counts (projects rarely have hundreds of experiments).

No architectural change — still uses the composite array approach prescribed by the plan.

## Self-Check

### Files verified:
- `frontend/src/pages/ProjectDetail.jsx` — contains `experimentsApi.list`, `expNotesMap`, `exp_` prefix usage
- Commit `d6e411c` — exists in git log

## Self-Check: PASSED
