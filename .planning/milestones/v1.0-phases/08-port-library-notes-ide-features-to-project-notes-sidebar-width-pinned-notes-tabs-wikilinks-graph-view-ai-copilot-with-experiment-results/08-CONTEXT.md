# Phase 8: Port Library Notes IDE Features to Project Notes - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Port the full LibraryNotes IDE experience to the project notes tab (`/projects/:id/notes`). Six features: matching sidebar width, pinned notes, tabbed editor, wikilinks, graph view, and an AI copilot with experiment results context. The existing ProjectNotes (NotesPanel wrapper + experiment folder composite from Quick Task 6) is replaced with a LibraryNotes-equivalent component scoped to project + experiment notes.

</domain>

<decisions>
## Implementation Decisions

### AI Copilot with Experiment Context
- **@-mention experiments** to include as context — same pattern as LibraryNotes' @-mention for papers
- When an experiment is @-mentioned, copilot receives: config key-value pairs, metrics key-value pairs, experiment notes content, and child experiment summaries (if parent node)
- **Both experiments and linked literature** available in the @ menu — enables prompts like "compare my results to the baseline in @paper-X"
- **Text + markdown tables + inline charts** as output format — copilot can render comparison tables and simple inline charts (bar/line) from experiment metrics
- Copilot suggestion tabs with diff view + accept/reject — same as LibraryNotes

### Wikilink Scope & Resolution
- Wikilinks can link to: **project notes, experiment notes, linked literature, and experiments themselves**
- **Clicking a wikilink opens the entity's page in a new browser tab** — navigates to the experiment/paper/website page rather than opening inline
- **Autocomplete grouped by type** — [[  triggers a dropdown with sections: Notes, Experiments, Literature (with type badges)
- **Auto-create in current context** — typing [[Non-Existent Note]] creates a new note in the same scope (project-level if editing project note, experiment-level if editing experiment note)

### Graph View Data Model
- **All four node types**: project notes, experiment folder nodes, experiment notes, linked literature
- **Hull per experiment group** — each experiment and its notes enclosed in a colored hull boundary (same pattern as LibraryNotes paper/website hulls)
- **Match LibraryNotes options panel** — show/hide node types, physics sliders (clustering + gravity), search/filter
- Edges from wikilinks between notes, plus structural edges (experiment folder → experiment notes, project → project notes)

### Tab Behavior
- **Cross-experiment tabs** — open notes from any experiment or project level simultaneously. Tab label shows experiment name prefix (e.g., "ResNet > Results")
- **Full resource tabs** for linked literature — PDF viewer and website iframe tabs available inside the project notes IDE, same as LibraryNotes
- **Copilot suggestion tabs** with diff view and accept/reject buttons — same as LibraryNotes

### Sidebar & Pinned Notes
- **Sidebar width matches LibraryNotes** — `w-64` (256px)
- **Pinned notes** use existing `isPinned` DB field and API pattern — star icon, "Pinned" section above tree, pinned notes sort first
- **Recent notes** section below Pinned, same as LibraryNotes

### Claude's Discretion
- Whether to extract a shared ProjectNotesIDE component or adapt LibraryNotes directly
- Chart rendering library choice for inline charts (lightweight — e.g., recharts subset or custom SVG)
- Exact physics defaults for the graph view
- Tab close behavior and max tab count
- Loading states and error handling
- Backlinks panel implementation details

</decisions>

<specifics>
## Specific Ideas

- The @ menu for experiments should show experiment status badge (planned/running/completed/failed) and a preview of key metrics inline in the dropdown
- Inline charts in copilot responses should be minimal — simple bar charts for comparing metrics across experiments, not full dashboards
- The graph view should default to showing all node types but with experiment hulls collapsed if there are many experiments (expandable on click)
- Tab prefix for experiment notes (e.g., "ResNet > Results") should truncate long experiment names with ellipsis

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LibraryNotes.jsx` (~2400 lines): Full IDE with tabs, graph, wikilinks, copilot — primary reference implementation
- `NoteGraphView.jsx`: D3 force graph with hull boundaries, physics controls, search — reuse directly with adapted data source
- `WikiLinkExtension.js`: Tiptap extension for [[]] syntax, autocomplete, extraction — reuse with expanded resolution scope
- `NotesCopilotPanel.jsx`: AI copilot with @-mention, suggestion cards, agentic loop — adapt for experiment context
- `NotesPanel.jsx`: Current simple editor — will be replaced by the new IDE
- `experimentsApi` in api.js: list, update, listPapers — used for experiment data in copilot context
- `notesApi.listForExperiment`, `notesApi.createForExperiment` — experiment note CRUD

### Established Patterns
- LibraryNotes uses `allLoadedNotes` array with enriched metadata (`source`, `sourceName`, `sourceKey`)
- Tab system: `openTabs` array with `{ noteId, tabType, source, name }` objects
- Graph data: Nodes from all notes + wikilink edges via `extractWikiLinks(note.content)`
- Copilot: `contextItems` array with `{ type, id, name, includeNotes }` sent to backend
- `ItemFolder` component groups notes by source with collapsible header

### Integration Points
- Replace `ProjectNotes` export in `ProjectDetail.jsx` — currently wraps NotesPanel with composite array
- Backend: May need new `POST /api/projects/{id}/notes/copilot` endpoint for project-scoped AI chat with experiment context
- Backend: Experiment data serialization for copilot context (config + metrics + child summaries)
- `WikiLinkExtension` `getAllNotes` callback — wire to return project + experiment notes
- `NoteGraphView` `sourceKeyCollections` — adapt for experiment groups instead of library collections

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-port-library-notes-ide-features-to-project-notes*
*Context gathered: 2026-03-18*
