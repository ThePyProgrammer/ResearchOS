/**
 * LaTeX serializer for tiptap HTML content.
 *
 * Converts HTML strings (as stored in tiptap notes) to LaTeX output.
 * Follows the same DOM-walker pattern as _nodeToMd in ProjectNotesIDE.jsx.
 *
 * Exports:
 *   escapeLatex(text)      — escape LaTeX special characters in a plain-text string
 *   htmlToLatex(html, opts) — convert HTML string to { latex: string, usedKeys: Set<string> }
 */

/**
 * Escape LaTeX special characters in a plain-text string.
 *
 * Uses a single-pass regex replacement to avoid double-escaping.
 * Order: all special chars matched in one pass, no character is processed twice.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeLatex(text) {
  if (!text) return ''
  // Single-pass replacement — each character matched exactly once
  return text.replace(/[\\{}&%#$^_~]/g, (match) => {
    switch (match) {
      case '\\': return '\\textbackslash{}'
      case '{':  return '\\{'
      case '}':  return '\\}'
      case '&':  return '\\&'
      case '%':  return '\\%'
      case '#':  return '\\#'
      case '$':  return '\\$'
      case '^':  return '\\textasciicircum{}'
      case '_':  return '\\_'
      case '~':  return '\\textasciitilde{}'
      default:   return match
    }
  })
}

/**
 * Serialize a table element to LaTeX tabular environment.
 *
 * @param {Element} tableEl
 * @param {object} ctx  — shared context with usedKeys Set
 * @returns {string}
 */
function _serializeTable(tableEl, ctx) {
  const rows = Array.from(tableEl.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  // Count columns from first row
  const firstRow = rows[0]
  const firstCells = Array.from(firstRow.querySelectorAll('th, td'))
  const colCount = firstCells.length || 1

  // Build column spec: | l | l | l |
  const colSpec = '| ' + Array(colCount).fill('l').join(' | ') + ' |'

  const lines = [`\\begin{tabular}{${colSpec}}`, '\\hline']

  rows.forEach((row, rowIdx) => {
    const cells = Array.from(row.querySelectorAll('th, td'))
    const cellContents = cells.map(cell => {
      // Walk children of each cell
      return Array.from(cell.childNodes).map(n => _nodeToLatex(n, ctx)).join('').trim()
    })
    lines.push(cellContents.join(' & ') + ' \\\\')
    // Add hline after header row (first row)
    if (rowIdx === 0) {
      lines.push('\\hline')
    }
  })

  lines.push('\\hline')
  lines.push('\\end{tabular}')
  return lines.join('\n') + '\n\n'
}

/**
 * Recursive DOM walker — maps each node to its LaTeX equivalent.
 *
 * @param {Node} node
 * @param {object} ctx  — { usedKeys: Set<string> }
 * @returns {string}
 */
function _nodeToLatex(node, ctx) {
  // Text node: escape special chars (unless parent is math — handled by caller)
  if (node.nodeType === 3 /* Node.TEXT_NODE */) {
    return escapeLatex(node.textContent)
  }

  if (node.nodeType !== 1 /* Node.ELEMENT_NODE */) {
    return ''
  }

  const tag = node.tagName.toLowerCase()

  // Helper: serialize all child nodes
  const inner = () =>
    Array.from(node.childNodes)
      .map(child => _nodeToLatex(child, ctx))
      .join('')

  switch (tag) {
    // Headings
    case 'h1':
      return `\\section{${inner()}}\n\n`
    case 'h2':
      return `\\subsection{${inner()}}\n\n`
    case 'h3':
      return `\\subsubsection{${inner()}}\n\n`

    // Paragraphs
    case 'p':
      return `${inner()}\n\n`

    // Inline formatting
    case 'strong':
    case 'b':
      return `\\textbf{${inner()}}`
    case 'em':
    case 'i':
      return `\\textit{${inner()}}`
    case 'u':
      return `\\underline{${inner()}}`
    case 's':
      return `\\sout{${inner()}}`

    // Code
    case 'code': {
      // If parent is <pre>, skip — pre handles the verbatim wrapper
      if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
        // Emit raw text without escaping for verbatim content
        return node.textContent
      }
      return `\\texttt{${inner()}}`
    }
    case 'pre': {
      // Verbatim block — get raw text, do not escape
      const rawText = node.textContent
      return `\\begin{verbatim}\n${rawText}\n\\end{verbatim}\n\n`
    }

    // Block elements
    case 'blockquote':
      return `\\begin{quote}\n${inner()}\\end{quote}\n\n`
    case 'hr':
      return `\\hrule\n\n`

    // Lists
    case 'ul':
      return `\\begin{itemize}\n${inner()}\\end{itemize}\n\n`
    case 'ol':
      return `\\begin{enumerate}\n${inner()}\\end{enumerate}\n\n`
    case 'li':
      return `  \\item ${inner()}\n`

    // Table
    case 'table':
      return _serializeTable(node, ctx)

    // Skip internal table elements when encountered directly
    // (they are handled by _serializeTable)
    case 'thead':
    case 'tbody':
    case 'tfoot':
      return inner()
    case 'tr':
    case 'th':
    case 'td':
      // These should normally be processed by _serializeTable, not here
      return inner()

    // Spans with special data attributes
    case 'span': {
      // Citation span: data-cite-key takes priority
      if (node.dataset && node.dataset.citeKey) {
        const key = node.dataset.citeKey
        ctx.usedKeys.add(key)
        return `\\cite{${key}}`
      }

      // Math span: data-latex — pass through raw without escaping
      if (node.dataset && node.dataset.latex) {
        return `$${node.dataset.latex}$`
      }

      // Wiki-link span: data-wiki-name — emit display text only
      if (node.dataset && node.dataset.wikiName) {
        return node.textContent
      }

      // Generic span — walk children
      return inner()
    }

    // Hyperlinks
    case 'a': {
      const href = node.getAttribute('href') || ''
      return `\\href{${href}}{${inner()}}`
    }

    // Structural wrappers — just recurse
    case 'div':
    case 'body':
    case 'html':
      return inner()

    // Ignore unknown elements but still recurse into children
    default:
      return inner()
  }
}

/**
 * Convert an HTML string to a LaTeX string.
 *
 * @param {string|null} html  — tiptap-generated HTML content
 * @param {object} [options]  — reserved for future use
 * @returns {{ latex: string, usedKeys: Set<string> }}
 */
export function htmlToLatex(html, options = {}) {
  if (!html) return { latex: '', usedKeys: new Set() }

  const ctx = { usedKeys: new Set() }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const latex = _nodeToLatex(doc.body, ctx).replace(/^\s+/, '')

  return { latex, usedKeys: ctx.usedKeys }
}
