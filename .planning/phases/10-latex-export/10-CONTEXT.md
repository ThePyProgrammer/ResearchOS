# Phase 10: LaTeX Export - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Export project notes to compilable LaTeX with citation management and BibTeX generation. Users can insert citation references in notes, preview raw .tex output, and download .zip packages containing .tex + .bib files. Both single notes and folders (as multi-section documents) are exportable.

</domain>

<decisions>
## Implementation Decisions

### Citation insertion UX
- @-mention trigger character to insert citations (distinct from [[ which is used for note wikilinks)
- Popup shows project-linked papers first, with a "Search full library..." fallback at the bottom
- Papers and websites both citable (with appropriate type icons in popup)
- Citation renders as an inline author-year chip: (Vaswani et al., 2017)
- Citing a paper from the full library auto-links it to the project (appears in Literature tab, included in .bib export)

### Citation chip interactions
- Chip is clickable — opens a context menu with four options:
  1. Open paper (navigates to paper detail in new tab)
  2. Remove citation (deletes the citation from the note)
  3. Copy citation key (copies e.g. `vaswani2017attention` to clipboard)
  4. Copy BibTeX entry (copies the full @article{...} entry to clipboard)
- Hover tooltip shows: title, authors, year, venue, and auto-generated citation key

### Export scope & structure
- Two export modes:
  1. Single note export — right-click note in file tree or toolbar action; produces .zip with one .tex + .bib
  2. Folder export — right-click folder; each child note becomes a \section, subfolders become \subsections
- Export dialog with:
  - Template selection: Article (default), IEEE Conference, NeurIPS
  - Editable title field (pre-filled from folder/note name)
  - Editable author field (blank by default)
  - Manual section reordering via drag-and-drop (for folder export)
  - Read-only list of cited papers with their auto-generated citation keys
  - Download .zip button

### LaTeX preview panel
- Shows raw .tex source code with syntax highlighting (not rendered PDF-like output)
- Side-by-side split layout: editor on left, preview on right
- Togglable via toolbar button — off by default (full editor width), click to open split
- Live update with ~500ms debounce as user types (AST-to-text serialization, no compilation)
- Read-only, monospace font

### Citation key generation
- Keys auto-generated using existing `_make_citation_key()` pattern: `{lastname}{year}{titleword}`
- Collision-safe deduplication: smith2024a, smith2024b when multiple papers share first author + year (TEX-06)
- Keys visible (read-only) in export dialog and chip tooltip — not editable in v1 (TEX-08 deferred to v2)

### LaTeX serializer approach
- HTML DOM walker using DOMParser (same pattern as existing `_nodeToMd()`) — research found notes are stored as HTML strings, not ProseMirror JSON, making `@tiptap/static-renderer` incompatible. User approved DOM walker approach 2026-03-20.
- Validate tiptap table HTML structure on day one (pending todo from STATE.md)

### Claude's Discretion
- Syntax highlighting library choice for preview panel
- Exact debounce timing for live preview
- Template .tex preamble package details beyond the required ones
- Error handling for malformed tiptap content during serialization
- .bib file formatting details (field ordering, indentation)

</decisions>

<specifics>
## Specific Ideas

- Citation chip should feel like an inline tag/pill — visually distinct from regular text but not disruptive
- Export dialog layout inspired by the existing BibtexExportModal (tree-view editor pattern)
- Template selection should be expandable later — v1 ships with 3 templates, more can be added
- Folder export section ordering via drag in the dialog mirrors how BibTeX export already lets users reorder entries

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bibtex_service.py` — `_make_citation_key()`, `paper_to_bibtex()`, `website_to_bibtex()`, `export_bibtex()` all reusable for .bib generation
- `WikiLinkExtension.js` — mark-based tiptap extension with `@tiptap/suggestion` popup; citation extension can follow same pattern with @ trigger
- `BibtexExportModal.jsx` — tree-view BibTeX editor modal; export dialog can reuse layout patterns
- `ProjectNotesIDE.jsx` — has `_nodeToMd()` markdown serializer as reference for building the LaTeX serializer
- `@tiptap/extension-mathematics` + KaTeX already installed — math content in notes will serialize to LaTeX math

### Established Patterns
- tiptap extensions: StarterKit, Mathematics, TableKit, WikiLink (mark-based with suggestion) — citation will be another mark-based extension
- Notes stored as HTML strings — serializer uses DOMParser HTML walker (same pattern as `_nodeToMd()`)
- `projectPapersApi` — existing API for fetching project-linked papers (used in Literature tab)
- Context menu pattern: not currently used on inline marks, but tiptap supports NodeView for custom click handling

### Integration Points
- `ProjectNotesIDE.jsx` toolbar — add cite button and LaTeX preview toggle button
- `notesApi` / `projectPapersApi` — fetch papers for citation popup
- `bibtex_service.py` — backend endpoint for generating .bib from paper IDs (or reuse client-side)
- Project's linked papers join table (`project_papers`, `project_websites`) — citation auto-linking writes here
- File tree context menu — add "Export as LaTeX" option for notes and folders

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-latex-export*
*Context gathered: 2026-03-20*
