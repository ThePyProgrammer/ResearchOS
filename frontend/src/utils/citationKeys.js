/**
 * Citation key utilities — mirrors backend/services/bibtex_service.py _make_citation_key()
 *
 * Keys are deterministic: {lastname}{year}{titleword}
 * Example: "Vaswani, A." + 2017 + "Attention Is All You Need" -> "vaswani2017attention"
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'on', 'of', 'for', 'in', 'to', 'and', 'with', 'is', 'are', 'by',
])

/**
 * Extract the first author's last name from a string like:
 *   "Vaswani, Ashish"  -> "Vaswani"
 *   "Ashish Vaswani"   -> "Vaswani"
 *   ""                 -> "unknown"
 */
function _firstAuthorLastName(authors) {
  if (!authors || !authors.length) return 'unknown'
  const first = Array.isArray(authors) ? authors[0] : authors
  if (!first) return 'unknown'
  let lastName
  if (first.includes(',')) {
    lastName = first.split(',')[0].trim()
  } else {
    const tokens = first.trim().split(/\s+/)
    lastName = tokens[tokens.length - 1] || 'unknown'
  }
  return lastName.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'unknown'
}

/**
 * Generate a citation key from item metadata.
 * @param {{ authors: string[], year: number|string, title: string }} item
 * @returns {string} e.g. "vaswani2017attention"
 */
export function makeCitationKey({ authors, year, title }) {
  const lastName = _firstAuthorLastName(authors)
  const yearStr = year ? String(year) : ''

  let titleWord = ''
  if (title) {
    for (const word of title.split(/\s+/)) {
      const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase()
      if (clean && !STOP_WORDS.has(clean)) {
        titleWord = clean
        break
      }
    }
  }

  return `${lastName}${yearStr}${titleWord}` || 'entry'
}

/**
 * Generate the display label shown inside the citation chip.
 * Format: "(LastName et al., Year)" for multiple authors, "(LastName, Year)" for single author.
 * @param {{ authors: string[], year: number|string, title: string }} item
 * @returns {string} e.g. "(Vaswani et al., 2017)"
 */
export function makeCitationLabel({ authors, year, title }) {
  const authorList = Array.isArray(authors) ? authors : (authors ? [authors] : [])
  let authorPart = 'Unknown'

  if (authorList.length > 0) {
    const first = authorList[0]
    let lastName
    if (first.includes(',')) {
      lastName = first.split(',')[0].trim()
    } else {
      const tokens = first.trim().split(/\s+/)
      lastName = tokens[tokens.length - 1] || first
    }
    authorPart = authorList.length > 1 ? `${lastName} et al.` : lastName
  }

  const yearStr = year ? String(year) : 'n.d.'
  return `(${authorPart}, ${yearStr})`
}

/**
 * Deduplicate citation keys within a list of items.
 * When two items produce the same base key, append 'a', 'b', 'c', ... suffixes.
 * Adds `_resolvedKey` property to each item.
 *
 * @param {Array<{ authors: string[], year: number|string, title: string }>} items
 * @returns {Array} items with `_resolvedKey` field added
 */
export function deduplicateKeys(items) {
  const seen = {}
  return items.map(item => {
    const base = makeCitationKey(item)
    if (!(base in seen)) {
      seen[base] = 1
      return { ...item, _resolvedKey: base }
    }
    const count = seen[base]
    seen[base] = count + 1
    // 1 -> 'a', 2 -> 'b', etc (chr(96 + count) mirrors Python)
    const suffix = String.fromCharCode(96 + count)
    return { ...item, _resolvedKey: `${base}${suffix}` }
  })
}
