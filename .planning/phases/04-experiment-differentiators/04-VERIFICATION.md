---
phase: 04-experiment-differentiators
verified: 2026-03-16T21:55:00Z
status: human_needed
score: 9/9 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: "Navigate to a project with experiments. Click '...' on a leaf experiment that has config keys, then click 'Duplicate'. Verify the modal opens pre-filled with '[name] (copy)' and the same config key-value pairs. Submit, then verify a new sibling appears with 'planned' status and empty metrics."
    expected: "Leaf duplicate opens ExperimentCreateModal titled 'Duplicate Experiment', pre-filled name and config. After submit, sibling appears with status 'planned' and no metric values."
    why_human: "Pre-fill behavior and form state require rendering the modal and interacting with it — cannot verify from static code alone."
  - test: "Create a parent experiment with 2+ children. Click '...' > 'Duplicate with children'. Verify the entire subtree is cloned (all children appear under the new parent, each with planned status and empty metrics, config preserved)."
    expected: "Deep clone via API produces a full subtree. All child names match originals (no ' (copy)' suffix on children). Configs identical, metrics empty, all planned."
    why_human: "Recursive tree rendering and Supabase insert ordering must be validated against the live app."
  - test: "Hover over experiment nodes to verify checkboxes appear. Select two leaf experiments. Verify the floating action bar appears with 'Compare (2)' button. Click 'Clear' and verify the bar disappears."
    expected: "Checkboxes are opacity-0 on unhovered rows, opacity-100 on hover. Action bar appears at exactly 2+ selected. Clear resets selection to zero."
    why_human: "CSS hover states and conditional rendering depend on live DOM interaction."
  - test: "Select a parent experiment via its checkbox. Verify all its leaf descendants become checked (indeterminate state if only some selected)."
    expected: "Parent checkbox toggles all leaf descendants. Indeterminate icon (indeterminate_check_box) appears when some but not all leaves are selected."
    why_human: "Indeterminate state requires live rendering of Material Symbols icon logic."
  - test: "With 2+ experiments selected and some having overlapping metrics, click 'Compare (N)'. On the Metrics tab: verify experiment names are columns, metric keys are rows, missing values show '---' in gray italic, best values highlighted in emerald green. Toggle 'lower is better' arrow for a metric and verify the highlighted column changes."
    expected: "Table renders correctly. Best value highlight (emerald) shifts when lowerIsBetter is toggled for a metric. Non-numeric metric values get no highlight."
    why_human: "Visual table layout, color classes, and toggle behavior require rendering verification."
  - test: "Switch to Config tab in CompareModal. Verify changed values appear in amber, values present in some experiments but missing in others appear in green, missing values show '---' as gray italic, unchanged values have no highlight. Toggle 'Changed only' and verify uniform rows disappear."
    expected: "Config diff shows amber (changed), green (added/partial), dash (missing), no color (same). 'Changed only' filter correctly hides identical rows."
    why_human: "Color-coded diff table and filter behavior require live rendering."
  - test: "In CompareModal Config tab, compare a child experiment with its parent. Verify the child row shows the parent's config values via config inheritance (getEffectiveConfig). The child's own explicit overrides should take precedence."
    expected: "Child experiments in CompareModal show inherited ancestor config values alongside their own. Child values override parent where both define the same key."
    why_human: "Config inheritance resolution (ancestry chain walk) must be verified against real experiment data with a parent-child config relationship."
---

# Phase 04: Experiment Differentiators — Verification Report

**Phase Goal:** Add experiment duplication and side-by-side comparison so researchers can iterate on configurations and evaluate results across experiment variants.
**Verified:** 2026-03-16T21:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Backend test stubs for EXP-09 exist and are runnable | VERIFIED | `backend/tests/test_experiment_routes.py` — 3 tests, all pass (xfail marks removed after Plan 01) |
| 2 | Frontend compare-modal unit tests exist and pass | VERIFIED | `frontend/src/pages/ProjectDetail.comparemodal.test.jsx` — 18 tests, all pass |
| 3 | User can duplicate a leaf experiment as a new planned sibling with copied config | VERIFIED | `duplicate_experiment()` in `experiment_service.py` (line 122), endpoint at `POST /api/experiments/{exp_id}/duplicate` (router line 80), `ExperimentCreateModal` with `initialName`/`initialConfig` props (jsx line 582), "Duplicate" menu item (jsx line 1780) |
| 4 | User can duplicate a parent experiment and all its children are recursively cloned | VERIFIED | `_deep_clone_children()` in `experiment_service.py` (line 98), `?deep=true` forwarded by router, `handleDuplicateDeep()` calls `experimentsApi.duplicate(id, { deep: true })` (jsx line 1444) |
| 5 | After duplicating a leaf, the create modal opens pre-filled so user can tweak before saving | VERIFIED | `showDuplicateModal` state in `ExperimentNode` (jsx line 1358), `ExperimentCreateModal` receives `initialName={experiment.name + ' (copy)'}` and `initialConfig={experiment.config}` (jsx line 1816+), modal title changes to "Duplicate Experiment" when `initialName` is set |
| 6 | User can select experiment nodes via checkboxes (leaf direct, parent selects leaves) | VERIFIED | `selectedLeafIds` Set state in `ExperimentSection` (jsx line 2123), `handleToggleNode()` (jsx line 2129), `onToggle` prop threaded through `ExperimentNode` hierarchy, checkbox icons rendered using `isSelected`/`anySelected` state (jsx line 1503) |
| 7 | Floating action bar appears when 2+ experiments are selected | VERIFIED | `selectedLeafIds.size >= 2` guard (jsx line 2325), bar renders with "Compare (N)" button and "Clear" link |
| 8 | User can compare metrics side-by-side with best-value highlighting and lower-is-better toggle | VERIFIED | `CompareModal` component at line 1894, `metricCellClass()` at line 1871, `getBestValue()` at line 1886, `lowerIsBetter` state and `toggleLowerIsBetter()`, `arrow_downward`/`arrow_upward` icons, Metrics tab table rendered at line 1981 |
| 9 | User can view config diff (amber=changed, green=added, dash=missing, "Changed only" filter) | VERIFIED | Config tab at line 2040, `configCellClass()` function, `changedOnly` state and filter via `visibleConfigKeys`, `getEffectiveConfig()` at line 1848 for config inheritance |

**Score:** 9/9 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/tests/test_experiment_routes.py` | Test stubs for EXP-09 duplicate endpoint | VERIFIED | Exists, 3 real-assertion tests pass (xfail marks removed), covers shallow, deep, and 404 cases |
| `frontend/src/pages/ProjectDetail.comparemodal.test.jsx` | Test stubs for EXP-07/EXP-08 helper logic | VERIFIED | Exists, 18 tests pass — metricCellClass, configCellClass, unionKeys |
| `backend/services/experiment_service.py` | `duplicate_experiment()` and `_deep_clone_children()` | VERIFIED | Both functions present and substantive (lines 98 and 122); creates DB rows via `create_experiment()`, recursive sort by position |
| `backend/routers/experiments.py` | `POST /api/experiments/{exp_id}/duplicate` | VERIFIED | Route at line 80, status 201, deep param forwarded, 404 on None return |
| `frontend/src/services/api.js` | `experimentsApi.duplicate()` method | VERIFIED | Line 352: `duplicate: (expId, { deep = false } = {}) => apiFetch(...)` |
| `frontend/src/pages/ProjectDetail.jsx` | `CompareModal`, checkbox selection, floating bar, `ExperimentCreateModal` pre-fill | VERIFIED | All components present and substantive: `CompareModal` (line 1894), `selectedLeafIds` state (line 2123), floating bar (line 2325), `initialName`/`initialConfig` props (line 582) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/src/pages/ProjectDetail.jsx` | `/api/experiments/{id}/duplicate` | `experimentsApi.duplicate()` | WIRED | `handleDuplicateDeep()` calls `experimentsApi.duplicate(experiment.id, { deep: true })` (line 1444); leaf path opens modal which calls `experimentsApi.create()` on submit |
| `backend/routers/experiments.py` | `backend/services/experiment_service.py` | `experiment_service.duplicate_experiment()` | WIRED | Router line 83: `result = experiment_service.duplicate_experiment(exp_id, deep=deep)` |
| `ExperimentSection` | `CompareModal` | `selectedLeafIds` state + `compareExperiments` derived array | WIRED | `selectedLeafIds` drives floating bar gate (line 2325); `compareExperiments` derived from `flatTree.filter(e => selectedLeafIds.has(e.id))` (line 2142); `CompareModal` rendered at line 2357 |
| `ExperimentNode` | `ExperimentSection` | `onToggle` prop | WIRED | `handleToggleNode` passed as `onToggle={handleToggleNode}` at line 2300; `ExperimentNode` threads it to children at line 1726 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXP-07 | 04-00, 04-02 | User can compare metrics across multiple leaf experiments side-by-side | SATISFIED | `CompareModal` Metrics tab: union-of-keys rows, experiment columns, best-value highlight with `highlightBest` toggle and per-metric `lowerIsBetter` toggle |
| EXP-08 | 04-00, 04-02 | User can view config diff between two experiments in the same group | SATISFIED | `CompareModal` Config tab: `configCellClass()` applies amber/green/dash per cell, `changedOnly` filter, `getEffectiveConfig()` resolves inheritance |
| EXP-09 | 04-00, 04-01 | User can duplicate an experiment as a new planned sibling with copied config | SATISFIED | `POST /api/experiments/{id}/duplicate` returns 201, `duplicate_experiment()` creates sibling with `status="planned"`, `config=source.config`, `metrics={}`. Deep clone via `?deep=true` recursively clones children via `_deep_clone_children()`. Frontend "Duplicate" menu item opens pre-filled modal; "Duplicate with children" calls API directly. |

No orphaned requirements — all three EXP-07, EXP-08, EXP-09 are claimed by plans and evidenced in code.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `frontend/src/pages/ProjectDetail.jsx` | Chunk size warning from Vite build (1,846 kB) | Info | Does not affect correctness; build succeeds. File is large due to all experiment tree components being co-located inline. |

No blockers. No implementation stubs or empty handlers found in Phase 4 additions.

### Human Verification Required

#### 1. Leaf Duplicate — Pre-filled Modal UX

**Test:** Navigate to a project, click `...` on a leaf experiment with config keys, click "Duplicate". Verify the modal opens titled "Duplicate Experiment" with the name field pre-filled as "[original name] (copy)" and config rows matching the original.
**Expected:** Form is pre-filled. Submitting creates a sibling (same `parentId`) with `status="planned"` and empty metrics. New node appears in tree.
**Why human:** Pre-fill behavior, form field state, and post-submit tree refresh require rendering and interaction.

#### 2. Parent Deep Duplicate — Subtree Clone

**Test:** Create a parent with 2+ children (some with grandchildren). Click `...` > "Duplicate with children". Verify the entire subtree clones — only the root gets " (copy)" suffix; children retain original names.
**Expected:** Full subtree appears. All nodes have `status="planned"`, empty metrics, same configs. Position ordering preserved.
**Why human:** Recursive DB inserts and tree rendering order must be verified against live data.

#### 3. Checkbox Selection — Visibility and State Transitions

**Test:** Hover over experiment rows. Verify checkboxes are hidden until hover. Select one node — verify the bar does NOT appear. Select a second — bar appears with "Compare (2)". Click "Clear" — bar disappears, all checkboxes uncheck.
**Expected:** Hover-reveal opacity behavior, threshold at 2, Clear resets Set to empty.
**Why human:** CSS opacity transitions and threshold state require live DOM interaction.

#### 4. Parent Checkbox — Indeterminate State

**Test:** Click a parent checkbox. Verify all leaf descendants become selected. Deselect one child — verify the parent shows the indeterminate icon (`indeterminate_check_box`).
**Expected:** Parent icon cycles through `check_box_outline_blank` → `check_box` → `indeterminate_check_box` based on descendant selection state.
**Why human:** Icon state logic and Material Symbols rendering depend on live React state.

#### 5. Metrics Tab — Best-Value Highlighting and Lower-Is-Better Toggle

**Test:** Compare 3 experiments each with an `accuracy` metric and a `loss` metric. Toggle "Highlight best" on. Verify the cell with the highest `accuracy` gets emerald highlight. Click the arrow next to `loss` to toggle lower-is-better; verify the cell with the lowest `loss` now gets the emerald highlight.
**Expected:** Highlight shifts correctly based on direction toggle. Non-numeric values receive no highlight.
**Why human:** Color class application and toggle interaction require visual inspection.

#### 6. Config Tab — Diff Highlighting and "Changed Only" Filter

**Test:** Compare experiments where some share identical config keys, some differ, and one is missing a key. Verify identical rows have no color, changed rows are amber, partially-present rows are green, missing values show `---` in gray italic. Toggle "Changed only" and verify all-same rows vanish.
**Expected:** Diff highlighting follows the `configCellClass` contract. "Changed only" filter removes unchanged rows.
**Why human:** Color-coded table diff and filter behavior require visual verification.

#### 7. Config Inheritance in CompareModal

**Test:** Create a parent experiment with `learning_rate=0.001` in its config. Create a child with only `epochs=100` (no `learning_rate`). Compare the child with a sibling. Verify the child row in the Config tab shows `learning_rate=0.001` inherited from the parent.
**Expected:** `getEffectiveConfig()` resolves the ancestry chain. Child's own keys override parent values where both are set.
**Why human:** Inheritance resolution depends on live experiment data stored in DB.

### Gaps Summary

No gaps found. All automated checks pass:

- Backend: `uv run pytest tests/test_experiment_routes.py -x -q` — 3 passed
- Frontend unit tests: `npm run test:run -- src/pages/ProjectDetail.comparemodal.test.jsx` — 18 passed
- Frontend build: `npm run build` — succeeded (chunk size warning only, not an error)
- All 4 key links are wired (router → service, frontend → API, ExperimentSection → CompareModal, ExperimentNode → ExperimentSection)
- All 3 requirements (EXP-07, EXP-08, EXP-09) have concrete implementation evidence

Phase goal is structurally achieved. Awaiting human sign-off on visual UX and interactive behavior (7 test scenarios above).

---

_Verified: 2026-03-16T21:55:00Z_
_Verifier: Claude (gsd-verifier)_
