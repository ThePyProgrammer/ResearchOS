---
phase: 08-port-library-notes-ide-features-to-project-notes
plan: 03
subsystem: ui
tags: [react, recharts, d3, copilot, notes-ide, graph-view, inline-charts]

requires:
  - phase: 08-port-library-notes-ide-features-to-project-notes plan 01
    provides: NoteGraphView with hull grouping, NotesCopilotPanel with suggestion tabs, projectNotesCopilotApi
  - phase: 08-port-library-notes-ide-features-to-project-notes plan 02
    provides: ProjectNotesIDE base with tabs, sidebar, wikilinks, and initial graph/copilot wiring stubs

provides:
  - Experiment hull grouping in graph view (graphSourceKeyCollections, graphCollections)
  - Inline recharts bar/line chart rendering in copilot messages via data-chart div protocol
  - NOTES_COPILOT system prompt extended with data-chart format instructions
  - MetricComparisonChart component (BarChart + LineChart) in NotesCopilotPanel
  - useChartRenderer hook: createRoot-based chart mounting after dangerouslySetInnerHTML render

affects:
  - ProjectNotesIDE.jsx (graph hull grouping and copilot already wired)
  - NotesCopilotPanel.jsx (chart rendering now available for all copilot uses, not just project notes)

tech-stack:
  added: []
  patterns:
    - "data-chart div protocol: LLM emits <div data-chart='{...}'> placeholders; useChartRenderer mounts React charts via createRoot after HTML render"
    - "createRoot-based portal pattern for injecting React components into dangerouslySetInnerHTML content"
    - "useMemo sourceKeyCollections: maps experiment sourceKeys to parent group IDs for NoteGraphView hull grouping"

key-files:
  created: []
  modified:
    - frontend/src/pages/ProjectNotesIDE.jsx
    - frontend/src/components/NotesCopilotPanel.jsx
    - backend/agents/prompts.py

key-decisions:
  - "Chart rendering uses createRoot into data-chart div placeholders rather than a custom HTML parser — avoids brittle regex parsing of LLM output"
  - "useChartRenderer cleanup unmounts roots via setTimeout(0) to avoid React concurrent-mode warnings during rapid re-renders"
  - "graphSourceKeyCollections maps each experiment to its parent group ID — enables per-experiment hulls to visually cluster under parent experiment groups"
  - "NOTES_COPILOT chart instructions include clear prohibition on fabricated numbers so LLM only renders charts with actual experiment metric data"
  - "MetricComparisonChart placed in NotesCopilotPanel.jsx (not ProjectNotesIDE.jsx) so chart rendering works for both library and project copilot scopes"

patterns-established:
  - "data-chart protocol: <div data-chart='{\"type\":\"bar\",\"data\":[{\"name\":\"x\",\"value\":0.9}]}'></div>"
  - "useChartRenderer: finds [data-chart] after render, mounts MetricComparisonChart via createRoot, cleans up on next render"

requirements-completed: [IDE-04, IDE-05, IDE-06]

duration: 12min
completed: 2026-03-18
---

# Phase 08 Plan 03: Graph View + Copilot + Inline Charts Summary

**Experiment hull grouping in D3 force graph, inline recharts bar/line charts in copilot messages via data-chart div protocol, and LLM prompt updated to produce chart data for metric comparisons**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-18T08:30:00Z
- **Completed:** 2026-03-18T08:42:00Z
- **Tasks:** 1 (task 2 is human-verify checkpoint)
- **Files modified:** 3

## Accomplishments

- Added `graphSourceKeyCollections` and `graphCollections` useMemo to ProjectNotesIDE so experiment nodes are grouped into hull boundaries by parent experiment in the graph view
- Added `MetricComparisonChart` component (Recharts BarChart + LineChart, 140px height, responsive) to NotesCopilotPanel alongside `useChartRenderer` hook that finds `[data-chart]` divs after HTML render and mounts charts via `createRoot`
- Extended `NOTES_COPILOT` system prompt with `data-chart` format instructions so the LLM knows to emit chart placeholders when comparing experiment metrics
- All graph view, copilot panel, and suggestion tab wiring was completed in plan 02 — plan 03 only adds the chart rendering and hull grouping enhancements

## Task Commits

1. **Task 1: Wire graph view and copilot panel into ProjectNotesIDE** - `870af80` (feat)

**Plan metadata:** (pending — added in final commit)

## Files Created/Modified

- `frontend/src/pages/ProjectNotesIDE.jsx` — Added graphSourceKeyCollections and graphCollections useMemo; pass them to NoteGraphView
- `frontend/src/components/NotesCopilotPanel.jsx` — Added recharts imports, createRoot import, MetricComparisonChart component, useChartRenderer hook; wired contentRef to ChatBubble div
- `backend/agents/prompts.py` — Extended NOTES_COPILOT with data-chart format instructions and chart use guidance

## Decisions Made

- Chart rendering uses `createRoot` into `data-chart` div placeholders rather than a custom HTML parser to avoid brittle regex parsing of LLM output
- `MetricComparisonChart` placed in `NotesCopilotPanel.jsx` (not `ProjectNotesIDE.jsx`) so chart rendering works for both library and project copilot scopes — a plan deviation justified by better reuse
- `useChartRenderer` cleanup unmounts roots via `setTimeout(0)` to avoid React concurrent-mode warnings during rapid re-renders
- `graphSourceKeyCollections` maps each experiment to `exp.parentId || exp.id` so top-level experiments form their own groups and child experiments cluster under parent hulls

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] MetricComparisonChart placed in NotesCopilotPanel instead of ProjectNotesIDE**
- **Found during:** Task 1 (Wire graph view and copilot panel)
- **Issue:** Plan specified adding MetricComparisonChart to ProjectNotesIDE.jsx, but NotesCopilotPanel is a shared component used by both library and project notes — placing charts in NotesCopilotPanel makes them work in both contexts
- **Fix:** Added MetricComparisonChart and useChartRenderer directly to NotesCopilotPanel.jsx
- **Files modified:** frontend/src/components/NotesCopilotPanel.jsx
- **Verification:** Build succeeds, all 78 tests pass
- **Committed in:** 870af80 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical functionality for library scope)
**Impact on plan:** Fix improves coverage — charts now work in both library and project copilot, not just project notes.

## Issues Encountered

None — the graph view, copilot panel wiring, and suggestion tabs were already complete from plan 02. This plan only added the three missing pieces: hull grouping data, inline charts, and the LLM prompt update.

## Self-Check: PASSED

- FOUND: frontend/src/pages/ProjectNotesIDE.jsx
- FOUND: frontend/src/components/NotesCopilotPanel.jsx
- FOUND: backend/agents/prompts.py
- FOUND: commit 870af80 (feat(08-03): integrate graph view, copilot, inline metric charts)

## Next Phase Readiness

- All 6 IDE requirements (IDE-01 through IDE-06) are implemented and ready for human verification in Task 2 (checkpoint)
- Chart rendering will only produce output when the LLM emits valid `data-chart` JSON — graceful no-op on malformed or missing data

---
*Phase: 08-port-library-notes-ide-features-to-project-notes*
*Completed: 2026-03-18*
