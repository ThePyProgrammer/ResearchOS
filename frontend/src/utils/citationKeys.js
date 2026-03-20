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

  const key = `${lastName}${yearStr}${titleWord}`
  // Mirror Python: f"{last_name}{year}{title_word}" or "entry"
  // An empty string is falsy, and "unknown" with no year/title should still be "entry"
  // when last_name is "unknown" and both yearStr and titleWord are empty
  if (!yearStr && !titleWord && lastName === 'unknown') return 'entry'
  return key || 'entry'
}

/**
 * Generate the display label shown inside the citation chip.
 * Format: "(LastName et al., Year)" for multiple authors, "(LastName, Year)" for single author.
 * @param {{ authors: string[], year: number|string, title: string }} item
 * @returns {string} e.g. "(Vaswani et al., 2017)"
 */
export function makeCitationLabel({ authors, year, title } = {}) {
  const authorList = Array.isArray(authors) ? authors : (authors ? [authors] : [])

  // Extract display last name from an author string
  function _displayLastName(author) {
    if (!author) return ''
    if (author.includes(',')) {
      return author.split(',')[0].trim()
    }
    const tokens = author.trim().split(/\s+/)
    return tokens[tokens.length - 1] || author
  }

  let authorPart
  if (authorList.length === 0) {
    // No authors: fall back to first word of title
    const firstWord = (title || '').split(/\s+/).find(w => w.length > 0) || 'Unknown'
    authorPart = firstWord
  } else if (authorList.length === 1) {
    authorPart = _displayLastName(authorList[0])
  } else if (authorList.length === 2) {
    authorPart = `${_displayLastName(authorList[0])} & ${_displayLastName(authorList[1])}`
  } else {
    authorPart = `${_displayLastName(authorList[0])} et al.`
  }

  // Year is optional — omit entirely when null/undefined
  if (year != null) {
    return `(${authorPart}, ${year})`
  }
  return `(${authorPart})`
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
  // seen maps base key -> count of times seen so far
  // First occurrence: count = 1, no suffix
  // Second occurrence: count = 2, suffix = chr(96 + 2) = 'b'
  // Third occurrence: count = 3, suffix = chr(96 + 3) = 'c'
  // Mirrors Python export_bibtex dedup: seen_keys[key] starts at 1, increments, then chr(96 + seen_keys[key])
  const seen = {}
  return items.map(item => {
    const base = makeCitationKey(item)
    if (base in seen) {
      seen[base] += 1
      // second collision -> chr(96+2) = 'b', third -> chr(96+3) = 'c', etc.
      const suffix = String.fromCharCode(96 + seen[base])
      return { ...item, _resolvedKey: `${base}${suffix}` }
    } else {
      seen[base] = 1
      return { ...item, _resolvedKey: base }
    }
  })
}
