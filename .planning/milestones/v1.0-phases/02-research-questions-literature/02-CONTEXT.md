# Phase 2: Research Questions & Literature - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Researchers can define the questions a project is trying to answer, track their status with hypotheses, and link supporting literature from the library. RQs form a recursive tree within a project. Papers/websites can be linked at both project-level and per-RQ level.

Requirements: RQ-01, RQ-02, RQ-03, RQ-04, RQ-05, RQ-06, LIT-01, LIT-03, LIT-04

</domain>

<decisions>
## Implementation Decisions

### RQ Presentation & Hierarchy
- RQs display inline on the Overview tab (below project description, above Literature section)
- Expand/collapse with chevron — collapsed primary RQs show sub-question count
- Unlimited nesting depth — any RQ can have children at any level (recursive tree)
- Inline add: "+" button at bottom of RQ section for primary RQs, "+ Add sub-question" inside expanded RQs
- New RQs created via inline text input (type and press Enter), not a modal

### Hypothesis & Status Tracking
- Hypothesis is an optional inline text field on each RQ, shown below the question text when expanded
- Click to add/edit hypothesis text
- RQ status displayed as a colored badge pill dropdown (same pattern as project status in Phase 1)
- Status values: open (blue), investigating (amber), answered (emerald), discarded (slate/gray)
- RQ status covers both the question and hypothesis — no separate hypothesis status
- Each RQ's status is independent — changing a parent's status does NOT cascade to children

### Paper-to-Project Linking UX
- Papers/websites linkable from BOTH directions:
  - On project page: search picker ("+ Link paper" button opens autocomplete search of library)
  - On paper/website detail: "Link to project" action
- Linked papers appear in a dedicated "Literature" tab in the ProjectDetail left nav
- Papers can link at both levels: project-wide AND to specific RQs
- Gap indicator: subtle warning icon on any RQ (at every nesting level) that has no linked papers
- Tooltip: "No supporting literature linked"

### RQ Editing & Reorganization
- Inline click-to-edit for RQ title text (click to make editable, Enter to save, Escape to cancel) — same as EditableName pattern
- Three-dot context menu on each RQ with "Delete" option
- Delete confirmation prompt when RQ has children ("Delete RQ and its N sub-questions?")
- Deleting a parent RQ cascades to all children
- Full drag-and-drop reparenting:
  - Drag sub-Q to root area = promote to primary RQ
  - Drag primary onto another primary = make sub-question (only if dragged item has no children)
  - Drag sub-Q to different parent = move to new parent
  - Drag between siblings = reorder

### Claude's Discretion
- Exact drag-and-drop library choice and implementation approach
- Literature tab table layout and columns
- Search picker component design details
- Empty state messaging for Literature tab and RQ section
- Exact indentation and spacing for nested RQ tree

</decisions>

<specifics>
## Specific Ideas

- Badge pill dropdown should reuse the same pattern as project status dropdown from Phase 1 (native select styled as colored pill)
- The search picker for linking papers should feel like the existing "Add to Collection" autocomplete
- Gap indicator should be non-blocking — just a visual hint, not preventing any actions

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProjectDetail.jsx`: Left-nav + tab layout, EditableName, EditableDescription, StatusDropdown — RQ inline editing reuses these patterns
- `NotesPanel.jsx`: Tiptap WYSIWYG editor already wired for projects — Literature tab is adjacent
- `Sidebar.jsx` ProjectsTree: CustomEvent bus pattern for real-time updates
- `LibraryContext.jsx`: useLibrary() hook for scoping searches to active library
- Phase 1 status dropdown: native select styled as badge pill (emerald/amber/blue/slate)

### Established Patterns
- CamelModel inheritance for all Pydantic models (auto camelCase serialization)
- Service layer owns all DB access — routers are thin
- CustomEvent bus (`researchos:projects-changed`) for component decoupling
- Collections use JSONB array on papers — but project linking should use explicit join tables for richer relationships

### Integration Points
- ProjectDetail Overview tab: RQ section inserts below project description
- ProjectDetail left nav: add "Literature" tab alongside Overview and Notes
- Paper/Website detail pages: add "Link to project" action
- Backend: new `research_questions` table (recursive via parent_id), new `project_papers` join table, new `rq_papers` join table
- API: nested under `/api/projects/{project_id}/research-questions` and `/api/projects/{project_id}/papers`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-research-questions-literature*
*Context gathered: 2026-03-15*
