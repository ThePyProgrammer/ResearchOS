# Phase 1: Project Foundation - Context

**Gathered:** 2025-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver complete project CRUD, navigation shell, and project notes. Researchers can create, organize, and navigate research projects within ResearchOS. This phase builds the project entity, list page, detail page, sidebar integration, and project-level notes using the existing tiptap system.

</domain>

<decisions>
## Implementation Decisions

### Project List Layout
- Card grid layout (not table) — responsive grid, each card is a project
- Card content: project name, status badge (colored), primary RQ text (truncated), last updated date
- Three-dot quick actions menu on each card: edit, archive, delete
- Friendly empty state: icon/illustration + "Start your first research project" with prominent create button
- Create flow: modal dialog with name + description fields → creates project and navigates to detail page

### Project Detail Layout
- Split panel layout: left panel has an expandable tree nav, right panel shows selected item details
- Left panel: tree structure showing RQs and experiments as nested, clickable items (Phase 1 shows tree structure but RQ/experiment items are wired in later phases)
- Right panel: hybrid navigation — simple items (like RQs) show inline in the right panel; complex items (experiments with their own tree) navigate to their own page
- Project header: large editable title + status badge dropdown + editable description, all inline-editable (click to edit)

### Project-Library Relation
- Each project belongs to exactly one library (library_id FK on projects table)
- Switching libraries changes which projects are visible
- Papers can only be linked from the same library as the project — no cross-library references
- Cascade delete: deleting a library deletes all its projects, RQs, experiments

### Sidebar Placement
- Projects nested under Library section in sidebar, below the collections tree
- Expandable "Projects" section header that reveals project names when expanded
- Clicking a project name navigates to its detail page
- Projects section is library-scoped — shows projects for the active library only

### Claude's Discretion
- Sidebar icon choice (Material Symbols Outlined — pick what fits best)
- Exact card spacing, shadows, and responsive breakpoints
- Loading skeleton design for project list and detail pages
- Error state handling patterns

</decisions>

<specifics>
## Specific Ideas

No specific external references — open to standard approaches that match the existing ResearchOS visual language (slate-800 sidebar, slate-50 background, blue-600 accent).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SidebarLink` component in `Sidebar.jsx`: navigation link with icon, label, badge — reuse for project entries
- `LibrarySwitcher` in `Sidebar.jsx`: existing expandable dropdown pattern — reference for expandable Projects section
- `PaperInfoPanel.jsx` exports: `EditableField`, `EditableTextArea`, `statusConfig` — reuse for inline-editable project header
- `WindowModal` component: generic modal — reuse for project create dialog
- `NotesPanel.jsx`: tiptap WYSIWYG editor with file tree — reuse directly for project notes (just add project_id FK)
- `LibraryContext.jsx`: active library state + CRUD pattern — reference for ProjectContext or extend LibraryContext

### Established Patterns
- Pydantic `CamelModel` base → all models serialize as camelCase JSON
- Service layer owns all DB access; routers are thin
- `useEffect` + loading/error states pattern in all pages
- Collection tree in sidebar: drag-drop, rename, hierarchical — similar expandable pattern needed for projects

### Integration Points
- `App.jsx`: add new route `/projects` and `/projects/:id` under `<Layout />`
- `Sidebar.jsx`: add Projects section below collections tree, scoped to `activeLibrary`
- `api.js`: add `projectsApi` following the same pattern as `papersApi`, `collectionsApi`
- Supabase: new `projects` table with `library_id` FK, new migration file following numbering convention
- Notes system: add `project_id` nullable FK to `notes` table via migration

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-project-foundation*
*Context gathered: 2025-07-17*
