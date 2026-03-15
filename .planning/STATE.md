---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 02-02-PLAN.md
last_updated: "2026-03-15T08:49:52.505Z"
last_activity: "2026-03-15 — Completed plan 02-01 (research questions backend: migration, models, services, routers, frontend API client)"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 6
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2025-07-17)

**Core value:** A researcher can manage their entire research workflow — from formulating research questions to tracking nested experiments with configurations and metrics — in one place, with their literature library as the shared foundation.
**Current focus:** Phase 1 — Project Foundation

## Current Position

Phase: 2 of 4 (Research Questions & Literature)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-03-15 — Completed plan 02-01 (research questions backend: migration, models, services, routers, frontend API client)

Progress: [█████░░░░░] 50%

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

### Pending Todos

None yet.

### Blockers/Concerns

- Schema design is the highest-risk decision in Phase 1: config/metrics must be JSONB key-value from day one; research_questions must be a first-class table (not JSONB array); project_papers must be a pure FK join table. Getting these wrong requires rewrites.
- Resolve before Phase 1 plans: whether to include rq-to-experiment FK on experiments in Phase 1 schema (research recommends low-cost inclusion now vs. painful migration later).

## Session Continuity

Last session: 2026-03-15T08:49:52.502Z
Stopped at: Completed 02-02-PLAN.md
