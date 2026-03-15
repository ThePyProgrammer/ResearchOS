---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Paused at checkpoint Task 2 in Phase 03-03 (human verification of full experiment tree end-to-end)"
last_updated: "2026-03-15T15:10:00.000Z"
last_activity: 2026-03-15 — Completed plan 03-03 Task 1 (parent aggregation, experiment notes, literature linking)
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 13
  completed_plans: 12
  percent: 66
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2025-07-17)

**Core value:** A researcher can manage their entire research workflow — from formulating research questions to tracking nested experiments with configurations and metrics — in one place, with their literature library as the shared foundation.
**Current focus:** Phase 1 — Project Foundation

## Current Position

Phase: 3 of 4 (Experiment Tree)
Plan: 1 of ? in current phase
Status: Phase 03 in progress — plan 03-03 Task 1 delivered; awaiting human verification checkpoint (Task 2)
Last activity: 2026-03-15 — Completed plan 03-03 Task 1 (parent aggregation summaries, experiment notes, literature linking)

Progress: [██████░░░░] 66%

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

### Pending Todos

None yet.

### Blockers/Concerns

- Schema design is the highest-risk decision in Phase 1: config/metrics must be JSONB key-value from day one; research_questions must be a first-class table (not JSONB array); project_papers must be a pure FK join table. Getting these wrong requires rewrites.
- Resolve before Phase 1 plans: whether to include rq-to-experiment FK on experiments in Phase 1 schema (research recommends low-cost inclusion now vs. painful migration later).

## Session Continuity

Last session: 2026-03-15T14:47:07.046Z
Stopped at: Completed Phase 03-02 (experiment tree UI: ExperimentSection, ExperimentNode, KVEditor, DnD, modal)
