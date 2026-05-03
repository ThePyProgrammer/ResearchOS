# Phase 4: Experiment Differentiators - Research

**Researched:** 2026-03-15
**Domain:** React UI patterns — comparison tables, config diffing, tree-node selection, deep clone
**Confidence:** HIGH

## Summary

Phase 4 adds three features on top of the fully-built experiment tree from Phase 3: a comparison modal (metrics + config tabs), experiment duplication with optional deep clone, and the selection UX (checkboxes + floating action bar) to drive them. All implementation is frontend-heavy — the backend only needs one new endpoint (`POST /api/experiments/{id}/duplicate`). The rest is pure React state management and table rendering inside existing component boundaries.

The comparison modal reuses `WindowModal` (already supports fullscreen mode), which is critical for readability when comparing many experiments with many metric/config keys. The selection pattern mirrors Library.jsx's `selectedIds` Set + hover-visible checkboxes. The duplicate endpoint mirrors the existing `create_experiment` service function with a deep-clone variant.

**Primary recommendation:** Build in three self-contained tasks: (1) backend duplicate endpoint, (2) checkbox selection UX + floating action bar, (3) CompareModal with Metrics/Config tabs. Keep ExperimentCreateModal reuse for the duplicate flow by adding `initialConfig` / `initialName` props instead of a separate component.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Comparison Modal**
- Full-width modal overlay (same pattern as BibTeX export editor modal)
- Combined modal with two tabs: Metrics and Config
- Select experiments once via checkboxes, switch between tabs inside the modal
- Any leaf experiments across the entire project can be compared (not limited to same parent group)

**Metric Comparison (EXP-07)**
- Side-by-side table with experiment names as column headers, metric keys as rows
- Union of all metric keys forms the rows — missing values shown as gray dash (—)
- Best/worst highlighting: user can toggle between "highlight best" (bold green) and "no highlighting"
- "Best" = highest by default, with per-metric toggle for "lower is better" (e.g., loss)
- Non-numeric values show no highlighting

**Config Diff (EXP-08)**
- Multi-experiment config table (same column layout as metrics tab — not limited to pairwise)
- Side-by-side columns showing each experiment's config values
- Changed values highlighted in amber, added keys in green, missing keys shown as dash (—)
- "Changed only" filter toggle — default shows all keys, toggle hides rows where all experiments share the same value
- Same union-of-keys approach as metrics tab

**Experiment Duplication (EXP-09)**
- Copies name (+ " (copy)") and config key-value pairs
- Metrics are empty (new experiment hasn't run yet), status set to "planned"
- No notes or linked papers copied — those are run-specific
- After duplicate: auto-open the experiment create modal pre-filled with copied config, user can tweak before saving
- Deep clone available — duplicating a parent node recursively clones all children (same copy rules: config only, metrics empty, status planned)

**Selection & Entry Points**
- Checkboxes on experiment nodes (appear on hover, same pattern as Library multi-select)
- Checkboxes on all nodes — checking a parent auto-selects all its leaf descendants, unchecking deselects all
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXP-07 | User can compare metrics across multiple leaf experiments side-by-side | CompareModal Metrics tab: union-of-keys table, column per experiment, best-value highlighting toggle, per-metric lower-is-better toggle |
| EXP-08 | User can view config diff between two experiments in the same group | CompareModal Config tab: same column layout, amber for changed, green for added, "changed only" filter toggle |
| EXP-09 | User can duplicate an experiment as a new planned sibling with copied config | Backend `POST /api/experiments/{id}/duplicate?deep=false`, frontend opens ExperimentCreateModal pre-filled with cloned config |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.x | Component rendering | Already in use |
| Tailwind CSS 3 | 3.x | Styling | Already in use — all color tokens established |
| WindowModal | local | Full-screen overlay | Already wraps BibtexExportModal; supports minimize/fullscreen |
| FastAPI | 0.x | Backend endpoint for duplicate | Already in use |
| pydantic | 2.x | ExperimentCreate model | Already defined |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dnd-kit/core | ^6.x | DnD in ExperimentSection | Already used — do NOT add new DnD to phase 4 |
| Material Symbols Outlined | CDN | Icons (check_box, indeterminate_check_box, check_box_outline_blank, compare_arrows, content_copy) | Already loaded globally |

**Installation:** No new dependencies required.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── pages/
│   └── ProjectDetail.jsx    # Add: checkbox state, floating bar, duplicate handler
│                             # Add: CompareModal component (can be inline or separate file)
│       └── CompareModal.jsx  # Optional separate file if inline gets too large
└── services/
    └── api.js               # Add: experimentsApi.duplicate()

backend/
├── routers/experiments.py   # Add: POST /api/experiments/{id}/duplicate
└── services/experiment_service.py  # Add: duplicate_experiment(), deep_clone_tree()
```

### Pattern 1: Checkbox Selection State in ExperimentSection
**What:** `selectedLeafIds` Set managed in `ExperimentSection`. Passed down to `ExperimentNode` as `isChecked`, `onToggle`, `onToggleSubtree` props.
**When to use:** State lives at section level (not node level) so the floating action bar and "checked count" are computed once.

```jsx
// In ExperimentSection
const [selectedLeafIds, setSelectedLeafIds] = useState(new Set())

function collectLeafIds(node) {
  if (!node.children || node.children.length === 0) return [node.id]
  return node.children.flatMap(collectLeafIds)
}

function handleToggleNode(exp) {
  const leaves = collectLeafIds(exp)
  setSelectedLeafIds(prev => {
    const next = new Set(prev)
    const allSelected = leaves.every(id => prev.has(id))
    leaves.forEach(id => allSelected ? next.delete(id) : next.add(id))
    return next
  })
}
```

### Pattern 2: Floating Action Bar
**What:** Absolutely or fixed-positioned bar inside ExperimentSection that appears when `selectedLeafIds.size >= 2`.
**When to use:** Mirror Library.jsx's `bg-blue-50 border-b border-blue-200` bar that appears above the table.
**Positioning:** Fixed to bottom of ExperimentSection container (sticky within the section's scroll context), or fixed to bottom of viewport — Claude's discretion.

```jsx
{selectedLeafIds.size >= 2 && (
  <div className="sticky bottom-0 flex items-center gap-3 px-4 py-2 bg-blue-50 border-t border-blue-200 mt-4 rounded-lg">
    <span className="text-xs font-semibold text-blue-700">
      {selectedLeafIds.size} experiments selected
    </span>
    <button
      onClick={() => setCompareOpen(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
    >
      <Icon name="compare_arrows" className="text-[14px]" />
      Compare ({selectedLeafIds.size})
    </button>
    <button
      onClick={() => setSelectedLeafIds(new Set())}
      className="text-xs text-slate-500 hover:text-slate-700 ml-auto"
    >
      Clear
    </button>
  </div>
)}
```

### Pattern 3: CompareModal with Tabs
**What:** Full-screen `WindowModal` wrapping a two-tab interface. Tabs: Metrics, Config.
**When to use:** Opened from floating action bar with the `selectedLeafIds` passed in.

```jsx
// CompareModal receives: experiments (array of leaf Experiment objects), open, onClose
function CompareModal({ experiments, open, onClose }) {
  const [activeTab, setActiveTab] = useState('metrics')
  const [highlightBest, setHighlightBest] = useState(true)
  const [lowerIsBetter, setLowerIsBetter] = useState({}) // metricKey -> boolean
  const [changedOnly, setChangedOnly] = useState(false)

  // Build union of metric keys
  const metricKeys = [...new Set(experiments.flatMap(e => Object.keys(e.metrics || {})))]
  const configKeys = [...new Set(experiments.flatMap(e => Object.keys(e.config || {})))]

  // Filter config keys when changedOnly is true
  const visibleConfigKeys = changedOnly
    ? configKeys.filter(k => {
        const vals = experiments.map(e => String(e.config?.[k] ?? ''))
        return !vals.every(v => v === vals[0])
      })
    : configKeys

  return (
    <WindowModal
      open={open}
      onClose={onClose}
      title={`Compare ${experiments.length} Experiments`}
      iconName="compare_arrows"
      iconWrapClassName="bg-blue-100"
      iconClassName="text-[16px] text-blue-600"
      normalPanelClassName="w-full max-w-5xl rounded-2xl"
      fullscreenPanelClassName="w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] rounded-xl"
    >
      {/* Tab bar + controls */}
      {/* Scrollable comparison table */}
    </WindowModal>
  )
}
```

### Pattern 4: Best-Value Highlighting
**What:** For each metric row, find the best value (max or min based on `lowerIsBetter[key]`), apply `font-bold text-emerald-700 bg-emerald-50` to matching cells.
**Non-numeric:** `typeof v !== 'number'` → no highlighting applied.

```jsx
function getBestValue(key, experiments, lowerIsBetter) {
  const numericVals = experiments
    .map(e => e.metrics?.[key])
    .filter(v => typeof v === 'number')
  if (numericVals.length === 0) return null
  return lowerIsBetter[key] ? Math.min(...numericVals) : Math.max(...numericVals)
}
```

### Pattern 5: Config Change Highlighting
**What:** For each config row, classify each cell: "unchanged" (all experiments share same value), "changed" (differs from majority or reference), "missing" (key absent in this experiment).
**Amber for changed:** `bg-amber-50 text-amber-800`
**Green for added** (key exists in this exp, missing in others): `bg-emerald-50 text-emerald-800`
**Dash for missing:** `text-slate-300 italic` → `—`

```jsx
function classifyConfigCell(key, expValue, allValues) {
  if (expValue === undefined || expValue === null) return 'missing'
  const defined = allValues.filter(v => v !== undefined && v !== null)
  const allSame = defined.every(v => String(v) === String(defined[0]))
  if (allSame) return 'unchanged'
  // Key exists in this experiment but not all others
  const presentCount = allValues.filter(v => v !== undefined && v !== null).length
  if (presentCount < allValues.length) return 'added'
  return 'changed'
}
```

### Pattern 6: Backend Duplicate Endpoint
**What:** `POST /api/experiments/{id}/duplicate` with query param `?deep=false`.
- Shallow: copies the single experiment (name + " (copy)", config, status=planned, metrics={})
- Deep: recursively copies entire subtree; root gets " (copy)" suffix; all children retain original names
- Returns the new root experiment object

```python
# experiment_service.py
def duplicate_experiment(exp_id: str, deep: bool = False) -> Optional[Experiment]:
    source = get_experiment(exp_id)
    if source is None:
        return None
    new_exp = create_experiment(ExperimentCreate(
        project_id=source.project_id,
        parent_id=source.parent_id,
        rq_id=source.rq_id,
        name=source.name + " (copy)",
        status="planned",
        config=source.config,
        metrics={},
    ))
    if deep:
        all_exps = list_experiments(source.project_id)
        _deep_clone_children(source.id, new_exp.id, source.project_id, all_exps)
    return new_exp

def _deep_clone_children(source_parent_id: str, new_parent_id: str, project_id: str, all_exps: list) -> None:
    children = [e for e in all_exps if e.parent_id == source_parent_id]
    for child in children:
        cloned = create_experiment(ExperimentCreate(
            project_id=project_id,
            parent_id=new_parent_id,
            rq_id=child.rq_id,
            name=child.name,
            status="planned",
            config=child.config,
            metrics={},
        ))
        _deep_clone_children(child.id, cloned.id, project_id, all_exps)
```

### Pattern 7: ExperimentCreateModal Pre-fill for Duplication
**What:** Add `initialName` and `initialConfig` props to existing `ExperimentCreateModal`. When set, pre-populate `name` and `configRows` state.
**Critical:** The duplicate flow uses `parentId = source.parent_id` (sibling, not child) when opening the modal for shallow duplication. For deep duplication, the backend handles all creation and the modal is shown only for the root duplicate with its pre-filled config.

```jsx
function ExperimentCreateModal({ projectId, parentId, onCreated, onClose, initialName = '', initialConfig = {} }) {
  const [name, setName] = useState(initialName || '')
  const [configRows, setConfigRows] = useState(() =>
    Object.entries(initialConfig).map(([k, v]) => ({ key: k, value: String(v) }))
  )
  // ...rest unchanged
}
```

### Pattern 8: Duplicate Context Menu Flow (Shallow)
**What:** In the ExperimentNode "..." menu, add a "Duplicate" item. On click: close menu, open ExperimentCreateModal pre-filled with `initialName=experiment.name + " (copy)"`, `initialConfig=experiment.config`, `parentId=experiment.parentId (from parent-aware prop)`.

**Important:** `ExperimentNode` does not currently know its own `parentId`. It must receive this as a prop from its render site (either from `_parentId` on the flat tree node or from the parent rendering it).

```jsx
// ExperimentNode receives parentId prop
function ExperimentNode({ experiment, depth, onRefresh, projectId, parentId = null, ... }) {
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  // In menu:
  <button onClick={() => { setMenuOpen(false); setShowDuplicateModal(true) }}>
    <Icon name="content_copy" className="text-[14px] text-slate-400" />
    Duplicate
  </button>

  // Modal:
  {showDuplicateModal && (
    <ExperimentCreateModal
      projectId={projectId}
      parentId={parentId}
      initialName={experiment.name + ' (copy)'}
      initialConfig={experiment.config || {}}
      onCreated={onRefresh}
      onClose={() => setShowDuplicateModal(false)}
    />
  )}
}
```

### Pattern 9: Deep Duplicate (Parent Nodes)
**What:** For parent nodes, "Duplicate" calls `experimentsApi.duplicate(exp.id, { deep: true })` directly (no pre-fill modal for deep clone, as the user can't meaningfully edit a whole subtree pre-creation). After the API call completes, call `onRefresh()`.

**Distinction:** Leaf nodes → open pre-fill modal (user tweaks before creating). Parent nodes → direct API call, then refresh. Claude may choose to also show a confirmation dialog for deep clone.

### Anti-Patterns to Avoid
- **Storing selected IDs in ExperimentNode local state:** Checkboxes must be controlled by ExperimentSection to enable cross-node "compare" aggregation. Never let each node manage its own selected state independently.
- **Chaining `.select()` after `.eq()` in Supabase:** `SyncFilterRequestBuilder` has no `.select()` — check existence first, then mutate, then re-fetch. (Established pattern in CLAUDE.md.)
- **Re-fetching all experiments inside duplicate service after each child:** Pass `all_exps` into `_deep_clone_children` to avoid N+1 DB calls.
- **Passing `experiment.children` to CompareModal:** CompareModal should receive a flat array of experiment objects from `selectedLeafIds` — do not pass tree nodes.
- **Using `depth` prop for indentation inside ExperimentNode's child recursion:** Current code passes `depth={0}` for all children (flat indentation via `paddingLeft: depth * 24`). The checkbox prop threading must follow the same pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal overlay with minimize/fullscreen | Custom modal from scratch | `WindowModal` component | Already handles minimize-to-dock, fullscreen, Escape key, backdrop |
| "Union of all keys" for table rows | Custom set logic | `[...new Set(experiments.flatMap(...))]` | One-liner; no library needed |
| Numeric best-value detection | Complex NaN handling | `typeof v === 'number'` guard | Metrics are stored via `detectType()` which already converts strings to numbers on save |
| Backend deep clone recursion | Iterative stack-based traversal | Simple recursive function with pre-fetched flat list | Tree depth is bounded (researcher-authored), recursion depth safe |

## Common Pitfalls

### Pitfall 1: `parentId` not available in ExperimentNode
**What goes wrong:** ExperimentNode currently has no `parentId` prop. When "Duplicate" is clicked, the modal needs to open as a sibling (same parent). Without `parentId`, the node can't pass the right `parentId` to ExperimentCreateModal.
**Why it happens:** The node renders its own children recursively — each child is rendered with the parent's `experiment.id` available at the render site but never passed down as a prop.
**How to avoid:** Add `parentId` prop to `ExperimentNode`. In `ExperimentSection`'s top-level map, pass `parentId={null}`. In `ExperimentNode`'s children map, pass `parentId={experiment.id}`.
**Warning signs:** Duplicated experiments always appear at the root level instead of as siblings.

### Pitfall 2: Leaf vs. Parent selection semantics
**What goes wrong:** CompareModal expects leaf experiments (those with `metrics`). If a parent node is directly included in the compare set, its metrics are empty — the table renders with no data and confuses users.
**Why it happens:** The checkbox on a parent selects all descendant leaves, but the parent itself should NOT be in the compare set.
**How to avoid:** `selectedLeafIds` stores only leaf IDs. When a parent checkbox is toggled, `collectLeafIds(node)` walks to actual leaves. `CompareModal` receives only leaf experiment objects.
**Warning signs:** Metric rows all show "—" for an experiment that has children.

### Pitfall 3: Union-of-keys table column overflow
**What goes wrong:** When comparing 8+ experiments, the table becomes too wide to read. Fixed-width columns cause horizontal scroll to be unusable on small screens.
**Why it happens:** No constraint on column count.
**How to avoid:** Wrap the table in `overflow-x-auto`. Use `min-w-[120px]` on columns. The `WindowModal` fullscreen mode is the primary remedy — encourage users to go fullscreen.
**Warning signs:** Horizontal scrollbar appears but rows are not readable.

### Pitfall 4: CompareModal stale data
**What goes wrong:** User opens comparison modal, then edits a metric in a separate panel, then switches back to the modal — stale values.
**Why it happens:** CompareModal receives experiment objects as props at open time; no live subscription.
**How to avoid:** CompareModal reads from the `experiments` prop derived from `flatExperiments` in ExperimentSection. If `flatExperiments` is refreshed, the modal should re-derive its data. Pass the current `flatExperiments` array into CompareModal and filter by `selectedLeafIds` inside the modal.
**Warning signs:** Metric values in comparison modal differ from values shown in the tree.

### Pitfall 5: Deep clone position ordering
**What goes wrong:** Cloned children get `position=0` from `create_experiment`, all appearing at the same position if reordered later.
**Why it happens:** `create_experiment` always sets `position=0`.
**How to avoid:** In `_deep_clone_children`, iterate children in their sorted order (by `position`). Since `create_experiment` always inserts at `position=0`, subsequent reorders will still work correctly via the reorder endpoint. This is acceptable for v1.
**Warning signs:** Deep-cloned subtree has reversed or scrambled order.

## Code Examples

### Collect leaf IDs from any experiment node
```javascript
// Source: derived from aggregateDescendants() in ProjectDetail.jsx (line 89-115)
function collectLeafIds(node) {
  if (!node.children || node.children.length === 0) return [node.id]
  return node.children.flatMap(collectLeafIds)
}
```

### Union of keys for comparison table
```javascript
// Pattern — no external source needed
const metricKeys = [...new Set(experiments.flatMap(e => Object.keys(e.metrics || {})))]
  .sort()  // stable alphabetical order
```

### Best-value cell class
```javascript
// Applied per cell in metrics table
function metricCellClass(key, value, bestValue, highlightBest) {
  if (!highlightBest || typeof value !== 'number' || bestValue === null) return ''
  return value === bestValue ? 'font-bold text-emerald-700 bg-emerald-50' : ''
}
```

### Config cell class
```javascript
// Applied per cell in config diff table
function configCellClass(key, expValue, allValues) {
  if (expValue === undefined || expValue === null) return 'text-slate-300 italic'  // missing
  const definedVals = allValues.filter(v => v !== undefined && v !== null)
  const allSame = definedVals.length > 0 && definedVals.every(v => String(v) === String(definedVals[0]))
  if (allSame) return ''  // unchanged — no highlight
  const presentCount = definedVals.length
  if (presentCount < allValues.length) return 'bg-emerald-50 text-emerald-800'  // added (present in some, absent in others)
  return 'bg-amber-50 text-amber-800'  // changed
}
```

### Backend duplicate endpoint
```python
# Source: pattern derived from existing create_experiment in experiment_service.py
@router.post("/api/experiments/{exp_id}/duplicate", status_code=201)
async def duplicate_experiment(exp_id: str, deep: bool = False):
    result = experiment_service.duplicate_experiment(exp_id, deep=deep)
    if result is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(result.model_dump(by_alias=True), status_code=201)
```

### experimentsApi.duplicate
```javascript
// Source: extends existing experimentsApi in api.js (line 346-355)
duplicate: (expId, { deep = false } = {}) =>
  apiFetch(`/experiments/${expId}/duplicate?deep=${deep}`, { method: 'POST' }),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate modals per action | Combined tabs in one modal | Phase 4 design | User selects once, switches tabs — better flow |
| No multi-select in experiment tree | Library.jsx pattern adapted | Phase 4 | Checkbox + floating bar; proven pattern |

## Open Questions

1. **"Compare children" shortcut button on parent nodes**
   - What we know: Locked as Claude's discretion
   - What's unclear: Whether the UX benefit justifies additional code path
   - Recommendation: Add a small `compare` icon button (opacity-0 group-hover) on parent nodes that collects all leaf descendants and opens CompareModal. Low code cost; high discoverability value.

2. **Floating action bar position — sticky vs fixed**
   - What we know: ExperimentSection renders inside a tab panel inside ProjectDetail; the outer container has its own scroll
   - What's unclear: Whether `sticky bottom-0` will work inside the scrolling container or needs `fixed bottom-4 left-0 right-0`
   - Recommendation: Use `sticky bottom-0` with `bg-blue-50 border-t` inside ExperimentSection's wrapper div. If that fails in practice, fall back to a fixed bar like the Library page uses.

3. **Shallow duplicate modal vs direct API call**
   - What we know: CONTEXT.md says "auto-open the experiment create modal pre-filled with copied config" after duplicate
   - What's unclear: Whether this means the modal IS the creation mechanism (no backend duplicate for shallow), or open modal AFTER backend creates
   - Recommendation: For shallow duplication of leaf experiments, open the pre-filled `ExperimentCreateModal` directly without calling the backend first — the user's submit action creates the experiment. For parent deep clones, call the backend API directly since there's no reasonable pre-fill for a whole subtree.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (backend), vitest 2.x (frontend) |
| Config file | backend/pyproject.toml (pytest config), frontend/vite.config.js (test section) |
| Quick run command | `cd backend && uv run pytest tests/test_projects_routes.py -x -q` (backend) or `cd frontend && npm run test:run -- --reporter=dot` (frontend) |
| Full suite command | `cd backend && uv run pytest tests/ -q` and `cd frontend && npm run test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-07 | CompareModal renders metric rows as union of keys; missing values shown as dash; best-value cell gets correct CSS class | unit (frontend) | `cd frontend && npm run test:run -- src/pages/ProjectDetail.comparemodal.test.jsx` | ❌ Wave 0 |
| EXP-07 | Best-value highlighting toggle changes cell classes | unit (frontend) | same file | ❌ Wave 0 |
| EXP-08 | Config diff: changed cells get amber class, missing get dash, "changed only" filter hides uniform rows | unit (frontend) | same file | ❌ Wave 0 |
| EXP-09 | `POST /api/experiments/{id}/duplicate` returns 201 with cloned name, empty metrics, planned status | unit (backend) | `cd backend && uv run pytest tests/test_experiment_routes.py -x -q` | ❌ Wave 0 |
| EXP-09 | Deep duplicate with `?deep=true` creates root + all children recursively | unit (backend) | same file | ❌ Wave 0 |
| EXP-09 | Duplicate of non-existent experiment returns 404 | unit (backend) | same file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/ -q` and `cd frontend && npm run test:run`
- **Per wave merge:** Full suite for both backend and frontend
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/ProjectDetail.comparemodal.test.jsx` — covers EXP-07, EXP-08 (pure logic unit tests for `metricCellClass`, `configCellClass`, union-of-keys helpers)
- [ ] `backend/tests/test_experiment_routes.py` — covers EXP-09 (duplicate endpoint route tests using monkeypatch pattern from test_projects_routes.py)

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `frontend/src/pages/ProjectDetail.jsx` — ExperimentNode (line 1349), ExperimentSection (line 1755), KVEditor (line 444), aggregateDescendants (line 89), buildExperimentTree (line 63)
- Direct code inspection: `frontend/src/components/WindowModal.jsx` — props interface for modal composition
- Direct code inspection: `frontend/src/pages/Library.jsx` — selectedIds Set pattern, floating action bar (line 2044)
- Direct code inspection: `backend/services/experiment_service.py` — create_experiment, list_experiments patterns
- Direct code inspection: `backend/models/experiment.py` — ExperimentCreate, Experiment fields
- Direct code inspection: `frontend/src/services/api.js` — experimentsApi (line 346)
- Direct code inspection: `backend/tests/test_projects_routes.py` — route test pattern with monkeypatch

### Secondary (MEDIUM confidence)
- CONTEXT.md design decisions — all locked choices verified against existing code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — all patterns derived from direct code inspection of existing implementations
- Pitfalls: HIGH — parentId gap verified by reading ExperimentNode signature; leaf-vs-parent distinction verified by reading aggregateDescendants and the selection design
- Test patterns: HIGH — existing test files confirm pytest + vitest patterns

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable codebase; no external dependencies)
