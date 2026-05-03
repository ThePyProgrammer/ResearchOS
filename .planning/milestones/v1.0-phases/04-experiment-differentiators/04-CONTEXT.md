# Phase 4: Experiment Differentiators - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Researchers can compare experiments quantitatively — side-by-side metrics, config diffs, and fast iteration via duplication. This phase adds three features on top of the completed experiment tree: a comparison modal (metrics + config tabs), experiment duplication with deep clone, and the selection/entry-point UX to trigger these actions.

Requirements: EXP-07, EXP-08, EXP-09

</domain>

<decisions>
## Implementation Decisions

### Comparison Modal
- Full-width modal overlay (same pattern as BibTeX export editor modal)
- Combined modal with two tabs: **Metrics** and **Config**
- Select experiments once via checkboxes, switch between tabs inside the modal
- Any leaf experiments across the entire project can be compared (not limited to same parent group)

### Metric Comparison (EXP-07)
- Side-by-side table with experiment names as column headers, metric keys as rows
- Union of all metric keys forms the rows — missing values shown as gray dash (—)
- Best/worst highlighting: user can toggle between "highlight best" (bold green) and "no highlighting"
- "Best" = highest by default, with per-metric toggle for "lower is better" (e.g., loss)
- Non-numeric values show no highlighting

### Config Diff (EXP-08)
- Multi-experiment config table (same column layout as metrics tab — not limited to pairwise)
- Side-by-side columns showing each experiment's config values
- Changed values highlighted in amber, added keys in green, missing keys shown as dash (—)
- "Changed only" filter toggle — default shows all keys, toggle hides rows where all experiments share the same value
- Same union-of-keys approach as metrics tab

### Experiment Duplication (EXP-09)
- Copies name (+ " (copy)") and config key-value pairs
- Metrics are empty (new experiment hasn't run yet), status set to "planned"
- No notes or linked papers copied — those are run-specific
- After duplicate: auto-open the experiment create modal pre-filled with copied config, user can tweak before saving
- **Deep clone available** — duplicating a parent node recursively clones all children (same copy rules: config only, metrics empty, status planned)

### Selection & Entry Points
- Checkboxes on experiment nodes (appear on hover, same pattern as Library multi-select)
- Checkboxes on **all nodes** — checking a parent auto-selects all its leaf descendants, unchecking deselects all
- Floating action bar appears when 2+ leaf experiments are checked: shows "Compare (N)" button that opens the comparison modal
- "Duplicate" action lives in the existing "..." context menu on each experiment node (alongside Add sub-experiment, Delete)
- Parent aggregation "Compare children" shortcut: Claude's discretion

### Claude's Discretion
- Whether to add a "Compare children" button/icon on parent nodes as a shortcut
- Exact floating action bar positioning and styling
- Minimum experiment count for compare (2+) vs diff-specific behavior
- Exact color values for changed/added/missing highlighting in config diff
- Loading states and error handling in comparison modal
- Responsive behavior of the comparison modal with many columns

</decisions>

<specifics>
## Specific Ideas

- Comparison modal should feel like the BibTeX export editor — large, focused, dismissible overlay
- Checkbox pattern should mirror the Library page multi-select (appear on hover, header checkbox behavior)
- Config diff "Changed only" toggle is important when experiments share many baseline config keys and only vary 1-2 parameters
- Deep clone of parent groups enables "repeat this whole sweep with one change" workflow — the pre-filled modal lets user modify the cloned group name before committing

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `KVEditor` in `ProjectDetail.jsx` (line 444): Inline key-value editor — reference for table cell styling in comparison
- `ExperimentNode` / `ExperimentSection` in `ProjectDetail.jsx`: Tree UI with context menu, DnD, status dropdown — add checkboxes and duplicate menu item here
- `aggregateDescendants()`: Already walks leaf nodes to compute metric ranges — similar traversal needed for building comparison data
- `WindowModal` component: Generic modal for comparison overlay
- Library multi-select pattern in `Library.jsx`: Checkbox + floating action bar pattern to replicate
- `experimentStatusConfig` with color mappings: Reuse for status columns in comparison

### Established Patterns
- Context menu (menuRef, menuOpen state, outside-click handler) on ExperimentNode — add "Duplicate" item
- `experimentsApi` in api.js: Add `duplicate(expId)` endpoint
- `ExperimentCreate` model with config/metrics dict fields — backend can accept pre-filled config for duplication
- Parent-child tree traversal via `buildExperimentTree()` — needed for deep clone and "select all children"

### Integration Points
- `ExperimentNode`: Add checkbox, duplicate context menu item
- `ExperimentSection`: Add selection state management, floating action bar, comparison modal
- `experimentsApi`: Add `duplicate(expId, { deep: boolean })` method
- Backend `experiment_service.py`: Add `duplicate_experiment()` function with optional recursive clone
- Backend `experiments` router: Add `POST /api/experiments/{id}/duplicate` endpoint
- New component: `CompareModal.jsx` with Metrics and Config tabs

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-experiment-differentiators*
*Context gathered: 2026-03-15*
