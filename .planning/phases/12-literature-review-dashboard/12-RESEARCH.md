# Phase 12: Literature Review Dashboard - Research

**Researched:** 2026-03-21
**Domain:** Data visualization (d3 force graph, recharts scatter/heatmap), React routing (tab extension), AI tag extraction
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Citation network graph**
- d3 force-directed graph (same pattern as NoteGraphView)
- Multiple edge types: shared authors (blue solid) and same venue (orange dashed), each toggleable
- Node color configurable via per-visualization options: Year (gradient), Venue (categorical), Type (paper/website), Uniform
- Node size configurable: Connection count, Year, Uniform
- Hover shows tooltip with title, authors, year, venue
- Click navigates to paper detail page (consistent with existing patterns)

**Publication timeline**
- Scatter plot on a horizontal year axis (dots stacking vertically for same-year papers)
- Color-by options same as network graph (year/venue/type/uniform), configured independently via its own options
- Hover tooltip + click opens paper (same interaction pattern as network)
- Uses recharts (already installed, used in Dashboard.jsx)

**Coverage heatmap**
- Configurable axes — user picks what goes on rows and columns from: Tags, Venue, Year, Author
- Label source: paper tags (existing field) first, with an "Extract keywords" button that uses AI to auto-tag untagged papers from abstracts
- Cell intensity = paper count for that combination
- Gap highlighting: Claude's discretion on visual treatment

**Dashboard layout and navigation**
- New "Review" tab in ProjectDetail (alongside Literature, Experiments, Notes, Tasks)
- Three visualizations stacked vertically, scrollable: Citation Network (largest, ~60vh), Timeline, Heatmap
- Each section is collapsible (click header to toggle)
- Per-visualization inline options (gear icon per section) — NOT a shared sidebar panel
  - Network options: color-by, size-by, edge type toggles
  - Timeline options: color-by
  - Heatmap options: row axis, column axis, "Extract keywords" button

**Consistent interactions**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

Phase 12 has no predefined requirement IDs in REQUIREMENTS.md. Requirements are derived from the goal and CONTEXT.md decisions:

| ID | Description | Research Support |
|----|-------------|-----------------|
| REV-01 | Citation network graph with shared-author (blue solid) and same-venue (orange dashed) edge types, toggleable | d3 v7.9 already installed; NoteGraphView.jsx is the direct pattern to follow |
| REV-02 | Node color-by (Year/Venue/Type/Uniform) and size-by (Connection count/Year/Uniform) options per visualization | Color scale patterns established in NoteGraphView; d3.scaleSequential for year gradient, categorical palette for venue |
| REV-03 | Publication timeline scatter plot, horizontal year axis, vertically stacking dots for same-year papers | recharts v3.7 already installed; ScatterChart or custom SVG via recharts |
| REV-04 | Coverage heatmap with configurable row/column axes (Tags/Venue/Year/Author), cell intensity = paper count | recharts or d3 both viable; research recommends d3 for full control |
| REV-05 | "Extract keywords" AI button that tags untagged papers from abstracts and updates tags field | Backend: new endpoint POST /api/papers/extract-keywords; OpenAI JSON mode pattern already used in note_service.py |
| REV-06 | "Review" tab added to ProjectDetail route hierarchy, three collapsible sections | App.jsx route + ProjectDetail tab nav + export pattern |
| REV-07 | Per-visualization gear icon options popover, not a shared sidebar | Inline options panel pattern from NoteGraphView's options overlay |
| REV-08 | Hover tooltip + click-to-navigate for all three visualizations | Consistent with NoteGraphView and Library table patterns |
</phase_requirements>

---

## Summary

Phase 12 adds a dedicated "Review" dashboard tab to the ProjectDetail view, presenting three data visualizations over the project's linked papers: a citation network graph, a publication timeline, and a coverage heatmap. All data comes from `projectPapersApi.list(projectId)` — no new data ingestion needed. The primary work is front-end visualization and a small backend AI endpoint for keyword extraction.

The project already has both required visualization libraries installed: d3 v7.9 (used in `NoteGraphView.jsx` for force-directed graphs) and recharts v3.7 (used in `Dashboard.jsx` for area charts and `NotesCopilotPanel.jsx` for bar/line charts). The NoteGraphView component is a near-complete template for the citation network graph — the main adaptation is changing the edge-building logic from wikilink scanning to shared-author and same-venue detection. The timeline and heatmap are new visualization types but use familiar patterns.

The one non-trivial backend piece is the AI keyword extraction endpoint (`POST /api/projects/{id}/papers/extract-keywords`), which bulk-tags untagged papers by calling OpenAI with their abstracts using the same JSON-mode pattern used in `note_service.py`. The tab routing addition in `App.jsx` and `ProjectDetail.jsx` follows a well-worn pattern (four previous tabs were added identically).

**Primary recommendation:** Build the Review tab as a single `ProjectReviewDashboard.jsx` component with three sub-components (`CitationNetworkViz`, `TimelineViz`, `HeatmapViz`), each self-contained with its own options state. Follow NoteGraphView's imperative d3 useEffect pattern for the network graph. Use recharts ScatterChart for the timeline and pure d3 SVG for the heatmap (recharts has no built-in heatmap primitive; d3 gives full cell control).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| d3 | ^7.9.0 | Force simulation, SVG rendering, color scales, zoom/pan | Already installed; used in NoteGraphView.jsx — direct reuse |
| recharts | ^3.7.0 | ScatterChart for publication timeline | Already installed; used in Dashboard.jsx and NotesCopilotPanel.jsx |
| React | ^18.3.1 | Component framework | Project standard |
| React Router v6 | ^6.28.0 | Tab routing via `<Outlet>` pattern | Already used for all 4 existing ProjectDetail tabs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useLocalStorage hook | (internal) | Persist collapse state and options per-project | Already at `frontend/src/hooks/useLocalStorage.js`; used in NoteGraphView |
| OpenAI (backend) | via `agents/llm.py` | AI keyword extraction | Only for "Extract keywords" button in heatmap |

### No New Dependencies Needed
All visualization and UI needs are covered by d3 + recharts already installed. No new npm packages required.

**Installation:**
```bash
# Nothing new to install — d3 and recharts already in package.json
```

---

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── pages/
│   └── ProjectReviewDashboard.jsx   # Main Review tab page (new)
├── components/
│   ├── CitationNetworkViz.jsx        # d3 force graph component (new)
│   ├── TimelineViz.jsx               # recharts scatter timeline (new)
│   └── HeatmapViz.jsx                # d3 SVG heatmap (new)

backend/
├── routers/
│   └── projects.py                   # Add POST /{id}/papers/extract-keywords
├── services/
│   └── keyword_extraction_service.py # New: bulk abstract → tags via OpenAI
```

### Pattern 1: Route-based Tab (exact replication of existing tabs)

**What:** Export a named component from `ProjectDetail.jsx`; add to `App.jsx` routes; add to breadcrumb label map.

**When to use:** Whenever a new top-level tab is added to ProjectDetail.

**Existing pattern in `App.jsx`:**
```jsx
// Source: frontend/src/App.jsx lines 37-43
<Route path="projects/:id" element={<ProjectDetail />}>
  <Route index element={<ProjectOverview />} />
  <Route path="literature" element={<ProjectLiterature />} />
  <Route path="experiments" element={<ProjectExperiments />} />
  <Route path="tasks" element={<ProjectTasks />} />
  <Route path="notes" element={<ProjectNotesIDE />} />
  {/* ADD: <Route path="review" element={<ProjectReview />} /> */}
</Route>
```

**Tab wrapper pattern in `ProjectDetail.jsx`:**
```jsx
// Source: frontend/src/pages/ProjectDetail.jsx line 4882
export function ProjectLiterature() {
  const { project } = useOutletContext()
  return (
    <div className="h-full overflow-hidden">
      <LiteratureTab projectId={project.id} libraryId={project.libraryId} />
    </div>
  )
}
// Mirror this pattern exactly for ProjectReview
```

**Breadcrumb label map extension (ProjectDetail.jsx line 4851):**
```jsx
// Source: frontend/src/pages/ProjectDetail.jsx
const sectionLabels = {
  literature: 'Literature', experiments: 'Experiments',
  tasks: 'Tasks', notes: 'Notes',
  review: 'Review'   // ADD THIS
}
```

**Note:** There is no explicit tab nav bar in the ProjectDetail component as of this research. Tabs are navigated via the project sidebar links in the left nav. The `review` segment just needs to be added to `App.jsx` routes and the breadcrumb map.

### Pattern 2: d3 Force Graph (adapted from NoteGraphView)

**What:** Imperative d3 rendering inside `useEffect` triggered by dependency changes. SVG managed entirely by d3; React manages options state and tooltip.

**When to use:** Network/graph visualizations where positions are simulation-driven.

**Key adaptation from NoteGraphView for citation network:**
- Edge-building: replace wikilink scanning with O(n²) shared-author / same-venue detection
- Edge types: two link arrays (`authorLinks`, `venueLinks`) drawn as separate `<line>` selections with different `stroke` and `strokeDasharray`
- Node color: driven by `colorBy` state — use `d3.scaleSequential(d3.interpolateYlOrRd)` for year gradient, a categorical palette array for venue, hardcoded colors for type, single color for uniform
- Node size: driven by `sizeBy` state — degree count (same as NoteGraphView), year (scaled), or uniform 8px

**Critical d3 force parameters (Claude's discretion to tune):**
```js
// Source: frontend/src/components/NoteGraphView.jsx lines 370-377
const sim = d3.forceSimulation(nodes)
  .force('link',      d3.forceLink(links).id(d => d.id).distance(100).strength(0.6))
  .force('charge',    d3.forceManyBody().strength(-250))
  .force('center',    d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide(d => nodeRadius(d.degree) + 20))
// Citation network can use similar params; no cluster force needed (papers aren't grouped by source type)
```

### Pattern 3: recharts ScatterChart for Timeline

**What:** A scatter plot where x = year (numeric), y = jitter offset (to stack papers landing in the same year), colored by the `colorBy` dimension.

**When to use:** Publication timeline — ordered by year, multiple papers per year.

**Stacking algorithm (jitter offset computation — Claude's discretion):**
```jsx
// Recommended approach: group by year, assign y = index within year group
function computeTimelinePositions(papers) {
  const byYear = {}
  for (const p of papers) {
    const y = p.year || 0
    if (!byYear[y]) byYear[y] = []
    byYear[y].push(p)
  }
  return papers.map(p => {
    const group = byYear[p.year || 0]
    const idx = group.indexOf(p)
    return { ...p, _x: p.year, _y: idx }
  })
}
```

**recharts ScatterChart pattern:**
```jsx
// Source: recharts v3 ScatterChart API
<ResponsiveContainer width="100%" height={180}>
  <ScatterChart margin={{ top: 8, right: 16, left: -20, bottom: 8 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
    <XAxis dataKey="_x" type="number" domain={['dataMin', 'dataMax']} tickCount={8} />
    <YAxis dataKey="_y" hide />
    <Tooltip content={<CustomTooltip />} />
    <Scatter data={positions} shape={<CustomDot onClick={handlePaperClick} />} />
  </ScatterChart>
</ResponsiveContainer>
```

### Pattern 4: d3 SVG Heatmap (recommended over recharts)

**What:** A grid of colored rectangles where row = one axis dimension, column = another, fill intensity = paper count.

**Why d3 over recharts for heatmap:** recharts has no `HeatmapChart` primitive. Building one with recharts `Cell` requires significant workarounds. d3 gives direct SVG control for arbitrary cell sizing, axis label wrapping, and custom gap highlighting.

**Core construction:**
```js
// Recommended d3 heatmap pattern
const rows = [...new Set(papers.map(p => getDimValue(p, rowAxis)))]
const cols = [...new Set(papers.map(p => getDimValue(p, colAxis)))]
const counts = {}  // `${row}||${col}` -> count

const x = d3.scaleBand().domain(cols).range([0, width]).padding(0.05)
const y = d3.scaleBand().domain(rows).range([0, height]).padding(0.05)
const color = d3.scaleSequential(d3.interpolateBlues).domain([0, maxCount])

svg.selectAll('rect')
  .data(cellData)
  .join('rect')
  .attr('x', d => x(d.col))
  .attr('y', d => y(d.row))
  .attr('width', x.bandwidth())
  .attr('height', y.bandwidth())
  .attr('fill', d => d.count === 0 ? '#f8fafc' : color(d.count))
  // Gap visual: dashed border on zero-count cells (Claude's discretion)
  .attr('stroke', d => d.count === 0 ? '#e2e8f0' : 'none')
  .attr('stroke-dasharray', d => d.count === 0 ? '3,2' : 'none')
```

### Pattern 5: Collapsible Section with Gear Options Popover

**What:** A section header with a collapse chevron and a gear icon that opens an inline options dropdown.

**When to use:** Each of the three visualization sections.

**Existing collapse pattern (from ExperimentFolder in ProjectDetail):**
```jsx
// Pattern: useState for open/collapsed, rotate chevron icon
const [collapsed, setCollapsed] = useLocalStorage(`researchos.review.${vizId}.collapsed`, false)

<div className="border border-slate-200 rounded-xl overflow-hidden">
  <button
    onClick={() => setCollapsed(c => !c)}
    className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
  >
    <span className="font-semibold text-sm text-slate-700">{title}</span>
    <Icon name={collapsed ? 'expand_more' : 'expand_less'} className="text-[16px] text-slate-400" />
  </button>
  {!collapsed && <div className="border-t border-slate-100">{children}</div>}
</div>
```

**Gear options popover pattern (from NoteGraphView options button):**
```jsx
// Source: frontend/src/components/NoteGraphView.jsx lines 516-530
<button
  onClick={() => setPanelOpen(o => !o)}
  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium shadow-sm border ..."
>
  <Icon name="tune" className="text-[14px]" />
  Options
</button>
{panelOpen && (
  <div className="mt-1.5 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-4 w-72">
    {/* options controls */}
  </div>
)}
```

### Anti-Patterns to Avoid

- **Storing D3 node positions in React state:** d3 mutates node objects directly during simulation; storing in useState triggers re-renders every tick and destroys performance. Use `useRef` for simulation reference (as NoteGraphView does with `simRef`).
- **Building heatmap with recharts `Cell`:** recharts Cell primitives are designed for pie/bar charts. Building an arbitrary 2D grid requires reconstructing what d3.scaleBand already provides cleanly.
- **Fetching papers inside each visualization component:** All three visualizations read the same `projectPapersApi.list(projectId)` data. Fetch once in the parent `ProjectReviewDashboard` and pass as props.
- **Using recharts Tooltip for d3 visualizations:** d3 and recharts don't share the DOM. Use React state (`hoveredPaper`) + absolute-positioned div for d3 tooltips (same as NoteGraphView's `hoveredNode`).
- **Deriving "shared authors" from authors as strings:** Paper `authors` is `list[str]` with raw name strings (e.g., `"Vaswani, Ashish"`, `"A. Vaswani"`, `"Ashish Vaswani"`). Do **not** use exact-string comparison for author matching — normalize by lowercasing, stripping punctuation, and comparing last-name + first-initial at minimum. Otherwise shared-author edges will almost never fire.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color scales (year gradient) | Custom lerp between two colors | `d3.scaleSequential(d3.interpolateYlOrRd)` | Handles domain clamping, NaN values, perceptually uniform |
| Force simulation | Physics engine | `d3.forceSimulation` | Collision detection, link forces, drag — thousands of lines of tested code |
| Zoom/pan on SVG | Manual wheel/pointer handlers | `d3.zoom()` | Already in NoteGraphView; handles scale limits, transform caching |
| Band scale for heatmap | Manual index * cellWidth arithmetic | `d3.scaleBand()` | Handles padding, alignment, bandwidth calculation |
| Author name normalization | Regex from scratch | Lowercase + last name extraction (3 lines) | Simple enough to hand-roll but must be done — don't skip normalization |
| Scatter layout | Random jitter | Index-within-year-group approach | Deterministic, readable, no overlap within year |
| Popover outside-click handling | Custom event delegation | `useRef` + `document.addEventListener('mousedown')` | Already used in NoteGraphView's `collDropRef` pattern |

**Key insight:** The visualization primitives (force simulation, scales, zoom, band layout) are all in d3 v7.9 which is already installed. Building any of these manually would be more code and far less robust.

---

## Common Pitfalls

### Pitfall 1: Author Name Normalization for Shared-Author Edges

**What goes wrong:** Paper `authors` is a `list[str]` of raw name strings. The same person appears as `"Vaswani, Ashish"`, `"Ashish Vaswani"`, `"A. Vaswani"` across different papers. Exact string comparison produces zero shared-author edges for most real datasets.

**Why it happens:** Author names come from heterogeneous sources (Crossref, arXiv, OpenReview) that have different formatting conventions.

**How to avoid:** Normalize before comparison:
```js
function normalizeAuthor(name) {
  // "Vaswani, Ashish" → "vaswani a"
  // "Ashish Vaswani" → "vaswani a"
  const parts = name.toLowerCase().replace(/[.,]/g, '').trim().split(/\s+/)
  const last = parts[parts.length - 1]
  const first = parts[0]
  return `${last} ${first[0]}`
}
```

**Warning signs:** Citation network renders with no author-based edges despite papers clearly sharing authors.

### Pitfall 2: Same-Year Scatter Plot Overlap Without Jitter

**What goes wrong:** Multiple papers from the same year render as a single dot (perfectly overlapping), making it impossible to tell how many papers exist for that year.

**Why it happens:** recharts ScatterChart maps each datum to x,y coordinates. If two points have the same x (year), they occupy the same pixel.

**How to avoid:** Pre-process data to compute y-offset = index within same-year group (see Pattern 3 above). Use a YAxis set to `hide` so the stacking is visible but the arbitrary y values aren't labeled.

**Warning signs:** A year with many papers looks identical to a year with one paper.

### Pitfall 3: D3 Simulation Rebuild on Every Render

**What goes wrong:** If `buildGraph()` or any visualization option is in the `useEffect` dependency array and those functions/values change on every render, the simulation restarts continuously, causing infinite flicker.

**Why it happens:** Functions defined in the component body are new references on every render. D3 `.on('tick')` callbacks capture stale closures.

**How to avoid:**
- Wrap graph-building logic in `useCallback` with stable dependencies (as NoteGraphView does with `buildGraph`)
- Use `useRef` for values that need to change without triggering simulation rebuild (`clusterRef`, `gravityRef` pattern from NoteGraphView)
- Keep option state changes that should only "reheat" the simulation separate from options that require full rebuild

**Warning signs:** Graph flickers, continuously repositions, or browser tab CPU pegs at 100%.

### Pitfall 4: Heatmap Axis Label Overflow

**What goes wrong:** Long venue names (e.g., "International Conference on Machine Learning") overflow their axis label area, overlapping cell content or being clipped.

**Why it happens:** d3 axis labels are rendered at fixed positions; SVG text doesn't wrap by default.

**How to avoid:** Truncate axis labels to a max of 30 characters with ellipsis in the data preprocessing step, before passing to the scale. Alternatively rotate x-axis labels 45 degrees for the column axis.

**Warning signs:** Column labels visibly overlap or run off the SVG edge.

### Pitfall 5: "Extract Keywords" Button Blocks UI During Bulk API Call

**What goes wrong:** Clicking "Extract keywords" sends N sequential OpenAI calls (one per untagged paper). With 50 papers, this takes 30–90 seconds with no feedback, and the UI appears frozen.

**Why it happens:** Naive implementation calls the AI endpoint per paper synchronously.

**How to avoid:** The backend endpoint should accept all untagged paper abstracts at once and process them in a single batched prompt, or use `asyncio.gather` for parallel calls. The frontend should show a loading spinner with a progress counter on the button while waiting. Cache the result — once a paper has tags, don't re-extract.

**Warning signs:** Button click produces no visible response for many seconds; papers remain untagged.

### Pitfall 6: Tags Field Empty for Most Papers

**What goes wrong:** The heatmap's "Tags" axis shows a single "No tags" column for 90% of papers because tags aren't populated by default during paper import.

**Why it happens:** The import pipeline (`import_service.py`) does not auto-extract tags — it only fills `title`, `authors`, `year`, `venue`, `doi`, `arxiv_id`, `abstract`.

**How to avoid:** This is expected behavior. The heatmap must handle the "no tags" case gracefully — either exclude tagless papers from the Tags axis calculation, show a "(no tags)" bucket, or prompt the user to run "Extract keywords" when tags are sparse. The "Extract keywords" button exists precisely for this reason.

**Warning signs:** Heatmap with Tags axis looks mostly empty on first load.

---

## Code Examples

Verified patterns from existing codebase:

### Fetching Project Papers (data source for all visualizations)
```jsx
// Source: frontend/src/pages/ProjectDetail.jsx line 4357
const [linkRecords, papers, websites, repos] = await Promise.all([
  projectPapersApi.list(projectId),
  papersApi.list(libFilter),
  websitesApi.list(libFilter),
  githubReposApi.list(libFilter),
])
// For Review dashboard: use projectPapersApi.list(projectId) to get link records,
// then resolve full paper objects using papersApi.list + join by ID.
// LiteratureTab already does this join — copy that pattern.
```

### D3 Force Simulation Lifecycle (from NoteGraphView)
```jsx
// Source: frontend/src/components/NoteGraphView.jsx lines 370-406
const sim = d3.forceSimulation(nodes)
  .force('link',      d3.forceLink(links).id(d => d.id).distance(100).strength(0.6))
  .force('charge',    d3.forceManyBody().strength(-250))
  .force('center',    d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide(d => nodeRadius(d.degree) + 20))
simRef.current = sim

sim.on('tick', () => {
  linkEls.attr('x1', d => d.source.x) /* ... */
  nodeEls.attr('transform', d => `translate(${d.x},${d.y})`)
})
sim.on('end', fitView)

return () => { sim.stop() }  // cleanup in useEffect return
```

### React State Hover Tooltip Pattern (from NoteGraphView)
```jsx
// Source: frontend/src/components/NoteGraphView.jsx lines 65, 307-309, 483-491
const [hoveredNode, setHoveredNode] = useState(null)
// ... in d3 render:
.on('mouseenter', (_, d) => setHoveredNode(d))
.on('mouseleave', ()     => setHoveredNode(null))
// ... in JSX:
{hoveredNode && (
  <div className="absolute z-50 bg-slate-800 text-white text-[11px] rounded-md px-2 py-1 pointer-events-none"
    style={{ bottom: 12, left: 12 }}>
    {hoveredNode.name}
  </div>
)}
```

### useLocalStorage for Persistent Options (from NoteGraphView)
```jsx
// Source: frontend/src/components/NoteGraphView.jsx lines 66-73
// storagePrefix prevents key collisions between library and project graphs
const [panelOpen, setPanelOpen] = useLocalStorage(`${storagePrefix}panelOpen`, false)
const [visibleTypes, setVisibleTypes] = useLocalStorage(`${storagePrefix}visibleTypes`, {...})
// For Review dashboard, use prefix like 'researchos.review.{projectId}.'
```

### recharts ScatterChart (from recharts v3 API, confirmed installed)
```jsx
// recharts v3.7 — ScatterChart is a first-class chart type
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip,
         ResponsiveContainer, CartesianGrid } from 'recharts'

<ResponsiveContainer width="100%" height={180}>
  <ScatterChart margin={{ top: 8, right: 16, left: -20, bottom: 8 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
    <XAxis dataKey="_x" type="number" name="Year" tickCount={6}
           tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
    <YAxis dataKey="_y" hide />
    <Scatter data={timelineData} fill="#3b82f6" />
  </ScatterChart>
</ResponsiveContainer>
```

### Backend OpenAI JSON-mode Pattern (from note_service.py)
```python
# Source: backend/services/note_service.py — JSON mode pattern (same approach for keyword extraction)
# The keyword extraction endpoint should follow the same pattern as note generation:
# 1. Accept list of {paper_id, abstract} objects
# 2. Call OpenAI with response_format={"type": "json_object"}
# 3. Return {paper_id: [tag1, tag2, ...]} mapping
# 4. Bulk-update papers via paper_service.update_paper()
# 5. Record usage via cost_service.record_openai_usage()
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| recharts v2 API (old prop names) | recharts v3.7 — `ScatterChart`, `Scatter`, same `ResponsiveContainer` wrapper | Package.json shows v3.7 | ScatterChart API is stable; no breaking changes for basic usage |
| d3 v5 (callback-based transitions) | d3 v7.9 (same SVG API, selection API unchanged) | 2021 | No impact — NoteGraphView was built on v7; all patterns here use v7 API |

**Nothing deprecated in this domain for this project's stack.**

---

## Open Questions

1. **How does the project sidebar link to the Review tab?**
   - What we know: The sidebar renders project navigation links. Other tabs (Literature, Experiments, Tasks, Notes) have links in the sidebar.
   - What's unclear: The sidebar code was not read during this research. There may be a `navTabs` array or explicit `Link` components for each tab.
   - Recommendation: Read the sidebar/nav component before Plan 01 to understand where to insert the Review link. This is likely a 2-line change but must be in the plan.

2. **Tags sparsity in real data — does the heatmap have a meaningful fallback?**
   - What we know: The `tags` field defaults to `[]` and is not auto-populated during import.
   - What's unclear: Whether the researcher's existing data has any tags at all.
   - Recommendation: The heatmap must default to a non-Tags axis combination on first render (e.g., Year × Venue, which will always have data). Show a callout when Tags axis is selected but tags are sparse, with a clear prompt to use "Extract keywords."

3. **AI keyword extraction — per-paper call vs. bulk batch?**
   - What we know: The existing AI services (note_service.py, gap_analysis service) call OpenAI once per paper or per project. Bulk processing is done in Python with OpenAI's async client.
   - What's unclear: Whether a single prompt can reliably tag 30-50 papers at once within the context window.
   - Recommendation: Use a single prompt with all abstracts serialized as JSON array. gpt-4o-mini handles 50 abstracts (~50K tokens) within its 128K context window. Fall back to batches of 10 if needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 + @testing-library/react 16.3 |
| Config file | `frontend/vite.config.js` (`test` key, environment: jsdom) |
| Quick run command | `cd frontend && npx vitest run src/pages/ProjectReviewDashboard.test.jsx` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REV-01 | `buildCitationEdges(papers)` returns shared-author and same-venue links with correct types | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | ❌ Wave 0 |
| REV-02 | `getNodeColor(paper, colorBy, scales)` returns correct color for each colorBy mode | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | ❌ Wave 0 |
| REV-03 | `computeTimelinePositions(papers)` assigns unique `_y` per year group with no duplicates | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | ❌ Wave 0 |
| REV-04 | `buildHeatmapMatrix(papers, rowAxis, colAxis)` produces correct count matrix | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | ❌ Wave 0 |
| REV-05 | Backend `extract_keywords` service tags untagged papers and skips already-tagged ones | unit (pytest) | `cd backend && uv run pytest tests/test_keyword_extraction.py -x` | ❌ Wave 0 |
| REV-06 | Review route renders without crash, shows three section headers | smoke | `npx vitest run src/pages/ProjectReviewDashboard.smoke.test.jsx` | ❌ Wave 0 |
| REV-07 | Options popover toggles open/closed on gear button click | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | ❌ Wave 0 |
| REV-08 | Author normalization `normalizeAuthor("Vaswani, Ashish") === normalizeAuthor("Ashish Vaswani")` | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | ❌ Wave 0 |

**Note:** D3 SVG rendering tests (force simulation, zoom/pan) are intentionally excluded — d3 requires a real DOM with layout; jsdom has no layout engine. Test the pure data-processing functions instead (edge building, color selection, position computation, matrix construction).

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/pages/ProjectReviewDashboard.test.jsx`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/ProjectReviewDashboard.test.jsx` — pure unit tests for REV-01 through REV-04, REV-07, REV-08
- [ ] `frontend/src/pages/ProjectReviewDashboard.smoke.test.jsx` — smoke test for REV-06 (route renders)
- [ ] `backend/tests/test_keyword_extraction.py` — unit tests for REV-05

*(No framework install needed — Vitest and pytest already configured)*

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/components/NoteGraphView.jsx` — d3 force graph pattern, zoom/pan, options overlay, hover tooltip, `useLocalStorage` persistence
- `frontend/src/pages/Dashboard.jsx` — recharts AreaChart pattern, Tooltip styling, ResponsiveContainer usage
- `frontend/src/components/NotesCopilotPanel.jsx` — recharts BarChart/LineChart import pattern
- `frontend/src/App.jsx` — exact route structure for adding `/review` tab
- `frontend/src/pages/ProjectDetail.jsx` — tab wrapper export pattern (ProjectLiterature, ProjectExperiments etc.), breadcrumb label map, `useOutletContext`
- `frontend/src/services/api.js` line 356 — `projectPapersApi.list(projectId)` signature
- `frontend/package.json` — confirmed d3 v7.9.0 and recharts v3.7.0 installed
- `backend/models/paper.py` — Paper model fields: `tags: list[str]`, `year: int`, `venue: str`, `authors: list[str]`
- `frontend/vite.config.js` — Vitest configuration (jsdom, setupFiles)

### Secondary (MEDIUM confidence)
- recharts ScatterChart documented in recharts.org official docs — ScatterChart/Scatter/XAxis/YAxis API is stable in v3
- d3 v7 scaleBand, scaleSequential APIs — unchanged from v6, confirmed stable

### Tertiary (LOW confidence)
- Author normalization strategy for cross-paper matching — no single authoritative source; recommendation based on common practice in bibliometric tools

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — d3 and recharts versions confirmed in package.json; NoteGraphView is a working reference implementation
- Architecture: HIGH — route pattern, component export pattern, options overlay pattern all verified in existing code
- Pitfalls: HIGH (author normalization, simulation rebuild) / MEDIUM (heatmap label overflow, extract keywords UX) — derived from reading existing code and known d3/recharts behaviors
- Validation architecture: HIGH — Vitest config verified in vite.config.js; test patterns verified in existing test files

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable libraries; recharts and d3 APIs change rarely)
