---
phase: 12-literature-review-dashboard
plan: "04"
subsystem: ui
tags: [react, recharts, d3, visualization, heatmap, scatter-plot, ai-tagging]

requires:
  - phase: 12-01
    provides: ProjectReviewDashboard shell with CollapsibleSection, pure utility functions (computeTimelinePositions, buildHeatmapMatrix, getNodeColor), and localStorage options persistence
  - phase: 12-02
    provides: projectPapersApi.extractKeywords endpoint for AI keyword tagging
  - phase: 12-03
    provides: CitationNetworkViz d3 force graph already wired into the dashboard shell

provides:
  - TimelineViz recharts scatter plot component with year-stacked dots and color-by options
  - HeatmapViz d3 SVG heatmap with configurable row/col axes, gap highlighting, and Extract Keywords button
  - All three visualizations (citation network, timeline, heatmap) wired into ProjectReviewDashboard
  - onPapersRefresh callback pattern for heatmap to trigger data reload after keyword extraction

affects:
  - future literature review dashboard enhancements
  - any component consuming project paper visualization

tech-stack:
  added: []
  patterns:
    - "Local matrix builder (buildLocalMatrix) in HeatmapViz extends ProjectReviewDashboard utility with papers[] per cell for tooltip and navigation"
    - "d3 SVG rendered via useEffect with direct DOM mutation; React state (hoveredCell) used only for tooltip overlay"
    - "onPapersRefresh prop pattern: child component calls parent's fetchPapers callback after side-effecting API call"

key-files:
  created:
    - frontend/src/components/TimelineViz.jsx
    - frontend/src/components/HeatmapViz.jsx
  modified:
    - frontend/src/pages/ProjectReviewDashboard.jsx

key-decisions:
  - "buildLocalMatrix defined locally in HeatmapViz (not reusing buildHeatmapMatrix from dashboard) to include papers[] per cell — tooltip and click navigation require paper references, not just counts"
  - "Default heatmap axes changed from tags x year to venue x year — tags are likely empty on first view, venue x year gives immediate useful signal"
  - "Click on multi-paper heatmap cell navigates to first paper (simplest correct behavior) rather than showing a popover list"
  - "hoveredCell state stored in React (not d3) — tooltip positioned absolutely over SVG container using clientX/Y relative to container bounds"

patterns-established:
  - "TimelineViz: recharts CustomDot component defined inside render function to close over setHoveredPaper without prop threading"
  - "HeatmapViz: d3 SVG rebuilt on rows/cols/cells change; color updates trigger full SVG rebuild (simpler than selective attribute updates for grid)"

requirements-completed:
  - REV-03
  - REV-04
  - REV-05
  - REV-07
  - REV-08

duration: 15min
completed: 2026-03-21
---

# Phase 12 Plan 04: Timeline and Heatmap Visualizations Summary

**Publication timeline (recharts scatter plot, year-stacked dots) and coverage heatmap (d3 SVG grid, configurable axes, gap highlighting) built and wired into the Literature Review dashboard alongside the citation network.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-21T07:00:00Z
- **Completed:** 2026-03-21T07:15:00Z
- **Tasks:** 2 of 3 (Task 3 is a human-verify checkpoint)
- **Files modified:** 3

## Accomplishments

- TimelineViz renders papers as colored scatter dots on a horizontal year axis with same-year papers stacked vertically; color-by options (year gradient, categorical venue, type, uniform) all work
- HeatmapViz renders a d3 SVG grid with configurable row/col axes (tags/venue/year/author), intensity-coded cells, dashed borders on zero-count cells for gap highlighting, hover tooltip, click navigation
- Extract Keywords button appears when tags axis is selected; triggers AI extraction via projectPapersApi.extractKeywords and calls onPapersRefresh to update the heatmap
- Tags sparsity callout warns when >50% of papers are untagged
- All three visualizations (citation network, timeline, heatmap) wired into ProjectReviewDashboard replacing placeholder text
- Default heatmap axes set to venue x year (not tags) to give useful signal before keywords are extracted

## Task Commits

1. **Task 1: TimelineViz recharts scatter plot** - `598412f` (feat)
2. **Task 2: HeatmapViz + wiring** - `ae575ab` (feat)
3. **Task 3: Human verify** - Checkpoint (awaiting user verification)

## Files Created/Modified

- `frontend/src/components/TimelineViz.jsx` - Recharts ScatterChart, d3 color scales, CustomDot with hover/click, excluded-year note
- `frontend/src/components/HeatmapViz.jsx` - d3 SVG heatmap, Extract Keywords button, tags sparsity callout, hover tooltip
- `frontend/src/pages/ProjectReviewDashboard.jsx` - Import and render all three visualization components; default heatmap axes changed to venue x year

## Decisions Made

- buildLocalMatrix defined locally in HeatmapViz to include papers[] per cell (the shared buildHeatmapMatrix utility only returns counts)
- Default heatmap axes changed from tags x year to venue x year — tags are likely sparse until Extract Keywords runs
- Multi-paper cell click navigates to first paper (simplest; avoids nested popover complexity)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HeatmapViz uses local matrix builder instead of imported buildHeatmapMatrix**
- **Found during:** Task 2 (HeatmapViz implementation)
- **Issue:** The shared `buildHeatmapMatrix` utility only returns `{ row, col, count }` per cell — no `papers[]` reference. The tooltip (which lists paper titles) and click navigation (which needs paper.id and paper.itemType) require the papers array per cell.
- **Fix:** Defined `buildLocalMatrix` inside HeatmapViz that extends the same logic and stores `papers[]` per cell in the count map. The shared function's logic was reproduced faithfully (same axis handling, same getDimensionValues).
- **Files modified:** `frontend/src/components/HeatmapViz.jsx`
- **Verification:** 35 unit tests still pass (they test the shared utility, not HeatmapViz internals)
- **Committed in:** ae575ab (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug/correctness)
**Impact on plan:** Essential for tooltip and navigation to work correctly. No scope creep.

## Issues Encountered

None — build passed cleanly, all 35 unit tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Task 3 (human-verify checkpoint) awaits user visual inspection of the complete dashboard
- All three visualization sections render in the Review tab; interactive tooltips, click navigation, and options popovers are wired
- Extract Keywords button is live end-to-end (requires project with papers that have abstracts)

---
*Phase: 12-literature-review-dashboard*
*Completed: 2026-03-21*

## Self-Check: PASSED

- FOUND: frontend/src/components/TimelineViz.jsx
- FOUND: frontend/src/components/HeatmapViz.jsx
- FOUND: .planning/phases/12-literature-review-dashboard/12-04-SUMMARY.md
- FOUND commit: 598412f (TimelineViz)
- FOUND commit: ae575ab (HeatmapViz + wiring)
