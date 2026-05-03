---
phase: 03-experiment-tree
plan: "02"
subsystem: frontend-ui
tags: [experiments, react, dnd-kit, kv-editor, inline-editing, tree-ui]
dependency_graph:
  requires: [experiment-api, experiment-models, experiment-service]
  provides: [experiment-tree-ui, experiment-section, experiment-node, kv-editor]
  affects: [ProjectDetail.jsx, frontend-api]
tech_stack:
  added: []
  patterns: [rq-section-pattern, sortable-dnd-pattern, inline-editing, kv-jsonb-editing]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx
decisions:
  - "ExperimentNode uses double-click (not single-click) for name editing to avoid conflicts with expand/collapse chevron and other interactions"
  - "KVEditor tracks rows as local state array and syncs via useEffect when data prop changes — full dict sent to onSave on every mutation (JSONB replace semantics)"
  - "flattenExperimentTree produces _parentId metadata for DnD handleDragEnd to distinguish sibling reorder from cross-parent drag (same pattern as flattenRqTree)"
  - "ExperimentNode isLeaf/parent distinction drives icon selection: leaf nodes show science icon, parent nodes show account_tree icon"
  - "Phase 3 Coming Soon placeholder in LeftNav removed; Experiments now a first-class nav item between Literature and Notes"
  - "Experiments placeholder block removed from OverviewTab — ExperimentSection lives in its own dedicated tab"
metrics:
  duration: "~4 min"
  completed: "2026-03-15"
  tasks: 1
  files: 1
---

# Phase 3 Plan 2: Experiment Tree UI Summary

Experiment tree frontend: ExperimentSection container, ExperimentNode recursive component, ExperimentStatusDropdown, KVEditor for config/metrics inline editing, ExperimentCreateModal, DnD sibling reorder, and Experiments tab wired into ProjectDetail LeftNav.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | ExperimentSection, ExperimentNode, ExperimentStatusDropdown, ExperimentCreateModal, KVEditor, LeftNav tab | e56c769 | frontend/src/pages/ProjectDetail.jsx |

## What Was Built

### experimentStatusConfig
- Four statuses with correct color coding: planned (blue), running (amber), completed (emerald), failed (red)
- Matches RQ pattern exactly

### Helper functions
- `buildExperimentTree(flatExperiments)` — flat list → nested tree, sorted by position (copy of buildRqTree pattern)
- `flattenExperimentTree(nodes, parentId)` — tree → flat array with `_parentId` metadata for DnD sibling detection
- `detectType(raw)` — auto-detects boolean/number/string from raw string input

### ExperimentStatusDropdown
- Styled native select as badge pill
- Same pattern as RQStatusDropdown; uses experimentStatusConfig

### KVEditor
- Props: `{ data, label, onSave }` where data is a dict (config or metrics)
- Inline cell editing: click key/value cell to open text input, blur/Enter saves
- Add row button (+ icon in header), remove row (x icon per row, hover-reveal)
- Value type auto-detection via detectType() before calling onSave
- Sends complete updated dict to onSave (JSONB replace semantics)
- Empty state shows "No config set" / "No metrics set"

### ExperimentCreateModal
- Fixed overlay (z-50, bg-black/40), matches QuickAdd pattern
- Fields: name (required text), status (ExperimentStatusDropdown, default planned), config rows (dynamic key-value pairs)
- Escape key and backdrop click close the modal
- On submit: builds config dict with detectType(), calls experimentsApi.create(), then onCreated + onClose

### ExperimentNode
- Props: experiment, depth, onRefresh, projectId, isDragOverlay
- Drag handle (drag_indicator) with DnD listeners on handle only
- Expand/collapse chevron (shows children count when collapsed)
- Parent vs leaf icon: account_tree for parents, science for leaves
- Name: double-click to edit inline (saves on blur/Enter, cancel on Escape)
- ExperimentStatusDropdown — calls experimentsApi.update + onRefresh on change
- Context menu (three-dot): "Add sub-experiment" (opens ExperimentCreateModal with parentId) and "Delete" (confirm dialog)
- KVEditor for config and metrics below name row
- Children rendered recursively at depth=0 (indentation via paddingLeft)
- useSortable from @dnd-kit for sibling DnD

### ExperimentSection
- Fetches flat experiment list via experimentsApi.list(projectId)
- Builds tree via buildExperimentTree; flattens for DnD via flattenExperimentTree
- Header with "Add Experiment" button (opens ExperimentCreateModal with no parentId)
- Loading skeleton, error state, empty state with "Create your first experiment" CTA
- DndContext + SortableContext (same pattern as RQSection)
- handleDragEnd: same-parent sibling reorder via arrayMove + experimentsApi.reorder; cross-parent ignored
- DragOverlay shows floating card with experiment name + status badge
- Optimistic position updates on drag; re-fetches after reorder API call

### LeftNav updates
- Experiments tab added between Literature and Notes: `{ id: 'experiments', icon: 'science', label: 'Experiments' }`
- Phase 3 "Coming Soon" placeholder block fully removed
- activeTab === 'experiments' route renders `<ExperimentSection projectId={project.id} />`
- Experiments placeholder removed from OverviewTab (was "Experiments will appear here in Phase 3")

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: frontend/src/pages/ProjectDetail.jsx (modified)
- FOUND: commit e56c769 (Task 1)
- FOUND: ExperimentSection at line 1555
- FOUND: ExperimentNode at line 1321
- FOUND: KVEditor at line 416
- FOUND: ExperimentCreateModal at line 553
- FOUND: ExperimentStatusDropdown at line 214
- FOUND: buildExperimentTree at line 63
- FOUND: flattenExperimentTree at line 78
- FOUND: detectType at line 89
- FOUND: experiments tab in LeftNav at line 1996
- FOUND: activeTab === 'experiments' render at line 2187
- BUILD: npx vite build succeeds with zero errors
