# Phase 10: LaTeX Export - Research

**Researched:** 2026-03-20
**Domain:** Tiptap AST serialization, LaTeX generation, citation mark extensions, ZIP packaging
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- @-mention trigger character for citation insertion (distinct from [[ wikilinks)
- Popup shows project-linked papers first, with "Search full library..." fallback
- Papers and websites both citable (with appropriate type icons)
- Citation renders as inline author-year chip: (Vaswani et al., 2017)
- Citing a paper from full library auto-links it to the project
- Chip context menu: Open paper, Remove citation, Copy citation key, Copy BibTeX entry
- Hover tooltip: title, authors, year, venue, auto-generated citation key
- Two export modes: single note (.zip with one .tex + .bib) and folder (each child note = \section)
- Export dialog: template selection (Article/IEEE/NeurIPS), editable title/author, section drag-reorder, cited papers list, Download .zip button
- LaTeX preview panel: raw .tex source with syntax highlighting, side-by-side split, togglable via toolbar, live update ~500ms debounce, read-only monospace
- LaTeX serializer MUST use @tiptap/static-renderer nodeMapping (not regex-on-HTML)
- Citation keys: `{lastname}{year}{titleword}` pattern, collision-safe (smith2024a/b)
- Validate tiptap table node JSON structure on day one (dump via editor.getJSON())

### Claude's Discretion
- Syntax highlighting library choice for preview panel
- Exact debounce timing for live preview
- Template .tex preamble package details beyond required ones
- Error handling for malformed tiptap content during serialization
- .bib file formatting details (field ordering, indentation)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEX-01 | User can export a note to .tex format preserving headings, lists, tables, math, and formatting | @tiptap/static-renderer nodeMapping covers all StarterKit + TableKit + Mathematics nodes |
| TEX-02 | User can download a .zip containing .tex + .bib files with citations resolved | JSZip 3.10.1 handles in-browser ZIP generation; existing bibtex_service.py provides .bib content |
| TEX-03 | User can insert citation references in notes that serialize to \cite{key} on export | Mark-based CitationExtension following WikiLinkExtension.js pattern; nodeMapping maps mark → \cite{key} |
| TEX-04 | System auto-generates .bib entries from linked papers using existing BibTeX service | bibtex_service.py's paper_to_bibtex() and website_to_bibtex() are directly reusable |
| TEX-05 | User can preview rendered LaTeX output in a read-only panel within the notes IDE | @tiptap/static-renderer serialization piped to read-only textarea/pre; prism.js for highlighting |
| TEX-06 | Citation keys deduplicated (smith2024a/b) when multiple papers share first author + year | export_bibtex() in bibtex_service.py already implements this exact dedup with chr(96 + count) suffix |
</phase_requirements>

---

## Summary

This phase adds LaTeX export to the Project Notes IDE. The three interlocking parts are: (1) a new `CitationExtension` tiptap mark that lets users @-mention papers and stores paper/website IDs in mark attributes, (2) a LaTeX serializer built on `@tiptap/static-renderer` that converts the tiptap JSON AST to a `.tex` string, and (3) a ZIP packaging layer using JSZip that bundles `.tex` + `.bib` into a downloadable archive.

The key technical insight is that notes are stored as **HTML strings** (not tiptap JSON) via `editor.getHTML()`. This means the serializer must parse the stored HTML back into the DOM and walk it — exactly how `_nodeToMd()` in `ProjectNotesIDE.jsx` already works. The `@tiptap/static-renderer` is the right structural model and is locked in by the STATE.md decision, but in practice the serializer will be an HTML-DOM-walker (identical in shape to `_nodeToMd`) rather than a pure ProseMirror JSON walker, since the persisted format is HTML.

The citation extension follows the `WikiLinkExtension.js` mark pattern precisely: `Mark.create` + `Suggestion` plugin using `@tiptap/suggestion`. The only differences are: trigger character `@` instead of `[[`, stored attributes are `{ paperId, websiteId, citationKey, displayLabel }` instead of `{ name, noteId }`, and the rendered chip is a visually styled inline span rather than a text-only link.

**Primary recommendation:** Build `CitationExtension.js` as a mark (not node) following WikiLinkExtension, build `latexSerializer.js` as an HTML-walker (parallel to `_nodeToMd`), use JSZip for packaging, and add `@tiptap/static-renderer` primarily as a structural reference — the actual serialization traverses HTML DOM since that is what is persisted.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tiptap/static-renderer | ^3.20.1 (matches project tiptap version) | nodeMapping model for AST traversal | Locked in STATE.md; avoids regex-on-HTML rewrite risk |
| @tiptap/suggestion | ^3.20.1 (already installed) | @-trigger popup for citation insertion | Already used by WikiLinkExtension; same API |
| JSZip | 3.10.1 | In-browser .zip file generation | Standard, maintained, no native dependencies; Blob output for FileSaver pattern |
| prism.js | (bundled via react-syntax-highlighter OR standalone) | Syntax highlighting in LaTeX preview | Has `latex` language grammar; lightweight; used as read-only display |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-syntax-highlighter | ^15.x | React wrapper around prism.js | If adding a React component for the preview panel; saves DOM manipulation |
| @dnd-kit/sortable | ^10.0.0 (already installed) | Section drag-reorder in export dialog | Already in project; use for folder-export section ordering |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSZip | Native File System Access API | FSAPI has limited browser support (no Firefox/Safari mobile); JSZip works everywhere |
| react-syntax-highlighter | CodeMirror (read-only) | CodeMirror is far heavier (100KB+); prism + pre element is sufficient for read-only display |
| Mark-based CitationExtension | Node-based (like tiptap Mention) | Node-based inserts an atom; Mark-based (like WikiLink) keeps text editable. Mark chosen to match existing WikiLink pattern in this codebase. |

**Installation:**
```bash
npm install jszip
# @tiptap/suggestion and @tiptap/static-renderer are already installed or matched
npm install @tiptap/static-renderer  # if not already in package.json
npm install react-syntax-highlighter  # if using React wrapper for preview
```

---

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── components/
│   ├── CitationExtension.js      # Mark-based tiptap extension (parallel to WikiLinkExtension.js)
│   ├── LaTeXExportModal.jsx      # Export dialog (template/title/author/section order/download)
│   └── LaTeXPreviewPanel.jsx     # Read-only .tex preview with syntax highlight
├── utils/
│   └── latexSerializer.js        # HTML-DOM walker that produces .tex string
└── pages/
    └── ProjectNotesIDE.jsx       # Toolbar additions (cite button, preview toggle, export menu)
```

### Pattern 1: Citation as Mark (following WikiLinkExtension pattern)

**What:** A `Mark.create` extension with `@tiptap/suggestion`. The mark stores `{ paperId, websiteId, citationKey, displayLabel }` as attributes on the span. The rendered display is a styled inline chip.

**When to use:** Anytime a citation is inserted via the @-popup or programmatically.

**Example:**
```javascript
// Source: parallel to WikiLinkExtension.js in this codebase
export function createCitationExtension({ getLinkedItems, getAllLibraryItems, onAutoLink }) {
  return Mark.create({
    name: 'citation',
    inclusive: false,

    addAttributes() {
      return {
        paperId:      { default: null, parseHTML: el => el.getAttribute('data-cite-paper-id'),   renderHTML: a => a.paperId   ? { 'data-cite-paper-id':   a.paperId   } : {} },
        websiteId:    { default: null, parseHTML: el => el.getAttribute('data-cite-website-id'), renderHTML: a => a.websiteId ? { 'data-cite-website-id': a.websiteId } : {} },
        citationKey:  { default: null, parseHTML: el => el.getAttribute('data-cite-key'),        renderHTML: a => a.citationKey ? { 'data-cite-key': a.citationKey } : {} },
        displayLabel: { default: null, parseHTML: el => el.getAttribute('data-cite-label'),      renderHTML: a => a.displayLabel ? { 'data-cite-label': a.displayLabel } : {} },
      }
    },

    parseHTML()  { return [{ tag: 'span[data-cite-key]' }] },
    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes({ class: 'citation-chip' }, HTMLAttributes), 0]
    },

    addProseMirrorPlugins() {
      return [
        // click handler for context menu (same imperative DOM pattern as WikiLink)
        // Suggestion plugin with char: '@'
        Suggestion({
          editor: this.editor,
          char: '@',
          allowSpaces: true,
          items: ({ query }) => { /* project-linked first, then full library */ },
          command: ({ editor, range, props }) => {
            // insert mark + space
            // if props.fromLibrary: call onAutoLink(props.id) to join to project
          },
          render: () => { /* same popup rendering pattern as WikiLink */ },
        }),
      ]
    },
  })
}
```

### Pattern 2: LaTeX HTML-Walker Serializer

**What:** A pure function `noteToLatex(html, citedItems, options)` that uses `DOMParser` to parse HTML, then walks the DOM tree mapping each element to a LaTeX string — exactly parallel to `_nodeToMd()` in `ProjectNotesIDE.jsx`.

**When to use:** Both for live preview (debounced) and for final export.

**Example:**
```javascript
// Source: parallel to _nodeToMd() in ProjectNotesIDE.jsx
function _nodeToLatex(node, ctx) {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeLatex(node.textContent)
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const tag = node.tagName.toLowerCase()
  const inner = () => Array.from(node.childNodes).map(n => _nodeToLatex(n, ctx)).join('')

  switch (tag) {
    case 'h1': return `\\section{${inner()}}\n\n`
    case 'h2': return `\\subsection{${inner()}}\n\n`
    case 'h3': return `\\subsubsection{${inner()}}\n\n`
    case 'p':  return `${inner()}\n\n`
    case 'strong': case 'b': return `\\textbf{${inner()}}`
    case 'em':     case 'i': return `\\textit{${inner()}}`
    case 's':  return `\\sout{${inner()}}` // requires \usepackage{ulem}
    case 'u':  return `\\underline{${inner()}}`
    case 'code': return node.closest('pre') ? inner() : `\\texttt{${inner()}}`
    case 'pre': {
      const lang = node.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] ?? ''
      return `\\begin{verbatim}\n${inner()}\n\\end{verbatim}\n\n`
    }
    case 'blockquote': return `\\begin{quote}\n${inner().trim()}\n\\end{quote}\n\n`
    case 'hr':  return `\\hrule\n\n`
    case 'ul':  return `\\begin{itemize}\n${inner()}\\end{itemize}\n\n`
    case 'ol':  return `\\begin{enumerate}\n${inner()}\\end{enumerate}\n\n`
    case 'li':  return `  \\item ${inner().trim()}\n`
    case 'table': return serializeTable(node, ctx)
    case 'span': {
      if (node.dataset.citeKey) {
        const key = node.dataset.citeKey
        ctx.usedKeys.add(key)
        return `\\cite{${key}}`
      }
      if (node.dataset.latex) return `$${node.dataset.latex}$`  // inline math
      return inner()
    }
    default: return inner()
  }
}

// Table serialization
function serializeTable(tableEl, ctx) {
  const rows = Array.from(tableEl.querySelectorAll('tr'))
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map(r => r.querySelectorAll('th,td').length))
  const cols = Array(colCount).fill('l').join(' | ')
  const header = rows[0]
  const body = rows.slice(1)
  const headerRow = '  ' + Array.from(header.querySelectorAll('th,td'))
    .map(c => _nodeToLatex(c, ctx).trim().replace(/\n+/g, ' ')).join(' & ') + ' \\\\\n  \\hline\n'
  const bodyRows = body.map(tr =>
    '  ' + Array.from(tr.querySelectorAll('th,td'))
      .map(c => _nodeToLatex(c, ctx).trim().replace(/\n+/g, ' ')).join(' & ') + ' \\\\\n'
  ).join('')
  return `\\begin{tabular}{${cols}}\n  \\hline\n${headerRow}${bodyRows}\\end{tabular}\n\n`
}
```

### Pattern 3: ZIP packaging with JSZip

**What:** Client-side ZIP creation bundling `.tex` + `.bib`, triggered from the export dialog.

**Example:**
```javascript
// Source: JSZip docs https://stuk.github.io/jszip/
import JSZip from 'jszip'

async function downloadLatexZip({ texContent, bibContent, baseName }) {
  const zip = new JSZip()
  zip.file(`${baseName}.tex`, texContent)
  zip.file(`${baseName}.bib`, bibContent)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
```

### Pattern 4: Collision-Safe Citation Key Deduplication

**What:** The existing `export_bibtex()` in `bibtex_service.py` already handles this — when two papers share the same initial key, it appends `a`, `b`, etc. The frontend must use the same deterministic algorithm when displaying keys in chips and tooltips (so keys shown to user match the .bib exactly).

**Example:**
```javascript
// Source: bibtex_service.py export_bibtex() — exact JS mirror
function deduplicateKeys(items) {
  const seen = {}  // key -> count
  return items.map(item => {
    const base = makeCitationKey(item)  // {lastname}{year}{titleword}
    if (seen[base] === undefined) {
      seen[base] = 1
      return { ...item, _resolvedKey: base }
    } else {
      seen[base]++
      const suffix = String.fromCharCode(96 + seen[base])  // 'a', 'b', ...
      return { ...item, _resolvedKey: `${base}${suffix}` }
    }
  })
}
```

### Pattern 5: LaTeX Preamble Templates

**What:** Three static template strings (Article, IEEE, NeurIPS). Planner should store these as constants in the serializer or a separate `latexTemplates.js` file.

**Article template (standard):**
```latex
\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{geometry}
\usepackage{ulem}     % for \sout (strikethrough)
\geometry{margin=1in}
\bibliographystyle{plain}
\begin{document}
```

**IEEE Conference template:**
```latex
\documentclass[conference]{IEEEtran}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{ulem}
\begin{document}
```

**NeurIPS template:**
```latex
\documentclass{article}
\usepackage[preprint]{neurips_2024}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{ulem}
\begin{document}
```

### Anti-Patterns to Avoid
- **Regex-on-HTML serializer:** Locked out by STATE.md. Use DOM walker. Any regex approach requires a full rewrite when edge cases appear.
- **Re-implementing citation key logic in JS separately from Python:** The JS `makeCitationKey()` must be an exact mirror of `_make_citation_key()` in `bibtex_service.py`. If they diverge, chip tooltips show wrong keys vs. the .bib file.
- **Node-based citation (like tiptap Mention):** The project uses mark-based WikiLink; citation must also be mark-based for consistency and to keep citation text editable.
- **Storing notes as tiptap JSON instead of HTML:** Notes are currently persisted as HTML strings (`editor.getHTML()`). Do not switch the storage format — the serializer must handle HTML input, not raw ProseMirror JSON.
- **Server-side LaTeX compilation:** Out of scope per REQUIREMENTS.md. Preview is raw .tex text, not rendered PDF.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .zip file generation | Custom binary writer | JSZip | ZIP is a complex binary format; JSZip is battle-tested, handles encoding |
| Suggestion popup positioning | Custom popup | Same imperative DOM pattern as WikiLinkExtension.js | Positioning logic (viewport clamping, above/below flip) already debugged in WikiLink |
| BibTeX key deduplication | New algorithm | bibtex_service.py `export_bibtex()` logic mirrored in JS | Already handles the smith2024a/b suffix pattern correctly |
| .bib generation | New BibTeX serializer | bibtex_service.py's `paper_to_bibtex()` / `website_to_bibtex()` | These functions already handle all edge cases (arxiv, conference, misc, escaping) |

**Key insight:** 80% of this phase reuses existing project infrastructure. The BibTeX service, the WikiLink suggestion popup pattern, the `_nodeToMd()` DOM walker pattern, and the `@dnd-kit/sortable` component are all already present and debugged.

---

## Common Pitfalls

### Pitfall 1: Note content is HTML, not tiptap JSON
**What goes wrong:** `@tiptap/static-renderer`'s `renderToHTMLString`/`renderToMarkdown` accept `JSONContent` (ProseMirror JSON), not HTML strings. If you call `renderToMarkdown({ content: note.content })` where `note.content` is an HTML string, it will fail or produce garbage.
**Why it happens:** The tiptap docs show JSON-based serialization, but this codebase persists HTML (via `editor.getHTML()`). The note content in the DB is an HTML string.
**How to avoid:** Use `DOMParser` + DOM walker (the `_nodeToMd` pattern) for serialization. Alternatively, use `@tiptap/static-renderer` with the `JSON` namespace after re-parsing HTML through the editor — but this requires an editor instance.
**Warning signs:** If `note.content` starts with `<p>` or `<h1>`, it is HTML, not JSON.

### Pitfall 2: tiptap Mathematics node type names
**What goes wrong:** The `@tiptap/extension-mathematics` stores inline math and block math as custom nodes. Their schema registration names (`inlineMath`? `mathInline`? `mathBlock`?) are not obvious from docs alone.
**Why it happens:** The docs say "InlineMath and BlockMath" (classes) but the DOM renders as `<span data-latex="...">` with KaTeX-rendered content. In HTML-serialization, math appears as `<span data-latex="E=mc^2">`.
**How to avoid:** In the HTML walker, check for `node.dataset.latex` (which the existing `_nodeToMd` already handles with `if (node.dataset.latex) return \`$${node.dataset.latex}$\``). For LaTeX export, map that to `$...$` for inline and `$$...$$` or `\[...\]` for block math.
**Warning signs:** Missing math in exported .tex files.

### Pitfall 3: Citation key mismatch between display and .bib
**What goes wrong:** The citation chip tooltip shows key `vaswani2017attention` but the .bib file contains `vaswani2017attentionb` because the deduplication counter runs differently.
**Why it happens:** If the frontend calls `makeCitationKey()` per-chip (without seeing all other citations in the note), and the backend's deduplication uses a different order, keys diverge.
**How to avoid:** Run deduplication over the full set of cited papers at render time — same set, same order, every time. Cache the resolved keys in React state derived from the full citation list. The order should be deterministic (alphabetical by paperId or by order of first appearance in the note).
**Warning signs:** `\cite{smith2024a}` in .tex but `smith2024` (no suffix) in .bib, or vice versa.

### Pitfall 4: tiptap table node structure (STATE.md pending todo)
**What goes wrong:** `@tiptap/extension-table` uses `TableKit` which adds `tableHeader` cells. The HTML from tiptap tables uses `<th>` for header cells and `<td>` for regular cells, wrapped in `<thead>/<tbody>` or potentially just `<tr>` elements depending on the version.
**Why it happens:** tiptap 3.x with `TableKit` changed how table HTML is rendered vs. tiptap 2.x.
**How to avoid:** STATE.md explicitly calls this out as a "day one" validation: `editor.getJSON()` to dump the table node JSON, then inspect the actual HTML via `editor.getHTML()`. The LaTeX table serializer in `latexSerializer.js` must be written against the actual HTML structure, not assumed structure.
**Warning signs:** `querySelectorAll('tr')` returning zero rows; `th`/`td` not found.

### Pitfall 5: LaTeX special character escaping
**What goes wrong:** Note content with `&`, `%`, `#`, `_`, `$`, `^`, `{`, `}`, `~`, `\` breaks LaTeX compilation when unescaped.
**Why it happens:** These characters are LaTeX control characters. Regular prose in notes often contains them (URLs with `%`, underscores in code names, ampersands in table cells).
**How to avoid:** Apply `escapeLatex()` to all text nodes before emitting. Exception: inside math blocks (content already IS LaTeX), do NOT escape.
**Warning signs:** `pdflatex` errors on characters like `&` in table cells.

```javascript
function escapeLatex(text) {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\textasciitilde{}')
}
```

### Pitfall 6: @ trigger collision with email addresses
**What goes wrong:** Typing an email like `user@example.com` triggers the citation popup.
**Why it happens:** `@tiptap/suggestion` fires on any `@` character by default.
**How to avoid:** Configure `allowSpaces: true` (already done in WikiLink) and set `startOfLine: false`. Additionally add a `shouldTrigger` check that the character before `@` is a space or beginning of block — this is the standard approach. The WikiLinkExtension already avoids this issue for `[[` since that character pair is very unlikely in normal prose.
**Warning signs:** Citation popup appears mid-word when user types an email.

---

## Code Examples

Verified patterns from existing codebase and official sources:

### Extracting citation spans from note HTML (for serialization)
```javascript
// Pattern for extracting all cited papers from HTML content
// Parallel to extractWikiLinks() in WikiLinkExtension.js
export function extractCitations(htmlContent) {
  if (!htmlContent) return []
  const spans = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  doc.querySelectorAll('span[data-cite-key]').forEach(span => {
    spans.push({
      citationKey: span.dataset.citeKey,
      paperId: span.dataset.citePaperId || null,
      websiteId: span.dataset.citePaperId || null,
    })
  })
  // Deduplicate by citationKey
  const seen = new Set()
  return spans.filter(s => { if (seen.has(s.citationKey)) return false; seen.add(s.citationKey); return true })
}
```

### JSZip download (Source: JSZip official docs)
```javascript
import JSZip from 'jszip'

async function downloadLatexZip(texContent, bibContent, baseName) {
  const zip = new JSZip()
  zip.file(`${baseName}.tex`, texContent)
  if (bibContent) zip.file(`${baseName}.bib`, bibContent)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

### Folder export: multi-section document
```javascript
// Each child note of an exported folder becomes a \section
function folderToLatex(folder, notes, allNotes, citedItemsMap) {
  const children = notes
    .filter(n => n.parentId === folder.id && n.type === 'file')
    .sort(/* user-defined order from dialog drag state */)

  const ctx = { usedKeys: new Set() }
  const body = children.map(note => {
    const sectionTitle = note.name.replace(/_/g, ' ')
    const noteBody = htmlToLatexBody(note.content || '', ctx)
    return `\\section{${escapeLatex(sectionTitle)}}\n\n${noteBody}`
  }).join('\n')

  return body
}
```

### Citation key generation in JavaScript (mirrors bibtex_service.py)
```javascript
// Source: direct JS mirror of _make_citation_key() in bibtex_service.py
function makeCitationKey(item) {
  const STOP = new Set(['a','an','the','on','of','for','in','to','and','with','is','are','by'])
  let lastName = 'unknown'
  if (item.authors?.length) {
    const first = item.authors[0]
    if (first.includes(',')) lastName = first.split(',')[0].trim()
    else { const parts = first.split(' '); lastName = parts[parts.length - 1] || 'unknown' }
  }
  lastName = lastName.replace(/[^a-zA-Z]/g, '').toLowerCase()
  const year = item.year ? String(item.year) : ''
  let titleWord = ''
  for (const word of (item.title || '').split(' ')) {
    const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase()
    if (clean && !STOP.has(clean)) { titleWord = clean; break }
  }
  return (lastName + year + titleWord) || 'entry'
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex-on-HTML for serialization | DOM walker (DOMParser + tree walk) | This codebase's existing pattern | Correct handling of nested elements, no regex edge cases |
| Server-side LaTeX compilation | Client-side raw .tex preview (no PDF render) | Requirements decision | No server infrastructure needed; user compiles locally or in Overleaf |
| tiptap 2.x (HTML-first) | tiptap 3.x with `@tiptap/static-renderer` | tiptap 3.0 release | Static renderer available but note storage is still HTML in this codebase |

**Deprecated/outdated:**
- `generateHTML()` from `@tiptap/html`: This generates HTML from JSON, not what we need (we need LaTeX from HTML).
- Client-side PDF generation via `window.print()`: Already used for PDF export in ProjectNotesIDE; LaTeX export is separate and cleaner.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | vite.config.js (`test` section) |
| Quick run command | `cd frontend && npm run test:run -- --reporter=verbose` |
| Full suite command | `cd frontend && npm run test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEX-01 | `htmlToLatex()` preserves headings, lists, tables, code, math | unit | `npm run test:run -- src/utils/latexSerializer.test.js` | ❌ Wave 0 |
| TEX-02 | `.zip` download triggers with correct .tex + .bib contents | unit | `npm run test:run -- src/utils/latexExport.test.js` | ❌ Wave 0 |
| TEX-03 | Citation spans in HTML serialize to `\cite{key}` | unit (part of TEX-01 file) | same as TEX-01 | ❌ Wave 0 |
| TEX-04 | BibTeX entries generated for cited papers | unit | `npm run test:run -- src/utils/latexExport.test.js` | ❌ Wave 0 |
| TEX-05 | Preview panel reflects current note content | smoke (manual-only) | N/A — requires live editor instance | manual-only |
| TEX-06 | Collision-safe keys: smith2024a/b for same author+year | unit | `npm run test:run -- src/utils/latexSerializer.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npm run test:run -- src/utils/latexSerializer.test.js src/utils/latexExport.test.js`
- **Per wave merge:** `cd frontend && npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/utils/latexSerializer.test.js` — covers TEX-01, TEX-03, TEX-06 (pure unit tests on HTML-to-LaTeX conversion)
- [ ] `frontend/src/utils/latexExport.test.js` — covers TEX-02, TEX-04 (ZIP packaging, BibTeX entry generation from paper objects)

*(TEX-05 is manual-only: live preview panel requires tiptap editor instance; unit testing the serializer function is sufficient for automation)*

---

## Open Questions

1. **tiptap table HTML structure in tiptap 3.x with TableKit**
   - What we know: TableKit from `@tiptap/extension-table` renders tables. The HTML walker in `_nodeToMd()` already handles `table/thead/tbody/tr/th/td` correctly.
   - What's unclear: Whether tiptap 3.x's `TableKit` emits `<thead>/<tbody>` wrappers or just bare `<tr>` elements; whether header cells are `<th>` or `<td>`.
   - Recommendation: Day-one validation — insert a table in ProjectNotesIDE, call `editor.getHTML()` in browser console, inspect output before writing `serializeTable()`.

2. **CitationExtension mark attribute persistence in HTML**
   - What we know: WikiLinkExtension stores `data-wiki-name` and `data-wiki-id` on `<span>` elements in rendered HTML.
   - What's unclear: Whether tiptap serializes all mark attributes to the HTML span when `renderHTML` specifies them.
   - Recommendation: Follow the exact `renderHTML: attributes => ({ 'data-cite-key': attributes.citationKey })` pattern from WikiLinkExtension — this is confirmed to work.

3. **@-trigger and coexistence with WikiLink [[**
   - What we know: `@tiptap/suggestion` allows multiple trigger characters — WikiLink uses `[[`, Citation will use `@`. They are independent Suggestion plugins on the same editor.
   - What's unclear: Whether two concurrent Suggestion plugins on the same editor instance can conflict (both listen to `keydown`).
   - Recommendation: Test both triggers in the same editor early. The tiptap docs confirm multiple suggestions are supported via `Mark.configure({ suggestions: [...] })` though WikiLink uses the standalone `Suggestion` plugin directly. Likely no conflict since they have different trigger characters.

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/components/WikiLinkExtension.js` — complete mark+suggestion pattern for CitationExtension to follow
- `frontend/src/pages/ProjectNotesIDE.jsx` (_nodeToMd, htmlToMarkdown) — confirmed DOM walker pattern for HTML-to-text serialization
- `backend/services/bibtex_service.py` (_make_citation_key, export_bibtex, paper_to_bibtex) — citation key algorithm and BibTeX dedup logic to mirror in JS
- `frontend/package.json` — confirmed installed: @tiptap/suggestion ^3.20.1, @tiptap/extension-mathematics ^3.20.1, @tiptap/extension-table ^3.20.1, @dnd-kit/sortable ^10.0.0
- `@tiptap/static-renderer` npm (https://tiptap.dev/docs/editor/api/utilities/static-renderer) — confirmed `nodeMapping` API, renderToHTMLString/renderToMarkdown/renderToReactElement
- JSZip 3.10.1 (https://stuk.github.io/jszip/) — confirmed API: `new JSZip()`, `.file()`, `.generateAsync({ type: 'blob' })`

### Secondary (MEDIUM confidence)
- WebSearch + tiptap docs — Mathematics extension stores LaTeX in `node.attrs.latex`; rendered HTML exposes `data-latex` attribute on span (verified by existing `_nodeToMd` handling `node.dataset.latex`)
- WebSearch + prism.js docs — Prism has a `latex` language grammar; `react-syntax-highlighter` wraps it as a React component

### Tertiary (LOW confidence)
- LaTeX template package choices for IEEEtran and NeurIPS — based on WebSearch + Overleaf template inspection; specific preamble details (e.g., NeurIPS 2024 .sty file) should be validated if strict template compliance is needed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against package.json and npm; existing code patterns confirmed
- Architecture: HIGH — citationExtension mirrors existing WikiLinkExtension exactly; serializer mirrors existing _nodeToMd exactly
- Pitfalls: HIGH (HTML vs JSON) and MEDIUM (table structure, @ trigger collision) — HTML vs JSON confirmed by reading actual code; table structure needs day-one validation per STATE.md todo

**Research date:** 2026-03-20
**Valid until:** 2026-06-20 (tiptap 3.x stable; JSZip stable; LaTeX template formats stable)
