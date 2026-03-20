/**
 * LaTeX export utilities: ZIP packaging, BibTeX generation, and document assembly.
 *
 * Exports:
 *   buildFullLatex({ body, template, title, author, baseName, usedKeys })
 *   generateBibContent(citedItems)
 *   folderToLatex(folder, sectionOrder, allNotes)
 *   downloadLatexZip({ texContent, bibContent, baseName })
 */

import { TEMPLATES } from './latexTemplates.js'
import { makeCitationKey, deduplicateKeys } from './citationKeys.js'
import { htmlToLatex } from './latexSerializer.js'

// ── BibTeX author format ───────────────────────────────────────────────────────

/**
 * Format an authors array to "Last, First and Last, First" format for BibTeX.
 * Mirrors the Python bibtex_service.py author formatting.
 */
function _formatAuthors(authors) {
  if (!authors || !authors.length) return ''
  return authors.join(' and ')
}

/**
 * Determine BibTeX entry type for a paper based on venue keywords.
 * Matches Python bibtex_service.py logic.
 */
function _bibType(item) {
  if (item.type === 'website') return 'misc'
  const venue = (item.venue || item.journal || item.booktitle || '').toLowerCase()
  const conference = ['proceedings', 'conference', 'workshop', 'symposium', 'icml', 'neurips',
    'nips', 'iclr', 'cvpr', 'iccv', 'eccv', 'emnlp', 'acl', 'naacl', 'aaai', 'ijcai',
    'sigkdd', 'sigmod', 'vldb', 'osdi', 'sosp', 'nsdi', 'usenix']
  if (conference.some(kw => venue.includes(kw))) return 'inproceedings'
  return 'article'
}

/**
 * Generate a single BibTeX entry string for one item.
 */
function _toBibEntry(item, resolvedKey) {
  const type = _bibType(item)
  const fields = []

  if (item.title) fields.push(`  title={${item.title}}`)
  if (item.authors && item.authors.length > 0) {
    fields.push(`  author={${_formatAuthors(item.authors)}}`)
  }
  if (item.year) fields.push(`  year={${item.year}}`)

  // Journal or conference field
  if (type === 'article') {
    const journal = item.venue || item.journal || ''
    if (journal) fields.push(`  journal={${journal}}`)
  } else if (type === 'inproceedings') {
    const booktitle = item.venue || item.booktitle || ''
    if (booktitle) fields.push(`  booktitle={${booktitle}}`)
  }

  if (item.doi)    fields.push(`  doi={${item.doi}}`)
  if (item.arxivId || item.arxiv_id) {
    fields.push(`  eprint={${item.arxivId || item.arxiv_id}}`)
  }

  const url = item.url || item.pdfUrl || item.pdf_url || ''
  if (url) fields.push(`  url={${url}}`)
  if (item.abstract) fields.push(`  abstract={${item.abstract}}`)

  return `@${type}{${resolvedKey},\n${fields.join(',\n')}\n}`
}

// ── Exported functions ─────────────────────────────────────────────────────────

/**
 * Generate BibTeX content from an array of cited paper/website items.
 * Deduplicates citation keys using deduplicateKeys().
 *
 * @param {Array} citedItems — array of Paper or Website objects
 * @returns {string} full .bib content
 */
export function generateBibContent(citedItems) {
  if (!citedItems || citedItems.length === 0) return ''
  const withKeys = deduplicateKeys(citedItems)
  const entries = withKeys.map(item => _toBibEntry(item, item._resolvedKey))
  return entries.join('\n\n')
}

/**
 * Assemble a complete .tex document from parts.
 *
 * @param {{ body, template, title, author, baseName, usedKeys }} options
 * @returns {string} complete .tex source
 */
export function buildFullLatex({ body, template, title, author, baseName, usedKeys }) {
  const tpl = TEMPLATES[template] || TEMPLATES.article
  const lines = []

  // Preamble
  lines.push(tpl.preamble)

  // Title and author (if provided)
  if (title) lines.push(`\\title{${title}}`)
  if (author) lines.push(`\\author{${author}}`)
  if (title || author) lines.push('')

  // Document body
  lines.push('\\begin{document}')
  if (title) lines.push('\\maketitle')
  lines.push('')
  lines.push(body)

  // Bibliography (only if citations were used)
  if (usedKeys && usedKeys.size > 0) {
    lines.push(`\\bibliographystyle{${tpl.bibliographystyle}}`)
    lines.push(`\\bibliography{${baseName}}`)
    lines.push('')
  }

  lines.push('\\end{document}')
  return lines.join('\n')
}

/**
 * Recursively convert a folder's children to LaTeX sections/subsections.
 *
 * Folders define the document structure — a folder becomes a section heading
 * and its file children are concatenated as content under that heading.
 * Top-level files (not inside a subfolder) still get their own section heading.
 *
 * @param {object} folder      — the folder note object
 * @param {string[]|null} sectionOrder — array of note IDs in desired order, or null for alphabetical
 * @param {object[]} allNotes  — flat array of all notes (for finding children)
 * @param {number} [depth=0]   — nesting depth: 0=\section, 1=\subsection, 2=\subsubsection
 * @returns {{ body: string, usedKeys: Set<string> }}
 */
export function folderToLatex(folder, sectionOrder, allNotes, depth = 0) {
  const SECTION_CMDS = ['section', 'subsection', 'subsubsection']
  const sectionCmd = SECTION_CMDS[Math.min(depth, SECTION_CMDS.length - 1)]

  // Get all direct children (files + subfolders)
  const children = (allNotes || []).filter(n => n.parentId === folder.id)

  if (children.length === 0) return { body: '', usedKeys: new Set() }

  // Order children by sectionOrder if provided, otherwise folders first then alphabetical
  let orderedChildren
  if (sectionOrder && sectionOrder.length > 0) {
    const childMap = new Map(children.map(c => [c.id, c]))
    orderedChildren = sectionOrder
      .map(id => childMap.get(id))
      .filter(Boolean)
    const inOrder = new Set(sectionOrder)
    for (const child of children) {
      if (!inOrder.has(child.id)) orderedChildren.push(child)
    }
  } else {
    orderedChildren = [...children].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  const allUsedKeys = new Set()
  const sections = []

  // Separate files and subfolders
  const files = orderedChildren.filter(n => n.type !== 'folder')
  const subfolders = orderedChildren.filter(n => n.type === 'folder')

  // Files contribute content. At root level (depth 0) each file gets its own
  // section heading. Inside a subfolder the folder IS the heading, so files
  // are plain content concatenated under it.
  if (depth === 0) {
    // Root: interleave files (each gets \section) and subfolders (each gets \section + recurse)
    for (const note of orderedChildren) {
      if (note.type === 'folder') {
        const sub = _renderFolder(note, allNotes, depth, sectionCmd, allUsedKeys)
        sections.push(sub)
      } else {
        const { latex, usedKeys } = htmlToLatex(note.content || '')
        for (const key of usedKeys) allUsedKeys.add(key)
        sections.push(`\\${sectionCmd}{${note.name}}\n\n${latex}`)
      }
    }
  } else {
    // Nested: files are plain content (no heading), subfolders get section headings
    for (const f of files) {
      const { latex, usedKeys } = htmlToLatex(f.content || '')
      for (const key of usedKeys) allUsedKeys.add(key)
      sections.push(latex)
    }
    for (const sf of subfolders) {
      const sub = _renderFolder(sf, allNotes, depth, sectionCmd, allUsedKeys)
      sections.push(sub)
    }
  }

  return { body: sections.join('\n'), usedKeys: allUsedKeys }
}

/** Render a subfolder as a section heading + its recursive content. */
function _renderFolder(folder, allNotes, parentDepth, sectionCmd, allUsedKeys) {
  const SECTION_CMDS = ['section', 'subsection', 'subsubsection']
  const childCmd = SECTION_CMDS[Math.min(parentDepth + 1, SECTION_CMDS.length - 1)]

  // Get this folder's direct children
  const children = (allNotes || []).filter(n => n.parentId === folder.id)
  const files = children.filter(n => n.type !== 'folder').sort((a, b) => a.name.localeCompare(b.name))
  const subfolders = children.filter(n => n.type === 'folder').sort((a, b) => a.name.localeCompare(b.name))

  const parts = []

  // Files → plain content under this folder's heading
  for (const f of files) {
    const { latex, usedKeys } = htmlToLatex(f.content || '')
    for (const key of usedKeys) allUsedKeys.add(key)
    parts.push(latex)
  }

  // Subfolders → deeper section headings
  for (const sf of subfolders) {
    const sub = folderToLatex(sf, null, allNotes, parentDepth + 1)
    for (const key of sub.usedKeys) allUsedKeys.add(key)
    parts.push(`\\${childCmd}{${sf.name}}\n\n${sub.body}`)
  }

  return `\\${sectionCmd}{${folder.name}}\n\n${parts.join('\n')}`
}

/**
 * Download a .zip archive containing .tex and optionally .bib files.
 *
 * @param {{ texContent: string, bibContent: string, baseName: string }} options
 */
export async function downloadLatexZip({ texContent, bibContent, baseName }) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  zip.file(`${baseName}.tex`, texContent)
  if (bibContent && bibContent.trim()) {
    zip.file(`${baseName}.bib`, bibContent)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
