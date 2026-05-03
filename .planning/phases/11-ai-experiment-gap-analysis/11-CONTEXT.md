# Phase 11: AI Experiment Gap Analysis - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

AI-powered analysis of a project's experiment tree to suggest missing experiments (baselines, ablations, config sweeps, replications), with a drag-based planning board to promote suggestions directly into the experiment tree. This phase does NOT add automated experiment execution, parameter sweep optimization, or automated literature search for new papers.

</domain>

<decisions>
## Implementation Decisions

### Suggestion card content & types
- **All four gap types:** missing baseline, ablation gap, config sweep, replication
- **Compact cards:** type badge (colored chip), suggestion name, 1-line rationale, 1-2 key config params, paper reference chips. Click to expand detail.
- **Edit in detail panel only** — click card opens peek/modal overlay (Phase 9 pattern). Edit name, config, rationale there before promoting.
- **Dismiss with soft fade + undo** — dismissed cards fade out with brief "Undo" toast. Dismissed suggestions remembered so re-running analysis doesn't resurface them.

### Planning board layout & interaction
- **New tab in Experiments section** — "Gap Analysis" tab alongside existing Tree/Table toggle in ProjectDetail
- **Cards left (~60%), mini-tree right (~40%)** — suggestion cards in scrollable column on left, compact experiment tree on right. Drag from left to right to promote.
- **Drag card onto mini experiment tree** — drop on a tree node creates a child experiment under that parent. Tree auto-expands on hover during drag. Uses @dnd-kit patterns from Phase 9.
- **Promoted experiments get "planned" status** — config pre-filled from suggestion, name editable. Clearly distinguishes AI-suggested from user-created experiments.

### AI analysis trigger & flow
- **Two entry points:** primary "Analyze Gaps" button on the Gap Analysis tab + context menu option on experiment tree root node
- **Streaming cards if on page, background notification if navigated away** — cards appear one by one with animation when user is watching. If user navigates to another tab, toast notification when complete.
- **AI receives full tree + configs + linked paper abstracts** — experiment tree (names, configs, metrics, statuses) plus abstracts/metadata of all project-linked papers. Enables both structural gap detection and literature cross-referencing.
- **Re-run replaces undismissed suggestions** — "Re-analyze" clears current suggestions, generates fresh ones. Dismissed stay dismissed. Promoted experiments already in tree are unaffected.

### Paper cross-referencing
- **Small citation chips below rationale** on compact cards — 1-2 paper references as clickable chips (author, year). Consistent with Phase 10 citation chip pattern.
- **Click paper chip shows inline popover preview** — title, authors, abstract, venue in a tooltip/popover. User stays on the page without navigating away.
- **Brief relevance note in detail panel** — each referenced paper includes a 1-line explanation of why it's relevant (e.g., "Tested similar architecture without dropout variation"). Only visible in expanded detail, not on card.

### Claude's Discretion
- Exact AI prompt engineering and structured output schema
- Streaming implementation approach (SSE, polling, or WebSocket)
- Mini-tree rendering (reuse existing tree component or simplified version)
- Empty state design for first-time Gap Analysis tab
- Card animation and transition details
- Token budget management for large experiment trees

</decisions>

<specifics>
## Specific Ideas

- Planning board should feel like a research whiteboard — suggestions on one side, your experiment tree on the other, drag to connect them
- Citation chips on suggestion cards should match the look of citation chips from Phase 10 (author-year format, same color scheme)
- The compact card layout (type badge + name + rationale + config + paper chips) is similar to Linear's issue cards — information-dense but not cluttered
- Mini experiment tree on the right should show the same indentation/nesting as the full tree view, just without the detail columns

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@dnd-kit/core` (useDroppable, useDraggable, DndContext): Already used in Phase 9 Kanban + Calendar. Same patterns for card-to-tree DnD.
- `buildExperimentTree()` in ProjectDetail.jsx: Converts flat experiments to nested tree structure. Can be reused for mini-tree rendering.
- `experiment_designer.py` agent: Existing pydantic-ai agent with OpenAI structured outputs, RunLogger, arXiv search. Pattern for new gap analysis agent.
- `agents/base.py`: RunLogger, emit_activity, search_arxiv — shared infrastructure for agent workflows.
- `experimentsApi` in api.js: Full experiment CRUD already wired. New gap analysis endpoints extend this.
- Phase 9 overlay pattern (TaskDetailPanel): peek/modal overlay with backdrop. Reuse for suggestion detail panel.

### Established Patterns
- Agent workflows: pydantic-ai Agent + structured Pydantic output models + RunLogger + cost tracking
- API: FastAPI router → service layer → Supabase. CamelModel for all domain objects.
- Frontend state: useState + useEffect + useCallback. No global state manager.
- DnD: Single DndContext per view, useDroppable on containers, useDraggable/useSortable on items.

### Integration Points
- ProjectDetail.jsx: Add "Gap Analysis" tab to section toggle (alongside Tree/Table)
- Sidebar.jsx: No new link needed (tab lives within existing Experiments section)
- backend/routers/: New `gap_analysis.py` router for triggering analysis and managing suggestions
- backend/agents/: New `gap_analyzer.py` agent using existing base infrastructure
- backend/models/: New `gap_suggestion.py` model for suggestion persistence

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-ai-experiment-gap-analysis*
*Context gathered: 2026-03-20*
