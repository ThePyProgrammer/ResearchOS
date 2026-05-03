---
phase: 11-ai-experiment-gap-analysis
plan: 01
subsystem: api
tags: [pydantic-ai, fastapi, openai, gap-analysis, experiments]

requires:
  - phase: 03-experiment-tree
    provides: experiment_service.list_experiments, Experiment model
  - phase: 02-research-questions-literature
    provides: project_papers_service.list_project_papers, ProjectPaper model
  - phase: 01-project-foundation
    provides: project_service.get_project, Project model

provides:
  - GapSuggestion, PaperRef, GapAnalysisOutput, GapAnalysisRequest Pydantic models
  - gap_analyzer.py: run_gap_analysis async function with tree and paper serialization
  - POST /api/projects/{project_id}/gap-analysis endpoint
  - Full TDD test coverage (model + route level)

affects:
  - 11-ai-experiment-gap-analysis (plan 02 — frontend planning board)

tech-stack:
  added: []
  patterns:
    - pydantic-ai Agent with structured output_type (GapAnalysisOutput) and defer_model_check=True
    - Tree serialization: compact text with depth-computed indentation, 80-exp cap, 6-KV config, 4-KV metrics
    - Paper context serialization: author-year-title-abstract format, 20-paper cap, 300-char abstract truncation
    - RunCostTracker + record_openai_usage for cost accounting on gap analysis runs
    - AsyncMock pattern for testing async agent calls in route tests

key-files:
  created:
    - backend/models/gap_suggestion.py
    - backend/agents/gap_analyzer.py
    - backend/routers/gap_analysis.py
    - backend/tests/test_gap_suggestion_model.py
    - backend/tests/test_gap_analysis_routes.py
  modified:
    - backend/app.py

key-decisions:
  - "GapSuggestion.id auto-generates as gap_{uuid.hex[:8]} — consistent with proj_, exp_ ID format"
  - "GapAnalysisOutput uses plain BaseModel (not CamelModel) since it is agent output only, not a JSON response model"
  - "run_gap_analysis accepts dismissed_ids as keyword arg — router forwards them from GapAnalysisRequest"
  - "Token budget managed via _serialize_tree(max_experiments=80) and _serialize_papers(max_papers=20) — stays within ~4K token estimate for large projects"
  - "cost tracked per-call via RunCostTracker.add_llm + record_openai_usage — no run_id needed for ephemeral endpoint"

patterns-established:
  - "AsyncMock in route tests: mocker.patch(..., new_callable=AsyncMock) for any awaited service call"
  - "monkeypatch target: routers.gap_analysis.project_service.get_project (not app.gap_analysis.…) — file imports module object"

requirements-completed: [GAP-01, GAP-02, GAP-04, GAP-05]

duration: 12min
completed: 2026-03-20
---

# Phase 11 Plan 01: AI Experiment Gap Analysis Backend Summary

**pydantic-ai gap analysis agent with structured GapSuggestion output, experiment tree + paper context serialization, and POST /api/projects/{id}/gap-analysis endpoint returning camelCase suggestion list**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-20T07:57:11Z
- **Completed:** 2026-03-20T08:09:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- GapSuggestion model with four gap_type values, auto-ID (gap_{hex8}), camelCase serialization, PaperRef with relevance_note, GapAnalysisOutput and GapAnalysisRequest
- gap_analyzer.py agent: _serialize_tree (parent-depth computation, 80-exp cap, 6-KV config, 4-KV metrics), _serialize_papers (20-paper cap, 300-char abstract), run_gap_analysis async function with cost tracking
- POST /api/projects/{project_id}/gap-analysis: 404 on unknown project, delegates to run_gap_analysis with dismissed_ids, returns camelCase list
- 16 tests total: 11 model-level (defaults, types, camelCase, ablation params) + 5 route-level (200 with suggestions, 404, dismissed_ids forwarded, paper context, camelCase response)

## Task Commits

Each task was committed atomically:

1. **Task 1: GapSuggestion models + gap_analyzer agent** - `0ebf6e7` (feat)
2. **Task 2: Gap analysis router + app.py wiring** - `8580034` (feat)

## Files Created/Modified

- `backend/models/gap_suggestion.py` - PaperRef, GapSuggestion, GapAnalysisOutput, GapAnalysisRequest Pydantic models
- `backend/agents/gap_analyzer.py` - GAP_ANALYSIS_SYSTEM_PROMPT, _serialize_tree, _serialize_papers, _make_gap_agent, run_gap_analysis
- `backend/routers/gap_analysis.py` - POST /api/projects/{project_id}/gap-analysis endpoint
- `backend/app.py` - Added gap_analysis router import and include_router call
- `backend/tests/test_gap_suggestion_model.py` - 11 model-level tests
- `backend/tests/test_gap_analysis_routes.py` - 5 route-level tests

## Decisions Made

- GapAnalysisOutput uses plain BaseModel (not CamelModel) since it is the agent's structured output type, not a JSON API response. CamelModel serialization happens only at the router layer via model_dump(by_alias=True).
- Monkeypatch target for route tests is `routers.gap_analysis.project_service.get_project` (not `app.gap_analysis.…`) since the router imports the module object directly.
- AsyncMock used for run_gap_analysis mocking in route tests — pytest-mock's mocker.patch with new_callable=AsyncMock correctly handles awaited coroutines.
- Token estimate logged as len(user_prompt) // 4 — rough but sufficient for operational monitoring without added latency.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required beyond existing OPENAI_API_KEY.

## Next Phase Readiness

- Backend endpoint fully operational for plan 02 frontend planning board
- GapSuggestion model provides the contract for frontend suggestion cards (gapType, suggestedConfig, paperRefs, ablationParams)
- run_gap_analysis can be called immediately once the project has experiments and linked papers

---
*Phase: 11-ai-experiment-gap-analysis*
*Completed: 2026-03-20*

## Self-Check: PASSED

- FOUND: backend/models/gap_suggestion.py
- FOUND: backend/agents/gap_analyzer.py
- FOUND: backend/routers/gap_analysis.py
- FOUND: backend/tests/test_gap_suggestion_model.py
- FOUND: backend/tests/test_gap_analysis_routes.py
- FOUND: commit 0ebf6e7 (Task 1)
- FOUND: commit 8580034 (Task 2)
