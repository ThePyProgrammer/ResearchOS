# Phase 3: Experiment Tree - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Researchers can plan and track a hierarchical tree of experiments within a project, including config key-value pairs, metrics key-value pairs, status badges, experiment notes (tiptap), and literature linking to individual experiments. This phase builds the experiment entity, tree UI, key-value editors, aggregated parent summaries, and integrates with existing notes and literature systems.

Requirements: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06, EXP-10, LIT-02, NAV-03

</domain>

<decisions>
## Implementation Decisions

### Tree Structure & Node Types
- Unlimited nesting depth (same as RQ tree) — any experiment can have children at any level
- All nodes can have BOTH config/metrics AND children — a parent group can have shared baseline config while children override specific keys
- No strict "group vs leaf" type distinction at the data level — behavior emerges from whether a node has children
- Create flow uses a **modal dialog** (not inline input) with name, status, and initial config key-value rows
- DnD sibling reorder + context menu reparenting (same pattern as RQ tree)
- Delete cascades to all children (same as RQ tree)

### Config & Metrics Editing
- **Inline table rows** below the experiment name — each row is a key-value pair
- Click '+' to add a row, click a cell to edit, 'x' to remove
- Config and metrics use the **same editor style** — labeled sections ("Config" / "Metrics") distinguish them
- Values **auto-detect types**: number, boolean, or string based on input — stored in JSONB with native types
- Auto-detection enables numeric sorting/comparison in Phase 4 without migration

### Experiment Placement in UI
- New **"Experiments" tab** in ProjectDetail left nav alongside Overview, Literature, and Notes
- Experiment tree is self-contained within the tab — does NOT appear in the left-nav tree
- Each experiment can optionally reference an **RQ it's testing** via an optional rq_id FK — shown as a dropdown or link on the experiment node
- Notes UX: Claude's discretion (minimize new layout infrastructure)

### Aggregated Parent Summaries
- Parent nodes show **status counts + metric ranges** for all descendants (recursive, not just direct children)
- Status counts as colored mini pills (e.g., "2✓ 1◆ 1✗")
- Metric ranges as **compact inline chips** next to status: "accuracy: 0.82–0.95 | loss: 0.03–0.12"
- Truncate to top 2-3 metrics if many exist
- Aggregation computed **client-side** from loaded children data — no extra API calls

### Status Badges (NAV-03)
- Status values: planned (blue), running (amber), completed (emerald), failed (red)
- Colored badge pill dropdown (same native select pattern as RQ status and project status)

### Claude's Discretion
- Visual distinction between parent groups and leaf nodes (icon choice, styling differences)
- Notes UX approach (replace panel vs slide-over vs other)
- Exact modal layout for experiment creation
- Loading skeletons and error states
- Sidebar icon for experiments (Material Symbols Outlined)
- Exact indentation, spacing, and responsive behavior

</decisions>

<specifics>
## Specific Ideas

- Create modal should include dynamic "Add config row" section so researchers can pre-fill known parameters (learning rate, batch size, model name) before running
- Badge pill dropdown should reuse the exact same component pattern as RQ status and project status from Phase 1 & 2
- The key-value editor is new UI — no existing component to reuse, but should feel native alongside the inline table patterns elsewhere in the app
- Metric range chips on parent nodes should be visually distinct from status pills (perhaps lighter/smaller text)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RQNode` / `RQSection` in `ProjectDetail.jsx` (lines 358-977): Complete recursive tree with DnD, inline editing, context menu — direct template for ExperimentNode/ExperimentSection
- `buildRqTree()` in `ProjectDetail.jsx` (lines 41-54): Flat-to-nested tree algorithm — copy as `buildExperimentTree()`
- `RQStatusDropdown` (lines 156-170): Colored badge pill select — copy with experiment status values
- `MiniSearchPicker` (lines 242-354): Autocomplete for linking papers/websites — reuse for experiment literature linking
- `NotesPanel.jsx`: Tiptap WYSIWYG editor — extend with `experiment_id` FK
- `@dnd-kit/core@^6.3.1` + `@dnd-kit/sortable@^10.0.0`: Already installed, same DnD setup
- `flattenRqTree()` (lines 776-785): DnD helper with parent tracking — copy for experiments
- `WindowModal` component: Generic modal — reuse for experiment create dialog

### Established Patterns
- CamelModel inheritance for all Pydantic models (auto camelCase serialization)
- Service layer owns all DB access; routers are thin
- `exclude_unset=True` for partial updates (not `exclude_none`)
- ID format: `exp_{uuid4.hex[:8]}` (consistent with `rq_`, `proj_` prefixes)
- Position-based sibling ordering with batch reorder endpoint
- Polymorphic join tables with CHECK constraint for exactly-one-of paper_id/website_id
- CustomEvent bus for cross-component updates

### Integration Points
- `ProjectDetail.jsx`: Add "Experiments" tab to left nav tab list
- `api.js`: Add `experimentsApi` following `researchQuestionsApi` pattern
- Backend: New `experiments` table + `experiment_papers` join table (migration 019)
- Notes: Add `experiment_id` nullable FK to notes table (migration 019 or 020)
- Router: `POST/GET /api/projects/{project_id}/experiments` + `PATCH/DELETE /api/experiments/{id}`
- Optional: `rq_id` nullable FK on experiments table referencing research_questions

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-experiment-tree*
*Context gathered: 2026-03-15*
