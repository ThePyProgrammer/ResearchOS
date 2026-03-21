# Changelog

Human-readable summary of what shipped, grouped by milestone.

---

## v1.1 — Research Productivity (2026-03-21)

### Task Database (Phase 9)
- Project-scoped tasks with title, description, status, priority, due date (with optional time), tags, and custom fields
- Kanban board with drag-and-drop between custom status columns, inline task creation, column management
- List view with sortable/filterable columns, filter chips, column visibility, custom field management
- Calendar view with month grid, colored task chips on due dates, unscheduled sidebar with drag-to-date
- Task detail overlay (peek or modal mode) with editing, status colors, and completed task indicators

### LaTeX Export (Phase 10)
- HTML-to-LaTeX DOM walker serializer with full tiptap format support (headings, lists, tables, math, formatting)
- Citation insertion via `@` mention — inline author-year chips with context menu (open, remove, copy key, copy BibTeX)
- Citation key generation mirroring the backend BibTeX export, with collision-safe deduplication (smith2024a/b)
- Export modal with template selection (Article, IEEE, NeurIPS), section reordering for folder exports
- Live LaTeX preview panel with syntax highlighting and ~500ms debounce
- ZIP download with .tex + .bib bundle

### AI Experiment Gap Analysis (Phase 11)
- Backend gap analyzer agent (pydantic-ai) that serializes experiment tree + linked paper abstracts
- Four gap types: missing baseline, ablation gap, config sweep, replication
- Frontend planning board: suggestion cards on left, mini experiment tree on right
- Drag-to-promote: drag a suggestion card onto a tree node to create a planned experiment
- Paper reference chips with inline popover previews showing title, authors, abstract
- Detail overlay for editing suggestion name, rationale, and config before promoting
- Dismiss/undo flow with toast notification; dismissed suggestions remembered across re-runs

---

## v1.0 — Research Projects & Experiments (2026-03-18)

### Project Foundation (Phase 1)
- Projects as top-level entities within libraries
- Project overview page with editable name, description, and status
- Sidebar navigation with collapsible project tree

### Research Questions & Literature (Phase 2)
- Hierarchical research question tree with drag-and-drop nesting
- Status tracking (open, investigating, answered, discarded)
- Project-linked papers from the library with literature tab

### Experiment Tree (Phase 3)
- Nested experiment hierarchy with configurable config (JSONB) and metrics (JSONB)
- Tree view with expand/collapse, drag-and-drop reorder, and inline detail panel

### Experiment Differentiators (Phase 4)
- Side-by-side experiment comparison modal
- Link papers to experiments for literature grounding
- Bulk status changes and experiment duplication

### Integration Polish (Phase 5)
- Cross-feature UX improvements and consistency fixes

### CSV Loading Framework (Phase 6)
- Import experiment results from CSV files
- Column mapping UI with type detection and preview
- Merge into existing experiment configs/metrics

### Experiment Table View (Phase 7)
- Spreadsheet-style view with sortable/filterable columns
- Bulk selection with multi-select actions (compare, set status, duplicate, delete)
- Column visibility controls

### Project Notes IDE (Phase 8)
- Project-scoped tiptap notes with full editor features
- Project-level AI copilot with experiment and literature context
