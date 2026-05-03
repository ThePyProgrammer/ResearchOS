---
phase: 12-literature-review-dashboard
plan: 01
subsystem: ui
tags: [react, vitest, testing-library, d3, data-visualization, literature-review]

# Dependency graph
requires:
  - phase: 02-research-questions-literature
    provides: projectPapersApi.list and the LiteratureTab join pattern (fetch all items, join client-side by ID)
  - phase: 07-experiment-table-view
    provides: useLocalStorage hook extracted to hooks/useLocalStorage.js

provides:
  - Review tab route at /projects/:id/review with CollapsibleSection shell
  - Six tested pure data utility functions: normalizeAuthor, buildCitationEdges, getNodeColor, getNodeSize, computeTimelinePositions, buildHeatmapMatrix
  - 35 unit tests + 4 smoke tests all passing
  - Sidebar Review sublink, breadcrumb label, and sectionLabels entry

affects:
  - 12-02 (Citation Network visualization - will use buildCitationEdges, getNodeColor, getNodeSize)
  - 12-03 (Publication Timeline - will use computeTimelinePositions, getNodeColor)
  - 12-04 (Coverage Heatmap - will use buildHeatmapMatrix)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CollapsibleSection with useLocalStorage for collapsed/options state, gear popover with outside-click-to-close via useRef + document mousedown listener
    - Pure utility functions exported as named exports alongside default component export for isolated testability
    - TDD: failing test file written before implementation file exists

key-files:
  created:
    - frontend/src/pages/ProjectReviewDashboard.jsx
    - frontend/src/pages/ProjectReviewDashboard.test.jsx
    - frontend/src/pages/ProjectReviewDashboard.smoke.test.jsx
  modified:
    - frontend/src/App.jsx
    - frontend/src/components/layout/Sidebar.jsx
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "normalizeAuthor detects Last/First format via comma presence in original string before stripping punctuation — avoids incorrect token order after cleanup"
  - "buildCitationEdges is O(n^2) — acceptable for project-scale paper counts (tens to hundreds)"
  - "buildHeatmapMatrix limits author axis to first 3 authors per paper to prevent matrix explosion with many-author papers"
  - "CollapsibleSection stores collapsed and optionsOpen state in localStorage keyed by projectId+sectionId — persists across navigation without lifting state"

patterns-established:
  - "Pure functions as named exports: export function utilFn() alongside export default Component — enables isolated unit testing without React/DOM"
  - "Smoke test pattern for data-fetching components: mock API module, mock useOutletContext, render with MemoryRouter, assert section headers visible after waitFor"

requirements-completed: [REV-01, REV-02, REV-03, REV-04, REV-06, REV-07, REV-08]

# Metrics
duration: 7min
completed: 2026-03-21
---

# Phase 12 Plan 01: Review Tab Shell and Data Utility Functions Summary

**Review tab route at /projects/:id/review with three CollapsibleSections, six tested pure data-processing functions (normalizeAuthor, buildCitationEdges, getNodeColor, getNodeSize, computeTimelinePositions, buildHeatmapMatrix), 39 passing tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-21T05:56:08Z
- **Completed:** 2026-03-21T06:03:00Z
- **Tasks:** 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- Created ProjectReviewDashboard.jsx with 6 exported pure utility functions and a full React component shell with three collapsible sections, gear options popovers, and localStorage persistence
- Created 35 unit tests covering all edge cases: author format variations, empty inputs, multi-tag explosion, venue fallback coloring, timeline year grouping, matrix construction
- Created 4 smoke tests confirming the component renders three section headers and handles empty paper lists without crashing
- Wired Review tab into App.jsx route tree, Sidebar.jsx subLinks array, and ProjectDetail.jsx sectionLabels + ProjectReview wrapper export

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure data utility functions with tests, plus smoke test (TDD)** - `e4a49b1` (feat)
2. **Task 2: Review tab route, sidebar link, breadcrumbs, and collapsible section shell** - `498be48` (feat)

**Plan metadata:** (pending docs commit)

_Note: Task 1 followed full TDD cycle: RED (test file with import failure) → GREEN (implementation → 39 passing tests)_

## Files Created/Modified
- `frontend/src/pages/ProjectReviewDashboard.jsx` - Review tab component with 6 exported pure utility functions and CollapsibleSection shell
- `frontend/src/pages/ProjectReviewDashboard.test.jsx` - 35 pure unit tests for all utility functions
- `frontend/src/pages/ProjectReviewDashboard.smoke.test.jsx` - 4 smoke tests verifying component renders 3 collapsible sections
- `frontend/src/App.jsx` - Added ProjectReview import and `<Route path="review">` inside projects/:id route group
- `frontend/src/components/layout/Sidebar.jsx` - Added Review sublink (analytics icon) to project subLinks array
- `frontend/src/pages/ProjectDetail.jsx` - Added ProjectReviewDashboard import, review to sectionLabels, ProjectReview wrapper export

## Decisions Made
- normalizeAuthor detects "Last, First" format via comma presence in the original string (before stripping punctuation) to avoid incorrect token ordering after cleanup
- buildCitationEdges uses O(n^2) pairwise comparison — acceptable for project-scale paper counts (tens to hundreds); can be optimized later if needed
- buildHeatmapMatrix limits author axis to first 3 authors per paper to prevent matrix explosion with many-author ML papers
- CollapsibleSection stores collapsed + optionsOpen state in localStorage keyed by `researchos.review.${projectId}.${sectionId}.{key}` — persists across navigation without lifting state to parent

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Smoke test produced `act(...)` warnings (not wrapped) for the initial `setLoading(false)` state update after async fetch — tests still pass because `waitFor` handles the async correctly. This is a known testing-library pattern when async state updates occur after render; not a test correctness issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All data utility functions tested and exported — Plans 12-02 (Citation Network), 12-03 (Timeline), 12-04 (Heatmap) can import and use them directly without reimplementing data logic
- CollapsibleSection shells in place with options popovers — visualization plans add their d3/recharts rendering inside the placeholder `<p>` elements
- Route, sidebar link, and breadcrumbs fully functional — navigating to /projects/:id/review works

---
*Phase: 12-literature-review-dashboard*
*Completed: 2026-03-21*

## Self-Check: PASSED

- FOUND: frontend/src/pages/ProjectReviewDashboard.jsx
- FOUND: frontend/src/pages/ProjectReviewDashboard.test.jsx
- FOUND: frontend/src/pages/ProjectReviewDashboard.smoke.test.jsx
- FOUND: commit e4a49b1 (Task 1)
- FOUND: commit 498be48 (Task 2)
