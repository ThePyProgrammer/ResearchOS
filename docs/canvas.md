# Canvas documents

Use **New canvas** in a notes explorer, or right-click a folder and choose **New canvas**. Canvases appear alongside notes and folders in library, paper, website, repository, project, and experiment notes. Names end in `.canvas`; storage uses the existing notes API and database, with no migration or new service required.

The editor stores [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/), the open format used by [Obsidian Canvas](https://obsidian.md/help/plugins/canvas). It preserves node ordering, standard optional fields, and extension fields on import and export.

## Cards and connections

- **Text** adds a Markdown card. Double-click to edit. Text supports headings, lists, tasks, links, code, tables, and images. **Convert to note** creates a rich-text note and replaces the card with a reference.
- **File / canvas** adds a note or another canvas. Pick a folder to add its files, or drag entries from the explorer. Referenced notes show live content. **Edit linked note** edits the original through the existing rich-text editor; **Open file** opens its tab; **Swap file** relinks the card. **Heading / block** accepts `#Heading` or `#^block-id`.
- Nested canvases show previews, with a depth limit and circular-reference detection. Open the nested canvas to continue navigating. Missing or ambiguous file paths show an unavailable state and can be relinked.
- **Media** imports images, audio, video, PDF, or text files; local files can also be dropped. Each attachment is limited to 15 MB. Imported `.canvas` attachments become canvas documents in the current notes folder. Remote media can be referenced by an imported file node's HTTP(S) URL.
- **Web page** embeds an HTTP(S) page in a sandboxed frame. The inspector can change or copy its URL and reload it. Some sites block embedding; their external link remains available.
- **Group** creates a visual container around selected cards, or an empty group. Moving a group carries its contained cards. Set its label, color, and image background, with cover, aspect-ratio, or repeat rendering.
- Drag a side handle to another card to connect them. Dropping a new connection on empty space creates a text card. Connections support labels, colors, side selection, and arrows at either or both ends. Drag endpoints to reconnect; drop an existing endpoint on empty space to disconnect. **Follow start/end** navigates to either card.

## Editing and navigation

Drag card headers to move them and selected card borders to resize. Drag blank space for a selection box, Shift-click for multiple selection, or use Ctrl/Command+A. Alt-drag leaves a duplicate at the original position. The inspector offers duplication, deletion, layer ordering, grouping, six alignments, row/column/grid layouts, spacing distribution, and horizontal/vertical justification.

Use Space-drag or the middle mouse button to pan, wheel to scroll, Ctrl/Command-wheel or pinch to zoom, and the minimap to navigate. The controls include fit-all, fit-selection, 100% zoom, group navigation, and card text search. Settings expose grid snapping, object snapping, resize aspect ratio, minimap visibility, and read-only mode.

| Shortcut | Action |
| --- | --- |
| Ctrl/Command+S | Save canvas |
| Ctrl/Command+Z | Undo |
| Ctrl/Command+Y or Ctrl/Command+Shift+Z | Redo |
| Ctrl/Command+D | Duplicate selection |
| Ctrl/Command+C / V | Copy/paste cards within the open canvas |
| Delete / Backspace | Remove selection and its connections |
| Arrow keys | Move selected cards |
| Shift+arrow | Move farther |
| Shift+1 / Shift+2 | Fit all / fit selection |
| Escape | Finish text editing or clear selection |

Undo history holds the last 100 canvas operations and resets when the editor closes. Read-only mode prevents document changes while retaining navigation and export.

## Saving and references

Changes autosave after a short debounce. Writes are serialized per document, and switching tabs flushes pending changes. The directory receives each draft immediately. Unsaved content is also backed up in browser storage when available; a failed save shows **Retry save**, and reopening a canvas recovers its draft. Browser storage limits can prevent large media drafts from being backed up; API saving still works. The application warns before leaving with a pending save.

Internal references use the note ID as an optional `researchos.noteId` extension. Renaming or moving a referenced note keeps the reference intact. File paths refresh on export. Imported paths resolve within the current source first, then across loaded sources if unique. A deleted ID does not silently resolve to a different file with the same name. References resolve only within notes loaded by the current library/project/panel.

Canvases participate in directory search, pinning, recent notes, graph links, and backlinks. In a rich-text note, use **Embed canvas** or type `![[Name.canvas]]` to insert a preview. Ordinary wiki links can also target canvases.

## Import and export

- **Import .canvas** validates and replaces the current canvas, asking before replacing a nonempty document. Undo restores the previous document. Invalid imports leave it untouched. The import limit is 60 MB.
- **Download .canvas** downloads the JSON document, including ResearchOS extensions. Other JSON Canvas applications use its standard file paths and ignore extensions they do not understand.
- **Canvas + files (.zip)** packages the canvas, referenced notes and nested canvases, and local attachments/backgrounds. It strips internal note IDs so paths can resolve in another application. Export stops with a clear error if distinct files would overwrite the same archive path. Remote URLs remain references.
- **PNG** exports the full canvas at 1× or 2×, the current viewport, or a privacy image hiding text. Very large exports are capped at 64 megapixels; use the viewport or lower scale. Browser restrictions can prevent remote media or embedded pages from appearing in an image.

Attachments are stored in optional ResearchOS extensions inside the canvas, rather than separate backend uploads. Use ZIP export when moving media to Obsidian; a standalone `.canvas` file cannot supply separate attachment files to applications that ignore those extensions. Importing an Obsidian canvas does not grant this web application access to its local vault: matching notes must already exist in ResearchOS, or be added/relinked. ZIP export is supported; ZIP/vault import is not.

## Compatibility boundaries

This is an implementation of the JSON Canvas format and the core visual Canvas workflow, not the Obsidian application runtime. Obsidian Bases (`.base` databases), community plugin behaviors, vault filesystem services, Obsidian-specific commands/branding, and exact mobile long-press menus are not implemented. Generic file nodes referencing those files are preserved. Browser/touch interaction uses the graph editor's gestures; desktop and touch menus are not identical to Obsidian's.

Local SVG and HTML media are not executed. Web embeds run in sandboxed frames, HTML note previews are sanitized, and Markdown cards do not execute embedded HTML. Cyclic previews stop rather than recursively rendering forever.

## Development checks

From `frontend`, run `npm run test:run`, `npm run test:e2e -- canvas.spec.js`, and `npm run build`. The repository currently has a pre-existing KaTeX/Tiptap peer-version mismatch; dependency installation may require `npm install --legacy-peer-deps`. From `backend`, run `.venv/Scripts/python.exe -m pytest tests/test_canvas.py tests/test_note_batch.py tests/test_chat_and_notes_routes.py -q` on Windows.
