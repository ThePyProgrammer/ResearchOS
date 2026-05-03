---
phase: 10-latex-export
plan: "03"
subsystem: frontend/latex-export
tags: [latex, export, zip, bibtex, citation, tiptap, preview, dnd, react-syntax-highlighter, jszip]

# Dependency graph
requires:
  - frontend/src/utils/latexSerializer.js (htmlToLatex from Plan 01)
  - frontend/src/utils/citationKeys.js (makeCitationKey, deduplicateKeys from Plan 01)
  - frontend/src/components/CitationExtension.js (createCitationExtension, extractCitations from Plan 02)
provides:
  - frontend/src/utils/latexTemplates.js: Article/IEEE/NeurIPS preamble templates
  - frontend/src/utils/latexExport.js: buildFullLatex, generateBibContent, folderToLatex, downloadLatexZip
  - frontend/src/components/LaTeXExportModal.jsx: Export dialog with template/title/author/sections/cited-papers/download
  - frontend/src/components/LaTeXPreviewPanel.jsx: Syntax-highlighted .tex preview panel
  - ProjectNotesIDE.jsx: citationExtension wired, LaTeX preview toggle, Export as LaTeX in menu+context, modal state
affects:
  - frontend/src/pages/ProjectNotesIDE.jsx

# Tech tracking
tech-stack:
  added:
    - jszip@3.10.1 (ZIP packaging for .tex + .bib download)
    - react-syntax-highlighter@16.1.1 (LaTeX syntax highlighting in preview panel)
  patterns:
    - "buildFullLatex assembles preamble + title/author + body + bibliography from template object"
    - "generateBibContent mirrors Python bibtex_service.py _paper_to_bibtex logic in JS"
    - "folderToLatex walks folder children in sectionOrder (or alphabetical) and concatenates \\section{name} blocks"
    - "downloadLatexZip uses dynamic import('jszip') to avoid SSR issues"
    - "LaTeX preview debounced 500ms via useRef+setTimeout inside TiptapEditor"
    - "CitationExtension wired with stable callback refs to avoid stale closure issues"

key-files:
  created:
    - frontend/src/utils/latexTemplates.js
    - frontend/src/utils/latexExport.js
    - frontend/src/utils/latexExport.test.js
    - frontend/src/components/LaTeXExportModal.jsx
    - frontend/src/components/LaTeXPreviewPanel.jsx
  modified:
    - frontend/src/pages/ProjectNotesIDE.jsx
    - frontend/package.json

key-decisions:
  - "NeurIPS and conference venues produce @inproceedings entries (not @article) — test updated to match correct behavior"
  - "LaTeX preview toggle updates immediately when activated, then debounces on subsequent editor changes"
  - "citationExtension uses stable ref pattern (same as wikiLinkExtension) to prevent re-creating extension on every render"
  - "onAutoLink refreshes linkedItems list via projectPapersApi.list after linking — ensures citation popup shows newly linked items"
  - "LaTeX export modal gets projectPapers/projectWebsites from the already-fetched linkedItems array (no extra fetch needed)"
  - "getBibtexEntry callback calls papersApi.exportBibtex returning string — works for both papers and websites (endpoint accepts any item ID)"

metrics:
  duration: "11 min"
  completed: "2026-03-20"
  tasks_completed: 2
  files_changed: 7
---

# Phase 10 Plan 03: LaTeX Export UI — End-to-End Summary

**ZIP export pipeline wiring serial and citation extension integration — export modal with DnD section reorder, syntax-highlighted preview, and 94 tests green**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-20T07:34:43Z
- **Completed:** 2026-03-20T07:46:15Z
- **Tasks:** 2 auto + 1 human-verify checkpoint
- **Files modified:** 7

## Accomplishments

- `latexTemplates.js` — Article, IEEE Conference, NeurIPS preamble templates with correct bibliographystyle
- `latexExport.js` — `buildFullLatex` (full .tex assembly), `generateBibContent` (JS mirror of Python bibtex_service), `folderToLatex` (multi-section folder export), `downloadLatexZip` (JSZip async download)
- `LaTeXPreviewPanel.jsx` — read-only syntax-highlighted .tex panel using react-syntax-highlighter (hljs latex)
- `LaTeXExportModal.jsx` — template radio, title/author inputs, DnD section reorder (folder mode), cited papers table with deduped keys, Download .zip button
- `ProjectNotesIDE.jsx` — CitationExtension wired with `getBibtexEntry → papersApi.exportBibtex`, LaTeX preview split-view toggle in toolbar, "Export as LaTeX" in ExportMenu and note/folder context menu, modal state + project papers/websites fed to citation popup

## Task Commits

1. **Task 1: LaTeX templates, export utilities with ZIP packaging, and tests** — `5c075a0` (feat)
2. **Task 2: Export modal, preview panel, and ProjectNotesIDE integration** — `b0114bf` (feat)

## Files Created/Modified

- `frontend/src/utils/latexTemplates.js` — 3 LaTeX preamble templates
- `frontend/src/utils/latexExport.js` — buildFullLatex, generateBibContent, folderToLatex, downloadLatexZip
- `frontend/src/utils/latexExport.test.js` — 18 tests
- `frontend/src/components/LaTeXExportModal.jsx` — export modal (130+ lines)
- `frontend/src/components/LaTeXPreviewPanel.jsx` — preview panel
- `frontend/src/pages/ProjectNotesIDE.jsx` — surgical integration additions
- `frontend/package.json` — jszip, react-syntax-highlighter added

## Decisions Made

- `generateBibContent` correctly emits `@inproceedings` for NeurIPS (conference keyword match) — test updated to reflect this
- LaTeX preview shows immediately on toggle, then debounces on editor input changes
- Citation extension uses stable `useRef` pattern to avoid recreating the extension (same as WikiLinkExtension)
- `getBibtexEntry` uses `papersApi.exportBibtex({ ids: [id] })` — works for both papers and websites since the backend endpoint accepts any item IDs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test expectation for BibTeX entry type**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test expected `@article{` for a paper with venue "NeurIPS" but the implementation correctly detects "NeurIPS" as a conference keyword and emits `@inproceedings`
- **Fix:** Updated test to expect `@inproceedings{` for NeurIPS conference papers and added a separate `@article` test for a journal paper with venue "Nature"
- **Files modified:** `frontend/src/utils/latexExport.test.js`
- **Commit:** 5c075a0 (part of Task 1 commit)

## Awaiting Human Verification

Task 3 is a human-verify checkpoint. The user needs to:
1. Start the dev server and open the Project Notes IDE
2. Test `@`-mention citation insertion
3. Test LaTeX preview toggle
4. Test Export as LaTeX from toolbar and context menu
5. Verify .zip download contains valid .tex + .bib files
6. Test folder export with section reordering
7. Test citation key deduplication

## Self-Check: PASSED

- frontend/src/utils/latexTemplates.js: FOUND
- frontend/src/utils/latexExport.js: FOUND
- frontend/src/utils/latexExport.test.js: FOUND
- frontend/src/components/LaTeXExportModal.jsx: FOUND
- frontend/src/components/LaTeXPreviewPanel.jsx: FOUND
- commit 5c075a0: FOUND
- commit b0114bf: FOUND
- 94 tests passing across all 4 phase test files
