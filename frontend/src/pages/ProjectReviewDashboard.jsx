// ═══════════════════════════════════════════════════════════════════════════════
// Pure data utility functions (exported for testing and use by LiteratureTab)
//
// The React component that previously lived here has been merged into
// LiteratureTab (in ProjectDetail.jsx) as sub-tabs: Graph, Timeline, Heatmap.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize an author name to a canonical key for matching.
 *
 * Handles three formats:
 *   "Last, First"  → "last f"
 *   "First Last"   → "last f"
 *   "A. Last"      → "last a"
 *   "SingleName"   → "singlename"
 *
 * Rules:
 * - Lowercase everything
 * - Strip punctuation (dots, commas) before processing
 * - Split on whitespace to get tokens
 * - If the raw name (before stripping) contains a comma → "Last, First[...]" format
 *   Return: lastName + " " + firstInitial
 * - Otherwise tokens = [First, Last] (or more) — Last is tokens[last]
 *   Return: lastName + " " + firstInitial
 * - Single token → return that token lowercased
 */
export function normalizeAuthor(name) {
  if (!name || typeof name !== 'string') return ''
  const hasComma = name.includes(',')
  // Strip punctuation except spaces, then collapse whitespace
  const clean = name.replace(/[^a-zA-Z\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const tokens = clean.split(' ').filter(Boolean)

  if (tokens.length === 0) return clean
  if (tokens.length === 1) return tokens[0]

  if (hasComma) {
    // "Last, First [Middle...]" format
    // After stripping punctuation: tokens[0] = last, tokens[1] = first (or initial)
    const last = tokens[0]
    const firstInitial = tokens[1].charAt(0)
    return `${last} ${firstInitial}`
  } else {
    // "First [Middle...] Last" or "A Last" format
    const last = tokens[tokens.length - 1]
    const firstInitial = tokens[0].charAt(0)
    return `${last} ${firstInitial}`
  }
}

/**
 * Build citation edges between papers based on shared authors.
 *
 * O(n^2) comparison. Returns:
 *   authorEdges: Array<{ source, target, type: 'author', sharedAuthors: string[] }>
 */
export function buildCitationEdges(papers) {
  const authorEdges = []

  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      const a = papers[i]
      const b = papers[j]

      // Author intersection
      const authorsA = (a.authors || []).map(normalizeAuthor)
      const authorsB = new Set((b.authors || []).map(normalizeAuthor))
      const shared = authorsA.filter(na => authorsB.has(na))
      if (shared.length > 0) {
        authorEdges.push({
          source: a.id,
          target: b.id,
          type: 'author',
          sharedAuthors: shared,
        })
      }
    }
  }

  return { authorEdges }
}

/**
 * Return a color string for a node based on the colorBy strategy.
 *
 * @param {object} paper
 * @param {string} colorBy - 'year' | 'venue' | 'type' | 'uniform'
 * @param {object} scales - { yearScale: fn, venueColorMap: {}, typeColorMap: {} }
 */
export function getNodeColor(paper, colorBy, scales) {
  switch (colorBy) {
    case 'year':
      return scales.yearScale(paper.year)
    case 'venue':
      return (scales.venueColorMap || {})[paper.venue] || '#94a3b8'
    case 'type':
      return paper.itemType === 'website' ? '#14b8a6' : '#3b82f6'
    case 'uniform':
    default:
      return '#3b82f6'
  }
}

/**
 * Return a radius for a node based on the sizeBy strategy.
 *
 * @param {object} paper
 * @param {string} sizeBy - 'connections' | 'year' | 'uniform'
 * @param {object} degreeMap - { [paperId]: number }
 */
export function getNodeSize(paper, sizeBy, degreeMap) {
  switch (sizeBy) {
    case 'connections':
      return Math.max(6, Math.min(20, 6 + (degreeMap[paper.id] || 0) * 2))
    case 'year':
      return Math.max(6, Math.min(20, 6 + Math.max(0, ((paper.year || 0) - 1990) / 3)))
    case 'uniform':
    default:
      return 8
  }
}

/**
 * Parse a paper's publishedDate (e.g. "2023-06-15", "2023-06", "2023") or
 * fall back to paper.year.  Returns { ts, key } where ts is a timestamp
 * (milliseconds) used for x-axis positioning and key is a "YYYY-MM" string
 * used for grouping / stacking.
 *
 * Papers without publishedDate or year are placed at 0 (Jan 1970).
 */
export function parsePublishedDate(paper) {
  const raw = paper.publishedDate
  if (raw && typeof raw === 'string' && raw.length >= 4) {
    const parts = raw.split('-')
    const year  = parseInt(parts[0], 10)
    const month = parts.length >= 2 ? parseInt(parts[1], 10) - 1 : 0 // 0-indexed
    if (!isNaN(year)) {
      const d = new Date(year, month, 1)
      const key = `${year}-${String(month + 1).padStart(2, '0')}`
      return { ts: d.getTime(), key }
    }
  }
  // Fallback to year field → placed at January of that year
  if (paper.year != null && paper.year !== 0) {
    const d = new Date(paper.year, 0, 1)
    const key = `${paper.year}-01`
    return { ts: d.getTime(), key }
  }
  return { ts: 0, key: '0000-00' }
}

/**
 * Compute _x (= timestamp) and _y (= index within month group) for each paper.
 *
 * Uses publishedDate to extract year+month. Falls back to paper.year
 * (placed at January of that year). Papers with neither are placed at ts 0.
 *
 * Returns a new array with _x (timestamp) and _y added to each paper object.
 */
export function computeTimelinePositions(papers) {
  if (!papers || papers.length === 0) return []

  // Group by year-month key
  const byMonth = {}
  for (const p of papers) {
    const { key } = parsePublishedDate(p)
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(p)
  }

  return papers.map(p => {
    const { ts, key } = parsePublishedDate(p)
    const group = byMonth[key]
    const _y = group.indexOf(p)
    return { ...p, _x: ts, _y }
  })
}

/**
 * Build a heatmap count matrix from papers.
 *
 * @param {object[]} papers
 * @param {string} rowAxis - 'tags' | 'venue' | 'year' | 'author'
 * @param {string} colAxis - 'tags' | 'venue' | 'year' | 'author'
 * @returns {{ rows: string[], cols: string[], cells: Array<{row, col, count}> }}
 */
export function buildHeatmapMatrix(papers, rowAxis, colAxis) {
  if (!papers || papers.length === 0) {
    return { rows: [], cols: [], cells: [] }
  }

  function getDimensionValues(paper, axis) {
    switch (axis) {
      case 'tags': {
        const tags = paper.tags || []
        return tags.length > 0 ? tags : ['(no tags)']
      }
      case 'venue': {
        const v = (paper.venue || '').trim()
        return v ? [v] : ['(no venue)']
      }
      case 'year':
        return [String(paper.year == null ? 0 : paper.year)]
      case 'author': {
        const authors = paper.authors || []
        // Use first 3 authors to avoid matrix explosion
        return authors.slice(0, 3).length > 0 ? authors.slice(0, 3) : ['(no author)']
      }
      default:
        return ['(unknown)']
    }
  }

  // Build count map: "row||col" => count
  const countMap = {}
  const rowSet = new Set()
  const colSet = new Set()

  for (const paper of papers) {
    const rowVals = getDimensionValues(paper, rowAxis)
    const colVals = getDimensionValues(paper, colAxis)

    for (const rv of rowVals) {
      for (const cv of colVals) {
        const key = `${rv}||${cv}`
        countMap[key] = (countMap[key] || 0) + 1
        rowSet.add(rv)
        colSet.add(cv)
      }
    }
  }

  const rows = Array.from(rowSet).sort()
  const cols = Array.from(colSet).sort()
  const cells = Object.entries(countMap).map(([key, count]) => {
    const [row, col] = key.split('||')
    return { row, col, count }
  })

  return { rows, cols, cells }
}
