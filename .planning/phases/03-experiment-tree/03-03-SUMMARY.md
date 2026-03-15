---
phase: 03-experiment-tree
plan: "03"
subsystem: frontend-ui
tags: [experiments, react, aggregation, notes, tiptap, literature-linking]
dependency_graph:
  requires:
    - phase: 03-02
      provides: ExperimentSection, ExperimentNode, KVEditor, DnD reorder
    - phase: 03-01
      provides: experiment-api, experimentsApi.listPapers/linkPaper/unlinkPaper, notesApi.listForExperiment/createForExperiment
  provides:
    - aggregateDescendants function (recursive status counts + metric ranges)
    - parent experiment node summaries (status pills + metric range chips)
    - experiment inline notes panel via NotesPanel tiptap
    - experiment literature linking via MiniSearchPicker
    - RQ link badge on experiment nodes
  affects: [frontend-api, ProjectDetail.jsx]
tech_stack:
  added: []
  patterns: [batch-fetch-map-pattern, inline-expand-panel, aggregation-function]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx
key-decisions:
  - "aggregateDescendants walks ONLY leaves (nodes with no children) to avoid double-counting at intermediate nodes — consistent with plan specification"
  - "Metric range chips show top 3 alphabetically; format is min-max (or just the value if min===max)"
  - "Notes panel expands inline below the experiment node with max-h-96 / overflow-auto to keep the tree navigable"
  - "Notes button visibility tied to group-hover (same as three-dot menu) but stays visible when notesOpen is true via conditional color class"
  - "expPapersMap fetched in batch after loading all experiments in ExperimentSection (not per-node) — consistent with rqPapersMap pattern"
  - "RQ list fetched in parallel with experiments via Promise.all in fetchExperiments"
  - "ExperimentSection uses handleExpPapersChange callback to update the Map for a single experiment after link/unlink without refetching all"
requirements-completed: [EXP-06, EXP-10, LIT-02]
duration: ~10min
completed: "2026-03-15"
---

# Phase 3 Plan 3: Parent Aggregation Summaries, Experiment Notes, and Experiment Literature Linking Summary

**Recursive leaf-descent aggregation showing colored status count pills and metric range chips on parent experiment nodes, plus tiptap inline notes and MiniSearchPicker literature linking per experiment**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-15
- **Completed:** 2026-03-15
- **Tasks:** 1 (Task 2 is a human-verify checkpoint — not executed)
- **Files modified:** 1

## Accomplishments
- `aggregateDescendants(node)` recursively walks all leaf descendants to compute status counts (`planned`/`running`/`completed`/`failed`) and numeric metric min/max ranges
- Parent experiment nodes display colored mini pills for each non-zero status count (e.g., "2 Completed", "1 Failed") using `experimentStatusConfig` colors
- Parent experiment nodes display compact metric range chips for top 3 metrics alphabetically (e.g., `accuracy: 0.72-0.85 | loss: 0.12-0.25`)
- Experiment nodes have an `edit_note` icon button that toggles an expandable inline `NotesPanel` (tiptap WYSIWYG) scoped via `notesApi.createForExperiment` — notes do NOT appear in the project-level Notes tab
- Experiment nodes have a `link` icon in expanded view that opens `MiniSearchPicker` for searching and linking papers/websites from the library
- Linked papers appear as dismissible chips below the experiment node; unlink calls `experimentsApi.unlinkPaper`
- `ExperimentSection` fetches experiment papers in batch via `Promise.all` and stores as `expPapersMap` (Map), passed down to each `ExperimentNode`
- `ExperimentSection` also fetches RQ list in parallel; RQ badge displayed on `ExperimentNode` when `experiment.rqId` matches

## Task Commits

1. **Task 1: Parent aggregation summaries, experiment notes panel, and experiment literature linking** - `1720df6` (feat)

## Files Created/Modified
- `frontend/src/pages/ProjectDetail.jsx` - Added aggregateDescendants, updated ExperimentNode with parent summaries/notes/literature linking/RQ badge, updated ExperimentSection with batch paper fetch and RQ list

## Decisions Made
- Aggregation only counts leaf nodes (nodes with no children) to avoid double-counting. A parent with 2 children each with 2 leaves correctly counts 4 leaves, not 3.
- Metric range chip format: if min === max, shows a single value. Uses `toFixed(2)` for floats, `String(n)` for integers.
- Notes panel max-height capped at `24rem` (`max-h-96`) with `overflow-y-auto` to prevent the inline panel from taking over the entire tree view.
- `handleExpPapersChange` updates only the targeted experiment's entry in the Map (not a full refetch), keeping the UI responsive.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: frontend/src/pages/ProjectDetail.jsx (modified)
- FOUND: commit 1720df6 (Task 1)
- FOUND: aggregateDescendants function at correct location
- FOUND: ExperimentNode accepts expPapersMap, onExpPapersChange, rqList props
- FOUND: ExperimentSection fetches papers in batch via fetchExpPapers
- BUILD: vite build succeeds with zero errors

## Next Phase Readiness
- Human verification (Task 2 checkpoint) needed to confirm all 22 test steps pass end-to-end
- After human verification, Phase 3 (experiment tree) will be complete and Phase 4 can begin

---
*Phase: 03-experiment-tree*
*Completed: 2026-03-15*
