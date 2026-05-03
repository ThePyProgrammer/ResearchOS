# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Research Projects & Experiments

**Shipped:** 2026-03-18
**Phases:** 8 | **Plans:** 27 | **Timeline:** 13 days

### What Was Built
- Research projects with CRUD, sidebar navigation, and collapsible sub-links
- Research question hierarchy with DnD rearrangement and literature gap indicators
- Hierarchical experiment tree with config/metrics, status tracking, and parent aggregation
- Experiment comparison (side-by-side metrics, config diff with inheritance, duplication)
- Multi-format import wizard (CSV/JSON/JSONL/XLSX) with column mapping, grouping, and collision resolution
- Spreadsheet-style experiment table view with filters, sorts, inline editing, and column management
- Full project notes IDE with pinned notes, tabs, wikilinks, graph view, and AI copilot with @-experiment context

### What Worked
- **GSD wave-based planning**: 3 waves per phase allowed clean dependency ordering
- **Quick tasks for UX polish**: 7 quick tasks shipped sidebar refactors, icon changes, and multi-format import without phase ceremony
- **Component prop injection pattern**: NoteGraphView and NotesCopilotPanel serve both library and project scopes via `customSourceColors`/`sendFn` props
- **TDD Wave 0 plans**: Pure utility function tests (csvImportUtils, table helpers) caught issues before UI work
- **Human verification checkpoints**: Caught real issues (graph filter visibility, wikilink click routing) that automated tests missed

### What Was Inefficient
- **Sticky header debugging**: Multiple attempts to fix experiment header pinning due to nested overflow contexts — should have checked Layout.jsx scroll chain first
- **detectType duplication**: Copied between files initially, required cleanup later — should have extracted to shared utility from the start
- **VERIFICATION.md gaps**: Phases 1-5 had incomplete verification paperwork, requiring retroactive cleanup in quick task 7

### Patterns Established
- **Shared utility extraction**: `frontend/src/utils/detectType.js` and `frontend/src/hooks/useLocalStorage.js` as shared modules
- **CustomEvent bus**: `researchos:projects-changed` for sidebar-page decoupling
- **Grid layout for Outlet wrappers**: `display: grid` reliably passes height to React Router Outlet children
- **BFS-ordered bulk create**: Backend receives parent-before-child ordered array with tmp_id→real_id mapping
- **sourceKey convention**: `'project'`, `'experiment:{id}'`, `'paper:{id}'` for unified note source tracking

### Key Lessons
1. **Check scroll ancestry before using `sticky`** — it only works relative to the nearest scrolling ancestor, which may not be where you expect
2. **Extract shared utilities on first use, not after duplication** — the detectType pattern should have been shared from day one
3. **Quick tasks are ideal for UX polish** — sidebar layout, icon changes, and small features don't need full phase planning
4. **Prop injection > component forking** — adding `sendFn`, `customSourceColors`, `storagePrefix` props kept components reusable across library and project scopes

### Cost Observations
- Model mix: primarily Sonnet for executor/researcher/checker agents, Opus for orchestration
- 8 phases executed across ~6 sessions
- Quick tasks were highly efficient — 7 shipped in minimal context

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 8 |
| Plans | 27 |
| Quick Tasks | 7 |
| Timeline | 13 days |
| LOC | ~26,000 |
| Requirements | 29/29 |
