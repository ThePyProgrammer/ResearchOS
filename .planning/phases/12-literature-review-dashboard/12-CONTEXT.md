# Phase 12: Literature Review Dashboard - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Visual overview of a project's literature — citation network graph between linked papers, publication timeline, and coverage heatmap by topic/method. All three visualizations operate on project-linked papers. Helps researchers spot gaps in their literature coverage without AI analysis.

</domain>

<decisions>
## Implementation Decisions

### Citation network graph
- d3 force-directed graph (same pattern as NoteGraphView)
- Multiple edge types: shared authors (blue solid) and same venue (orange dashed), each toggleable
- Node color configurable via per-visualization options: Year (gradient), Venue (categorical), Type (paper/website), Uniform
- Node size configurable: Connection count, Year, Uniform
- Hover shows tooltip with title, authors, year, venue
- Click navigates to paper detail page (consistent with existing patterns)

### Publication timeline
- Scatter plot on a horizontal year axis (dots stacking vertically for same-year papers)
- Color-by options same as network graph (year/venue/type/uniform), configured independently via its own options
- Hover tooltip + click opens paper (same interaction pattern as network)
- Uses recharts (already installed, used in Dashboard.jsx)

### Coverage heatmap
- Configurable axes — user picks what goes on rows and columns from: Tags, Venue, Year, Author
- Label source: paper tags (existing field) first, with an "Extract keywords" button that uses AI to auto-tag untagged papers from abstracts
- Cell intensity = paper count for that combination
- Gap highlighting: Claude's discretion on visual treatment

### Dashboard layout & navigation
- New "Review" tab in ProjectDetail (alongside Literature, Experiments, Notes, Tasks)
- Three visualizations stacked vertically, scrollable: Citation Network (largest, ~60vh), Timeline, Heatmap
- Each section is collapsible (click header to toggle)
- Per-visualization inline options (gear icon per section) — NOT a shared sidebar panel
  - Network options: color-by, size-by, edge type toggles
  - Timeline options: color-by
  - Heatmap options: row axis, column axis, "Extract keywords" button

### Consistent interactions
- All visualizations: hover shows tooltip, click opens paper detail
- All support color-by with same dimension options (year/venue/type/uniform)
- Options are per-visualization, configured independently

### Claude's Discretion
- Force graph physics parameters (charge, link distance, collision radius)
- Heatmap gap visual treatment (color scale, borders, or dashed cells)
- Timeline dot jittering/stacking algorithm for same-year papers
- Color palette choices for venue categorical colors
- AI keyword extraction prompt design and caching strategy
- Whether to use recharts or d3 for the heatmap (both available)

</decisions>

<specifics>
## Specific Ideas

- Network graph should follow the NoteGraphView pattern closely — same d3 force simulation approach, familiar look
- Options panel should feel like a compact settings popover (gear icon → dropdown), not a full sidebar
- The "Extract keywords" AI fill is a nice-to-have enhancement — core heatmap works with existing tags and venue/year/author axes without it

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NoteGraphView.jsx` — d3 force-directed graph with nodes, links, hover tooltips, click handling, zoom/pan. Direct pattern for citation network.
- `Dashboard.jsx` — recharts line/area charts for papers-over-time. Pattern for timeline scatter plot.
- `NotesCopilotPanel.jsx` — recharts `MetricComparisonChart` for bar/line charts in copilot responses.
- `d3` v7.9 — already installed, used for force graph + convex hulls in NoteGraphView.
- `recharts` v3.7 — already installed, used in Dashboard and copilot charts.
- `related_paper_service.py` — OpenAlex integration, has citation/related paper data patterns.
- `projectPapersApi` — fetches project-linked papers with full metadata.

### Established Patterns
- Paper model has `year`, `venue`, `doi`, `authors`, `tags` fields — all usable as heatmap/color axes
- ProjectDetail uses routed tabs (React Router outlets) — adding "Review" tab follows existing pattern
- Collapsible sections pattern exists in ExperimentFolder and project sidebar

### Integration Points
- `ProjectDetail.jsx` — add Review tab route and nav link
- `projectPapersApi.list(projectId)` — data source for all visualizations
- Paper `tags` field — primary source for heatmap topic/method labels
- `App.jsx` routes — add `/projects/:id/review` route

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-literature-review-dashboard*
*Context gathered: 2026-03-21*
