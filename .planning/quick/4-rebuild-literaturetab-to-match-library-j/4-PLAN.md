---
phase: quick
plan: 4
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/ProjectDetail.jsx
autonomous: true
requirements: ["Rebuild LiteratureTab to match Library.jsx UI"]
must_haves:
  truths:
    - "Literature table shows sortable columns: Status, Title, Authors, Date, Venue with sort indicators"
    - "Checkbox multi-select works with select-all header checkbox (indeterminate state)"
    - "Clicking a row opens a detail slide-over panel on the right (PaperDetail/WebsiteDetail/GitHubRepoDetail)"
    - "SearchPicker remains at top for linking new items"
    - "Unlink button available per-row and as bulk action for selected items"
    - "Data source remains project_papers join table, not full library"
  artifacts:
    - path: "frontend/src/pages/ProjectDetail.jsx"
      provides: "Rebuilt LiteratureTab matching Library.jsx patterns"
  key_links:
    - from: "LiteratureTab"
      to: "PaperRow component pattern"
      via: "Same row rendering with checkbox, status badge, title, authors, date, venue"
    - from: "LiteratureTab"
      to: "Detail panels"
      via: "selectedItem state drives PaperDetail/WebsiteDetail/GitHubRepoDetail rendering"
---

<objective>
Rebuild the LiteratureTab component in ProjectDetail.jsx to match the Library.jsx page UI. Replace the simple 3-column table (Title/Type/Added) with the full Library-style table: sortable columns (Status, Title, Authors, Date, Venue), checkbox multi-select with select-all, status badges, row hover/selection styling, and a detail slide-over panel when clicking a row. Keep the existing SearchPicker for linking new items and the project_papers data source.

Purpose: Consistent UX between main Library and project Literature views.
Output: Updated LiteratureTab in ProjectDetail.jsx.
</objective>

<execution_context>
@C:/Users/prann/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/prann/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/pages/Library.jsx (reference UI — PaperRow, sortable headers, detail panels, toggleSort, toggleCheck, toggleSelectAll, filtered/sorted logic)
@frontend/src/pages/ProjectDetail.jsx (current LiteratureTab at line ~4127, ProjectLiterature wrapper at ~4447)

<interfaces>
<!-- From Library.jsx — key patterns to replicate -->

Sorting state + toggle (lines 1436-1741):
```javascript
const [sortKey, setSortKey] = useState('date')   // 'title' | 'date' | 'authors' | 'status' | null
const [sortDir, setSortDir] = useState('asc')     // 'asc' | 'desc'

function toggleSort(key) {
  if (sortKey === key) {
    if (sortDir === 'asc') setSortDir('desc')
    else { setSortKey(null); setSortDir('asc') }
  } else {
    setSortKey(key); setSortDir('asc')
  }
}
```

Multi-select (lines 1338, 1522-1535):
```javascript
const [selectedIds, setSelectedIds] = useState(new Set())
const toggleCheck = (item) => {
  setSelectedIds(prev => { const next = new Set(prev); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })
}
const toggleSelectAll = () => {
  if (selectedIds.size === filtered.length) setSelectedIds(new Set())
  else setSelectedIds(new Set(filtered.map(i => i.id)))
}
```

Sort comparator (lines 1694-1716):
```javascript
if (sortKey === 'title') return dir * a.title.localeCompare(b.title)
if (sortKey === 'date') { /* publishedDate comparison with null handling */ }
if (sortKey === 'authors') return dir * formatAuthors(a.authors).localeCompare(formatAuthors(b.authors))
if (sortKey === 'status') { const order = ['inbox','to-read','read']; return dir * (order.indexOf(a.status) - order.indexOf(b.status)) }
```

Column header pattern (line 2153):
```html
<th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 transition-colors" onClick={() => toggleSort('status')}>
  <span className="flex items-center gap-1">Status {sortKey === 'status' && <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-600" />}</span>
</th>
```

PaperRow component (line 46) — already defined at top of Library.jsx, can be imported or replicated inline.

Detail panel layout (line 1764):
```html
<div className="flex h-full" ref={containerRef}>
  <div className="flex-1 flex flex-col min-w-0">/* table */</div>
  {selectedItem && <div onMouseDown={onDetailDrag} className="w-1 flex-shrink-0 bg-slate-200 hover:bg-blue-400 ..." />}
  {selectedItem && selectedItem.itemType === 'website' && <WebsiteDetail ... />}
  {selectedItem && selectedItem.itemType === 'github_repo' && <GitHubRepoDetail ... />}
  {selectedItem && selectedItem.itemType !== 'website' && selectedItem.itemType !== 'github_repo' && <PaperDetail ... />}
</div>
```

Helper functions already in Library.jsx scope (lines 16-44):
- `formatAuthors(authors)` — "LastName et al." format
- `itemYear(item)` — extracts year from publishedDate
- `itemVenue(item)` — hostname for websites, owner/repo for GitHub, venue for papers
- `statusConfig` — imported from PaperInfoPanel

Detail panel components defined locally in Library.jsx:
- `PaperDetail` (line 227) — props: paper, onClose, onStatusChange, onPaperUpdate, onDelete, width, allTags
- `WebsiteDetail` (line 661) — props: item, onClose, onStatusChange, onUpdate, onDelete, width
- `GitHubRepoDetail` (line 998) — props: item, onClose, onStatusChange, onUpdate, onDelete, width
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebuild LiteratureTab with Library.jsx table patterns and detail panel</name>
  <files>frontend/src/pages/ProjectDetail.jsx</files>
  <action>
Replace the entire `LiteratureTab` function (lines ~4127-4277) and update the `ProjectLiterature` wrapper (lines ~4447-4454). The data fetching logic (fetchAll, links, paperLookup, websiteLookup, repoLookup) stays but the resolved items are transformed into a flat array matching Library.jsx's item shape, and the table/UI is rebuilt.

**1. Transform link data into Library-style items array:**

After fetchAll resolves, build a flat `items` array from links by resolving each link to its paper/website/repo object and adding `itemType` field:
```javascript
const items = useMemo(() => links.map(link => {
  if (link.paperId && paperLookup[link.paperId]) return { ...paperLookup[link.paperId], itemType: 'paper', _linkId: link.id }
  if (link.githubRepoId && repoLookup[link.githubRepoId]) return { ...repoLookup[link.githubRepoId], itemType: 'github_repo', _linkId: link.id }
  if (link.websiteId && websiteLookup[link.websiteId]) return { ...websiteLookup[link.websiteId], itemType: 'website', _linkId: link.id }
  return null
}).filter(Boolean), [links, paperLookup, websiteLookup, repoLookup])
```

**2. Add sorting, selection, and detail panel state:**
- `sortKey` / `sortDir` / `toggleSort` — copy exact pattern from Library.jsx
- `selectedIds` / `toggleCheck` / `toggleSelectAll` — copy exact pattern
- `selectedItem` / `setSelectedItem` — for detail panel
- `searchFilter` local state for a simple text search input filtering by title

**3. Add `filtered` useMemo:**
Filter `items` by `searchFilter` (case-insensitive title match), then sort using the same comparator from Library.jsx. Add helper functions `formatAuthors`, `itemYear`, `itemVenue` locally (copy from Library.jsx lines 16-44 — they are not exported).

**4. Replace the table JSX with Library-style table:**

The table must have these columns: checkbox (select-all header), Status, Title, Authors, Date, Venue, and an Unlink button column.

- **Select-all checkbox** in header with indeterminate state (ref callback pattern from Library.jsx line 2149)
- **Sortable column headers** for Status, Title, Authors, Date using the `toggleSort` + sort indicator icon pattern
- **Row rendering** — for each item in `filtered`, render a `<tr>` with:
  - Checkbox (onClick stops propagation, onChange calls toggleCheck)
  - Status badge using `statusConfig` from PaperInfoPanel import (already imported at top of file — verify, add if missing)
  - Title with type badge (Website/GitHub) — line-clamp-1
  - Authors via `formatAuthors(item.authors)`
  - Date via `itemYear(item)`
  - Venue via `itemVenue(item)` — line-clamp-1
  - Unlink button (link_off icon, calls handleUnlink with item._linkId)
- **Row click** → `setSelectedItem(selectedItem?.id === item.id ? null : item)` (toggle)
- **Row styling** — `selected ? 'bg-blue-50' : checked ? 'bg-blue-50/50' : 'hover:bg-slate-50'`

**5. Add search input above table:**
A simple text input with search icon (not the SearchPicker), styled like:
```html
<div className="relative">
  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
  <input type="text" placeholder="Filter literature..." value={searchFilter} onChange={...}
    className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
</div>
```

**6. Add bulk action bar:**
When `selectedIds.size > 0`, show a bar with:
- Count label: "{N} selected"
- "Unlink Selected" button (red, calls handleBulkUnlink which iterates selectedIds, finds _linkId from items, calls projectPapersApi.unlink for each, then re-fetches)
- Clear selection (X) button

**7. Add detail panel:**
Define simplified versions of PaperDetail, WebsiteDetail, GitHubRepoDetail locally within LiteratureTab (or a single `LitDetailPanel` component) that shows:
- Close button (X)
- Title (bold)
- Status badge
- Authors
- Abstract (truncated)
- Date / Venue
- "Open in Library" link (navigates to `/library/paper/{id}` or `/library/website/{id}`)
- Unlink button

Keep it simple — do NOT replicate the full Library detail panels with tabs, related papers, notes generation, etc. This is a lightweight preview.

**8. Update the outer layout:**
The `LiteratureTab` return should be a flex container like Library.jsx:
```html
<div className="flex h-full">
  <div className="flex-1 flex flex-col min-w-0">
    {/* SearchPicker + search filter + bulk bar + table */}
  </div>
  {selectedItem && <div className="w-px bg-slate-200" />}
  {selectedItem && <LitDetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} onUnlink={...} />}
</div>
```

**9. Update `ProjectLiterature` wrapper:**
Change from `<div className="h-full overflow-auto">` to `<div className="h-full overflow-hidden">` so the inner flex layout controls its own scrolling. The table area gets `overflow-y-auto` on just the tbody container.

**10. Import statusConfig:**
Verify `statusConfig` is imported from PaperInfoPanel at the top of ProjectDetail.jsx. If not, add it to the existing import. Check if there is already an import from PaperInfoPanel — if yes, add `statusConfig` to it; if not, add `import { statusConfig } from '../components/PaperInfoPanel'`.

**What NOT to do:**
- Do NOT create a new file — everything stays in ProjectDetail.jsx
- Do NOT remove the SearchPicker — keep it at the top of the literature section
- Do NOT change the data source — still fetch via projectPapersApi.list + paper/website/repo lookups
- Do NOT add the full Library.jsx filter panel (status tabs, source filter, year range, tags) — only a simple text search filter
- Do NOT add drag-to-resize on the detail panel — use a fixed width (320px)
- Do NOT add keyboard navigation (j/k/Enter/Escape) — keep it simple
  </action>
  <verify>
    <automated>cd C:/Users/prann/projects/researchos/frontend && npx vite build --mode development 2>&1 | tail -5</automated>
  </verify>
  <done>
    - LiteratureTab renders a Library-style table with columns: checkbox, Status, Title, Authors, Date, Venue, Unlink
    - Column headers for Status/Title/Authors/Date are clickable and toggle sort direction with arrow indicators
    - Header checkbox toggles select-all with indeterminate state
    - Row checkboxes toggle individual selection independently from detail panel selection
    - Clicking a row opens a lightweight detail panel on the right showing title, status, authors, abstract, date/venue, and "Open in Library" link
    - Clicking the same row again closes the detail panel
    - Text search input filters items by title
    - Bulk action bar appears when items are selected with "Unlink Selected" and clear buttons
    - SearchPicker remains at top for linking new papers/websites/repos
    - Data still sourced from project_papers join table
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Rebuilt LiteratureTab matching Library.jsx UI with sortable columns, checkbox multi-select, detail panel, and search filter</what-built>
  <how-to-verify>
    1. Navigate to a project that has linked literature items (papers, websites, or GitHub repos)
    2. Verify the table shows columns: checkbox, Status, Title, Authors, Date, Venue, Unlink
    3. Click column headers (Status, Title, Authors, Date) — verify sort toggles with arrow indicators
    4. Click row checkboxes — verify multi-select works, header checkbox shows indeterminate when partial
    5. Click a row — verify detail panel slides in from the right showing item info
    6. Click same row again — verify panel closes
    7. Select multiple items — verify bulk action bar with "Unlink Selected" appears
    8. Use the text filter input — verify items filter by title
    9. Verify SearchPicker at top still works to link new items
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- Vite build succeeds without errors
- LiteratureTab visually matches Library.jsx table style (sortable headers, status badges, row hover states, checkboxes)
- Detail panel renders on row click and closes on re-click or close button
- Bulk unlink works for selected items
</verification>

<success_criteria>
- LiteratureTab is visually consistent with Library.jsx table
- Sort, select, search, detail panel, and bulk unlink all functional
- No regressions to other ProjectDetail tabs (Overview, Experiments, Notes)
</success_criteria>

<output>
After completion, create `.planning/quick/4-rebuild-literaturetab-to-match-library-j/4-SUMMARY.md`
</output>
