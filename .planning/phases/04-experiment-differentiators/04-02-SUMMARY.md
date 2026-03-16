---
phase: 04-experiment-differentiators
plan: 02
subsystem: ui
tags: [react, comparison, checkbox-selection, modal, metrics, config-diff]

# Dependency graph
requires:
  - phase: 04-experiment-differentiators/04-00
    provides: comparemodal test scaffolds (ProjectDetail.comparemodal.test.jsx) with metricCellClass / configCellClass contracts
  - phase: 04-experiment-differentiators/04-01
    provides: ExperimentNode parentId prop, experimentsApi.duplicate(), ExperimentCreateModal with initialName/initialConfig

provides:
  - Checkbox selection on every ExperimentNode (leaf + parent) with hover-show / always-show-when-any-selected logic
  - collectLeafIds() helper for parent → leaf descendant traversal
  - Floating action bar that appears when 2+ leaf experiments are selected
  - CompareModal with Metrics tab (union-of-keys, best-value highlighting, per-metric lower-is-better toggle)
  - CompareModal with Config tab (amber=changed, green=added, dash=missing, "Changed only" filter)
  - getEffectiveConfig() helper that merges parent config down the ancestry chain for inherited values
  - Any-node selection (not leaf-only) so parent experiments can be directly compared with children
  - flatTree prop on CompareModal for config inheritance resolution at compare time

affects: [future comparison features, experiment analytics, phase-05-anything-using-compare]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Checkbox selection with indeterminate parent state — leaf/all/some detection via collectLeafIds + Set operations"
    - "Config inheritance — getEffectiveConfig() walks ancestry chain merging parent config into child, child values win"
    - "Floating action bar — sticky bottom bar inside ExperimentSection, visible when selectedLeafIds.size >= 2"
    - "CompareModal tab pattern — activeTab state, table with sticky left column, overflow-x-auto for wide tables"
    - "Best-value highlighting — per-metric lowerIsBetter toggle, getBestValue helper, emerald highlight for winner"
    - "Config diff — amber=changed, green=added/present-in-some, no-highlight=same-in-all, dash=missing"

key-files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "getEffectiveConfig() merges parent config into child at compare time — no DB changes needed, resolved client-side"
  - "Any-node selection (not leaf-only) — researchers need to compare parent experiments directly with their children"
  - "flatTree prop passed to CompareModal so it can resolve ancestry chains for inherited config values"
  - "Config inheritance uses child-wins semantics — explicit child override always beats parent value"

patterns-established:
  - "Config inheritance pattern: getEffectiveConfig(exp, flatTree) walks parentId chain and merges ancestor configs (ancestor first, child wins)"
  - "Parent checkbox state derived from collectLeafIds + Set.has() — allChecked/someChecked/noneChecked"

requirements-completed: [EXP-07, EXP-08]

# Metrics
duration: ~45min
completed: 2026-03-16
---

# Phase 04 Plan 02: Experiment Comparison (Checkbox Selection + CompareModal) Summary

**Checkbox selection on experiment tree nodes with floating action bar and side-by-side CompareModal (Metrics + Config tabs) including config inheritance via getEffectiveConfig()**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-16T12:10:00Z
- **Completed:** 2026-03-16T13:44:00Z
- **Tasks:** 2 (1 implementation + 1 human-verify checkpoint)
- **Files modified:** 1

## Accomplishments

- Checkbox selection UI on all experiment nodes: leaf clicks toggle single node, parent clicks toggle all leaf descendants; indeterminate state when partially selected
- Floating action bar appears at 2+ selected experiments with "Compare (N)" button and "Clear" link
- CompareModal Metrics tab: union-of-keys rows, experiment name columns, missing values as `---`, best-value highlight (emerald) with per-metric lower-is-better toggle
- CompareModal Config tab: change highlighting (amber=changed, green=added, dash=missing), "Changed only" filter hides unchanged rows
- Config inheritance fix (post-checkpoint): getEffectiveConfig() merges ancestor configs down the chain so child experiments inherit parent learning_rate etc. in the compare view
- Any-node selection fix (post-checkpoint): parent experiments can now be selected alongside leaf experiments for comparison

## Task Commits

Each task was committed atomically:

1. **Task 1: Checkbox selection, floating action bar, CompareModal** - `72934b2` (feat)
2. **Fix: Config inheritance + parent selection (post-verify)** - `0d75977` (fix)

## Files Created/Modified

- `frontend/src/pages/ProjectDetail.jsx` — Added collectLeafIds(), handleToggleNode(), selectedLeafIds state, checkbox rendering in ExperimentNode, floating action bar in ExperimentSection, CompareModal component (Metrics + Config tabs), getEffectiveConfig() helper, flatTree prop wiring

## Decisions Made

- getEffectiveConfig() merges parent config into child at compare time — no DB changes needed, resolved client-side using the flatTree prop passed to CompareModal
- Any-node selection (not leaf-only) — researchers need to compare parent experiments directly with their children, leaf-only was too restrictive
- flatTree prop passed to CompareModal so it can resolve ancestry chains for inherited config values without additional API calls
- Config inheritance uses child-wins semantics — explicit child override always beats parent value, same semantics as CSS cascade

## Deviations from Plan

### Auto-fixed Issues (post human-verify)

**1. [Rule 1 - Bug] Config inheritance values not cascading to children in compare view**
- **Found during:** Task 2 (human-verify checkpoint)
- **Issue:** Parent config values (e.g., learning_rate) were not visible in child experiment rows in the compare view — only explicitly set child values appeared
- **Fix:** Added getEffectiveConfig() helper that walks the parentId ancestry chain and merges ancestor configs; CompareModal now accepts flatTree prop; comparison uses getEffectiveConfig() per experiment
- **Files modified:** frontend/src/pages/ProjectDetail.jsx
- **Verification:** User verified cascaded values appear correctly in Config tab
- **Committed in:** 0d75977

**2. [Rule 1 - Bug] Parent experiments could not be selected for comparison**
- **Found during:** Task 2 (human-verify checkpoint)
- **Issue:** Selection was leaf-only, blocking researchers from comparing a parent experiment with its children directly
- **Fix:** Changed selection logic from leaf-only to any-node — clicking a parent either selects the parent itself or its leaf descendants depending on whether it has children
- **Files modified:** frontend/src/pages/ProjectDetail.jsx
- **Verification:** User verified parent nodes can be checked and appear in CompareModal
- **Committed in:** 0d75977

---

**Total deviations:** 2 auto-fixed post human-verify (both Rule 1 - Bug)
**Impact on plan:** Both fixes were necessary for correct UX. Config inheritance is core to the experiment tree mental model. No scope creep.

## Issues Encountered

Two issues surfaced during human-verify checkpoint:
1. Config inheritance not cascading — fixed by adding getEffectiveConfig() client-side ancestry walk
2. Leaf-only selection too restrictive — fixed by allowing any-node selection

Both were resolved in a single commit (0d75977) and the user approved the feature.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 is now complete: experiment tree, duplication, and comparison all ship together
- CompareModal patterns (tab chrome, sticky-column table, best-value highlight) available for reuse in any future comparison views
- getEffectiveConfig() pattern available for any feature that needs inherited config resolution
- EXP-07 (comparison table) and EXP-08 (config diff) requirements satisfied

---
*Phase: 04-experiment-differentiators*
*Completed: 2026-03-16*
