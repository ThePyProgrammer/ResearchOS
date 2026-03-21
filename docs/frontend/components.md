# Shared Frontend Components

Key reusable components in `frontend/src/components/`. All use Tailwind CSS and Material Symbols Outlined icons.

---

## NotesPanel

**File:** `frontend/src/components/NotesPanel.jsx`

A file-system-style notes IDE backed by a tiptap WYSIWYG editor.

### What it does

- Renders a two-column layout: a file tree on the left and an editor on the right.
- Supports folders and files. Files open in the tiptap editor. Folders can be expanded/collapsed.
- Inline rename (double-click), drag-to-reorder, and right-click context menu (new file, new folder, rename, delete).
- Editor supports: headings (H1-H3), bold, italic, underline, code, code blocks, task lists, highlights, links, typography smart-quotes, and KaTeX math (`$...$` and `$$...$$`).
- Auto-saves on blur. Optionally shows a "Generate AI Notes" button.
- Accepts `[[Note Name]]` wiki-link syntax that navigates to the named note when clicked.
- Exports a `NoteGraphView` toggle to visualize inter-note wikilink connections.

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `listFn` | `() => Promise<Note[]>` | Fetch notes for this item |
| `createFn` | `(data) => Promise<Note>` | Create a new note |
| `generateFn` | `() => Promise<void>` | Trigger AI note generation (optional) |
| `readOnly` | `boolean` | Disables editing (optional) |

### Where Used

`Paper.jsx`, `Website.jsx`, `GitHubRepo.jsx`, `LibraryNotes.jsx`, `ProjectNotesIDE.jsx`

---

## CopilotPanel

**File:** `frontend/src/components/CopilotPanel.jsx`

AI chat panel for paper, website, and GitHub repo pages.

### What it does

- Renders a chat thread with user and assistant bubbles.
- Renders LaTeX (`$...$` and `$$...$$`) inline in assistant messages using KaTeX.
- Renders `[[Note Name]]` wiki-links in assistant messages as clickable chips that navigate to the linked note.
- Displays `SuggestionCard`-style inline diffs when the assistant returns `suggest_note_edit` or `suggest_note_create` tool calls. User can accept or reject each suggestion.
- Sends the currently selected note's content and the full notes filesystem as context with each message.
- Polls `chatApi` or `chatApi.listForWebsite` / `chatApi.listForGitHubRepo` depending on which prop is provided.
- Supports clearing history.

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `paperId` | `string` | Paper ID for paper chat mode |
| `websiteId` | `string` | Website ID for website chat mode |
| `githubRepoId` | `string` | GitHub repo ID for repo chat mode |
| `selectedNoteContent` | `string` | HTML content of the currently selected note (for context) |
| `notes` | `Note[]` | Full notes list (passed as context for suggestion targeting) |
| `onNoteUpdated` | `(noteId, content) => void` | Called when a suggestion is accepted |

Exactly one of `paperId`, `websiteId`, `githubRepoId` should be provided.

### Where Used

`Paper.jsx`, `Website.jsx`, `GitHubRepo.jsx`

---

## NotesCopilotPanel

**File:** `frontend/src/components/NotesCopilotPanel.jsx`

Library-scoped AI copilot used on `LibraryNotes.jsx`.

### What it does

- Same chat UI as `CopilotPanel` but scoped to a library rather than a single item.
- Supports `@` mention context selection: typing `@` opens a popover to select papers, websites, GitHub repos, collections, or "all items".
- Each context chip has a toggle to include or exclude the item's notes.
- Backend may run an agentic loop (`read_note` / `list_item_notes` internal tools) before responding; a spinner with iteration count is shown during this.
- Suggestion cards appear inline in the chat with diff view and accept/reject.
- Renders charts (Bar, Line) when the assistant includes `<chart>` blocks in its response.

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `libraryId` | `string` | Active library ID |
| `notes` | `Note[]` | Library notes list (for accept/reject callbacks) |
| `onNoteUpdated` | `(noteId, content) => void` | Called when a suggestion is accepted |
| `onNoteCreated` | `() => void` | Called when a create suggestion is accepted (triggers refresh) |

### Where Used

`LibraryNotes.jsx`

---

## NoteGraphView

**File:** `frontend/src/components/NoteGraphView.jsx`

D3-based force-directed graph visualizing `[[wikilink]]` connections between notes.

### What it does

- Parses `[[Note Name]]` references from all note HTML content.
- Renders nodes colored by note source (library = slate, paper = blue, website = teal, github = purple).
- Draws edges for each wikilink. Clicking a node navigates to that note in the IDE.
- Draws convex hull groupings around nodes that belong to the same source.
- Supports zoom/pan via D3's zoom behavior.
- Persists layout settings (label toggle) to `localStorage` via `useLocalStorage`.

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `notes` | `Note[]` | All notes to build the graph from |
| `onSelectNote` | `(note) => void` | Called when a node is clicked |

### Where Used

`NotesPanel.jsx` (toggle button shows/hides the graph panel), `LibraryNotes.jsx`

---

## PaperInfoPanel

**File:** `frontend/src/components/PaperInfoPanel.jsx`

Right-side metadata panel for a paper in the Library page.

### What it does

- Displays all paper metadata: title, authors, year, venue, abstract, DOI, arXiv ID, status, tags, collections.
- Inline editing for all text fields via `EditableField` and `EditableTextArea` sub-components.
- `AuthorChips`: drag-reorder, double-click inline edit, comma-paste auto-split, add via Enter.
- `TagChips`: same interactions as AuthorChips.
- `CollectionsPicker`: autocomplete dropdown to add/remove the paper from collections.
- `NamedLinks`: renders GitHub URL, website URL, and other named links.
- PDF controls: upload, fetch from external URL, delete, download.
- APA citation and BibTeX citation copy buttons.

### Exported Subcomponents

`AuthorChips`, `TagChips`, `CollectionsPicker`, `EditableField`, `EditableTextArea`, `NamedLinks`, `statusConfig`, `formatCitationAPA`, `formatCitationBibTeX`

### Key Props (PaperInfoPanel)

| Prop | Type | Description |
|------|------|-------------|
| `paper` | `Paper` | Paper object to display |
| `onUpdate` | `(updates) => void` | Called with partial updates after any field edit |
| `collections` | `Collection[]` | All collections (from LibraryContext) |

### Where Used

`Library.jsx` (as the right panel when a paper is selected)

---

## GapAnalysisTab

**File:** `frontend/src/components/GapAnalysisTab.jsx`

AI-powered planning board embedded in the Experiments tab of a project.

### What it does

- "Analyze Gaps" button triggers `POST /api/projects/:id/gap-analysis` and renders 5-8 `SuggestionCard` items with a staggered entrance animation.
- Each card shows the gap type badge (Baseline, Ablation, Sweep, Replication), name, rationale summary, and dismiss button.
- Clicking a card opens `SuggestionDetailOverlay` (full rationale, suggested config, paper references).
- Cards are draggable via `@dnd-kit/core`. The right column shows `MiniExperimentTree`.
- Dropping a card onto an experiment node in the tree promotes it: calls `experimentsApi.create()` to create a new experiment as a child of the target node. Dropping onto the `__root__` droppable creates a root-level experiment.
- Dismissed cards show an undo toast for 4 seconds. Dismissed IDs are tracked in state and passed back to the API on re-analysis so they are not re-suggested.

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `projectId` | `string` | Project UUID |
| `flatExperiments` | `Experiment[]` | Current experiment list (for MiniExperimentTree and context) |
| `onRefreshExperiments` | `() => void` | Called after a promotion to trigger parent re-fetch |

### Where Used

`ProjectDetail.jsx` (`ProjectExperiments` sub-component)

---

## SuggestionCard

**File:** `frontend/src/components/SuggestionCard.jsx`

Compact draggable card for a single gap analysis suggestion.

### What it does

- Shows gap type badge, experiment name, and first 120 characters of rationale.
- Draggable via `useDraggable` from `@dnd-kit/core`. Becomes semi-transparent while dragging.
- Dismiss button (X) calls `onDismiss`.
- Body click calls `onClick` (opens detail overlay in parent).
- When `isDragging` is true (used as `DragOverlay` ghost), renders without drag listeners.

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `suggestion` | `GapSuggestion` | Gap suggestion object from API |
| `onDismiss` | `(suggestion) => void` | Dismiss callback |
| `onClick` | `() => void` | Detail view callback |
| `isDragging` | `boolean` | Ghost mode for DragOverlay (optional) |

### Where Used

`GapAnalysisTab.jsx`

---

## MiniExperimentTree

**File:** `frontend/src/components/MiniExperimentTree.jsx`

Compact experiment tree used as the drop-target column in the Gap Analysis planning board.

### What it does

- Builds a tree from a flat `flatExperiments` array using parent-child relationships.
- Each experiment node is a `useDroppable` drop target from `@dnd-kit/core`.
- A special `__root__` droppable at the top allows promoting a suggestion as a top-level experiment.
- Status color dots (planned = slate, running = blue, completed = emerald, failed = red).
- Recursive rendering for arbitrarily deep trees.

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `flatExperiments` | `Experiment[]` | Flat experiment list from parent |
| `projectId` | `string` | Project UUID (unused internally; parent uses it for create calls) |
| `onRefresh` | `() => void` | Callback after external tree mutations |

### Where Used

`GapAnalysisTab.jsx`

---

## PaperChipPopover

**File:** `frontend/src/components/PaperChipPopover.jsx`

Inline popover that shows paper details when a citation chip is clicked in a gap suggestion.

### What it does

- Fetches `GET /api/papers/:id` on mount.
- Renders title, authors, year, venue, abstract preview, and links (DOI, arXiv) in a fixed-position popover anchored to the click target.
- Closes on outside click or Escape.

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `paperId` | `string` | Paper ID to fetch |
| `displayLabel` | `string` | Author-year string shown on the chip |
| `onClose` | `() => void` | Close callback |
| `anchorRect` | `DOMRect` | Position of the clicked chip for positioning the popover |

### Where Used

`SuggestionDetailOverlay.jsx` (within gap analysis paper reference chips)
