---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Paused at checkpoint 07-03 Task 3: human-verify"
last_updated: "2026-03-16T17:07:40.965Z"
last_activity: 2026-03-17 — Completed plan 07-00 (Extract useLocalStorage hook, table view test scaffolds RED phase)
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 24
  completed_plans: 24
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2025-07-17)

**Core value:** A researcher can manage their entire research workflow — from formulating research questions to tracking nested experiments with configurations and metrics — in one place, with their literature library as the shared foundation.
**Current focus:** Phase 1 — Project Foundation

## Current Position

Phase: 7 of 7 (Experiment Table View) — IN PROGRESS
Plan: 0 of 3 plans in Phase 07 complete (07-00 done)
Status: Phase 07 in progress — useLocalStorage extracted, table view test scaffolds created (RED)
Last activity: 2026-03-17 — Completed plan 07-00 (Extract useLocalStorage hook, table view test scaffolds RED phase)

Progress: [████████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 12 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-project-foundation | 1 | 12 min | 12 min |

**Recent Trend:**
- Last 5 plans: 01-01 (12 min)
- Trend: —

*Updated after each plan completion*
| Phase 01-project-foundation P02 | 5 | 2 tasks | 5 files |
| Phase 02-research-questions-literature P02 | 7 | 1 tasks | 1 files |
| Phase 02-research-questions-literature P03 | 6 | 2 tasks | 3 files |
| Phase 02-research-questions-literature P04 | 30 | 2 tasks | 5 files |
| Phase 02-research-questions-literature P05 | 2 min | 1 tasks | 1 files |
| Phase 02-research-questions-literature P06 | 2 min | 1 tasks | 0 files |
| Phase 03-experiment-tree P01 | 8 min | 2 tasks | 8 files |
| Phase 03-experiment-tree P02 | 4 | 1 tasks | 1 files |
| Phase 03-experiment-tree P03 | 10 min | 1 tasks | 1 files |
| Phase 04-experiment-differentiators P01 | 10 min | 2 tasks | 5 files |
| Phase 04-experiment-differentiators P02 | 45 min | 2 tasks | 1 files |
| Phase 05-integration-polish P01 | 10 min | 2 tasks | 4 files |
| Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design P00 | 8 | 2 tasks | 4 files |
| Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design P01 | 20 min | 2 tasks | 6 files |
| Phase 07-experiment-table-view P00 | 3 min | 2 tasks | 3 files |
| Phase 07-experiment-table-view P01 | 8 | 2 tasks | 1 files |
| Phase 07-experiment-table-view P02 | 4 min | 2 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Projects + Experiments first, LaTeX later — need experimental infrastructure before a writing tool
- Experiment tree model (not flat list) — mirrors how papers are structured; parent nodes summarize children
- Reuse existing notes system for project docs — tiptap editor already works well, no second infrastructure
- Projects link to library papers, not duplicate them — single source of truth via join table
- proj_{uuid4.hex[:8]} ID format used for projects, consistent with existing entity conventions
- project_id added to _SOURCE_FIELDS so note reassignment to project nulls other source FK columns
- [Phase 01-project-foundation]: ProjectDetail placed in Layout route (with sidebar) rather than LayoutBare for natural Projects section navigation
- [Phase 01-project-foundation]: Status dropdown uses native select styled as badge pill in project views
- [Phase 01-project-foundation]: Empty state has no CTA button — header button is always present and sufficient; having two identical buttons is confusing UX
- [Phase 01-project-foundation]: Error logging replaces silent catch in ProjectsTree to maintain observability
- [Phase 01-project-foundation]: CustomEvent bus (researchos:projects-changed) chosen over context/prop drilling for sidebar-page decoupling
- [Phase 01-project-foundation]: useCallback wraps fetchProjects in ProjectsTree so event listener references a stable function avoiding stale closures
- [Phase 02-research-questions-literature]: research_questions router uses absolute paths so project-scoped and rq-scoped routes coexist in one router without nested prefix gymnastics
- [Phase 02-research-questions-literature]: project_id from URL path param is authoritative for create_rq — body project_id is overridden to prevent cross-project creation
- [Phase 02-research-questions-literature]: FK join tables use CHECK constraint to enforce exactly-one-of paper_id/website_id pattern with partial unique indexes
- [Phase 02-research-questions-literature]: Children rendered at depth=0 inside RQNode (paddingLeft indentation) rather than recursive depth+1 — avoids compounding padding
- [Phase 02-research-questions-literature]: onRefresh re-fetches full flat RQ list from API after mutations (no optimistic state) — simple and correct for v1
- [Phase 02-research-questions-literature]: rqPapersMap fetched in parallel after loading RQs, stored as Map in RQSection, passed to RQNode — avoids per-node fetching on render
- [Phase 02-research-questions-literature]: LiteratureTab fetches full paper+website lists and joins client-side — correct for small projects, simpler than ID-batched lookup
- [Phase 02-research-questions-literature]: LinkToProjectButton duplicated in Paper.jsx and Website.jsx (not extracted) — both pages are self-contained by convention
- [Phase 02-research-questions-literature]: DnD listeners placed on drag_indicator icon only — click-to-edit on question text and dropdown interactions remain unaffected
- [Phase 02-research-questions-literature]: flattenRqTree produces _parentId metadata for DnD handler to distinguish sibling reorder from cross-parent reparent
- [Phase 02-research-questions-literature]: Childless constraint (cannot reparent if has sub-questions) is a silent abort with console.warn only — no visual error toast for v1 simplicity
- [Phase 02-research-questions-literature]: DnD listeners placed on drag_indicator icon only — click-to-edit and dropdown interactions remain unaffected
- [Phase 02-research-questions-literature]: Childless constraint enforced as silent abort with console.warn only — no visual error toast for v1 simplicity
- [Phase 02-research-questions-literature]: project_id from URL path param is authoritative for RQ creation — body value overridden server-side to prevent cross-project writes
  - [Phase 02-research-questions-literature]: Middle 50% zone heuristic chosen for root-onto-root DnD nesting (center = demote, edges = reorder)
  - [Phase 02-research-questions-literature]: Gap-closure plan 02-06 — implementation verified pre-existing from 02-05; all done criteria confirmed in code
- [Phase 03-experiment-tree]: experiment_id added to note_service._SOURCE_FIELDS so note reassignment to experiment nulls other source FKs (consistent with existing pattern)
- [Phase 03-experiment-tree]: notesApi experiment extensions added inline to existing notesApi object to avoid duplicate export error
- [Phase 03-experiment-tree]: experiment_papers join table uses CHECK constraint enforcing exactly-one-of paper_id/website_id/github_repo_id (same pattern as rq_papers)
- [Phase 03-experiment-tree]: ExperimentNode uses double-click for name editing to avoid conflicts with expand/collapse chevron
- [Phase 03-experiment-tree]: KVEditor sends complete updated dict to onSave (JSONB replace semantics), syncs local rows via useEffect when data prop changes
- [Phase 03-experiment-tree]: Phase 3 Coming Soon placeholder in LeftNav removed; Experiments is now a first-class nav item between Literature and Notes
- [Phase 03-experiment-tree]: aggregateDescendants walks only leaf nodes (no children) to avoid double-counting at intermediate levels
- [Phase 03-experiment-tree]: expPapersMap fetched in batch in ExperimentSection (same pattern as rqPapersMap) — not per-node on render
- [Phase 03-experiment-tree]: Experiment notes panel expands inline with max-h-96 / overflow-auto to keep tree navigable; edit_note button color signals open state
- [Phase 04-experiment-differentiators]: [Phase 04-experiment-differentiators]: xfail marks used for Wave 0 backend stubs so xpass is visible once Plan 01 ships the duplicate endpoint
- [Phase 04-experiment-differentiators]: [Phase 04-experiment-differentiators]: Frontend test helpers inlined in test file to define API contract before Plan 02 extracts them into CompareModal
- [Phase 04-experiment-differentiators]: Leaf duplicate opens pre-filled ExperimentCreateModal (not direct API) so user can rename/tweak config before saving
- [Phase 04-experiment-differentiators]: Parent deep-clone calls API directly and refreshes — no modal since editing entire subtree at once is impractical
- [Phase 04-experiment-differentiators]: parentId prop threaded through ExperimentNode so Duplicate creates a sibling (not a child)
- [Phase 04-experiment-differentiators]: getEffectiveConfig() merges parent config into child at compare time — no DB changes needed, resolved client-side using the flatTree prop passed to CompareModal
- [Phase 04-experiment-differentiators]: Any-node selection (not leaf-only) — parent experiments can be selected alongside leaf experiments for comparison
- [Phase 04-experiment-differentiators]: Config inheritance uses child-wins semantics — explicit child override always beats parent value
- [Phase 05-integration-polish]: experiment_count computed in list_projects via second query (fetch rows, count client-side) — Supabase Python client does not support GROUP BY in select
- [Phase 05-integration-polish]: experiment_count defaults to 0 in Project model so single-project fetches work without a join
- [Phase 05-integration-polish]: libraryId threading to MiniSearchPicker follows exact same pattern as RQSection (prop threaded from section → node → picker)
- [Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design]: detectType reused verbatim from ProjectDetail.jsx — single source of truth for CSV import utilities
- [Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design]: buildImportTree stores group column KVs on BOTH group nodes AND leaf experiments — enables comparison modal without tree traversal
- [Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design]: Path-keyed Map (|col=val string) used for O(1) group node deduplication in buildImportTree
- [Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design]: Single-phase import (no parse-then-confirm roundtrip) — frontend builds tree client-side before POSTing final BFS payload
- [Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design]: BFS flatten at Step 4 call time (not Step 3) so user renames/excludes are applied as the final transformation
- [Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design]: Preview tree fully resets on Back from Step 3 — avoids stale collision/rename/exclude state (research pitfall 2)
- [Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design]: Group tri-state derived entirely from excludedIds set — no separate group state; groupCheckState() computes all/mixed/none on render
- [Phase 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design]: Tri-state checkbox via ref callback sets el.indeterminate directly — React does not support indeterminate as a controlled prop
- [Phase 07-experiment-table-view]: useLocalStorage extracted to hooks/useLocalStorage.js as shared named export; NoteGraphView now imports from there
- [Phase 07-experiment-table-view]: Table view test file imports buildColumns/applyFilter/sortRows from ProjectDetail.jsx in RED state — Plan 01 must export them to turn GREEN
- [Phase 07-experiment-table-view]: applyFilter/sortRows signatures match 07-00 RED test contracts exactly (exp, filter) and (rows, sort) with .columnId field
- [Phase 07-experiment-table-view]: ExperimentTableView select-all uses useRef+useEffect to set el.indeterminate directly — React does not support indeterminate as controlled prop
- [Phase 07-experiment-table-view]: Separate DnD context ID ('column-dnd') for column headers — avoids any collision with tree view's DnD
- [Phase 07-experiment-table-view]: EditableCell calls detectType(draft) on save to preserve numeric/boolean values matching CSV import convention
- [Phase 07-experiment-table-view]: customColumns in colState allows showing user-added columns before any experiment has that key in data
- [Phase 07-experiment-table-view]: formatFilterValue helper renders human-readable chip value labels (array join, between range, empty string for empty/notempty operators)
- [Phase 07-experiment-table-view]: filteredRows replaces sortedRows throughout — select-all, metric highlighting, and new-row creation all work on filtered set
- [Phase 07-experiment-table-view]: Row click toggles detail panel (click same row again to close) to avoid requiring a separate close-only affordance

### Roadmap Evolution

- Phase 6 added: Implement a CSV loading framework to nest into the experimental design
- Phase 7 added: Implement an alternative table view for experiments with spreadsheet-like filters and sorts

### Pending Todos

None yet.

### Blockers/Concerns

- Schema design is the highest-risk decision in Phase 1: config/metrics must be JSONB key-value from day one; research_questions must be a first-class table (not JSONB array); project_papers must be a pure FK join table. Getting these wrong requires rewrites.
- Resolve before Phase 1 plans: whether to include rq-to-experiment FK on experiments in Phase 1 schema (research recommends low-cost inclusion now vs. painful migration later).

## Session Continuity

Last session: 2026-03-16T17:07:15.567Z
Stopped at: Paused at checkpoint 07-03 Task 3: human-verify
