import { useState, useEffect, useRef, useCallback } from 'react'
import { projectPapersApi, papersApi, websitesApi } from '../services/api'
import { useLocalStorage } from '../hooks/useLocalStorage'

// ─── Icon helper ──────────────────────────────────────────────────────────────
function Icon({ name, className = '' }) {
  return (
    <span className={`material-symbols-outlined select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pure data utility functions (exported for testing)
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
 * Build citation edges between papers based on shared authors or shared venue.
 *
 * O(n^2) comparison. Returns:
 *   authorEdges: Array<{ source, target, type: 'author', sharedAuthors: string[] }>
 *   venueEdges:  Array<{ source, target, type: 'venue' }>
 */
export function buildCitationEdges(papers) {
  const authorEdges = []
  const venueEdges = []

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

      // Venue match (case-insensitive, both non-empty)
      const venueA = (a.venue || '').trim()
      const venueB = (b.venue || '').trim()
      if (venueA && venueB && venueA.toLowerCase() === venueB.toLowerCase()) {
        venueEdges.push({
          source: a.id,
          target: b.id,
          type: 'venue',
        })
      }
    }
  }

  return { authorEdges, venueEdges }
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
 * Compute _x (= year) and _y (= index within year group) for each paper.
 * Papers with null/undefined year are treated as year 0.
 *
 * Returns a new array with _x and _y added to each paper object.
 */
export function computeTimelinePositions(papers) {
  if (!papers || papers.length === 0) return []

  // Group by year
  const byYear = {}
  for (const p of papers) {
    const yr = p.year == null ? 0 : p.year
    if (!byYear[yr]) byYear[yr] = []
    byYear[yr].push(p)
  }

  return papers.map(p => {
    const yr = p.year == null ? 0 : p.year
    const group = byYear[yr]
    const _y = group.indexOf(p)
    return { ...p, _x: yr, _y }
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

// ═══════════════════════════════════════════════════════════════════════════════
// CollapsibleSection component
// ═══════════════════════════════════════════════════════════════════════════════

function CollapsibleSection({ title, icon, sectionId, projectId, children, options }) {
  const [collapsed, setCollapsed] = useLocalStorage(
    `researchos.review.${projectId}.${sectionId}.collapsed`,
    false
  )
  const [optionsOpen, setOptionsOpen] = useLocalStorage(
    `researchos.review.${projectId}.${sectionId}.optionsOpen`,
    false
  )
  const gearRef = useRef(null)
  const popoverRef = useRef(null)

  // Close options popover on outside click
  useEffect(() => {
    if (!optionsOpen) return
    function handleMouseDown(e) {
      if (
        gearRef.current && !gearRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOptionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [optionsOpen, setOptionsOpen])

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 flex-1 text-left"
          aria-expanded={!collapsed}
        >
          <Icon name={collapsed ? 'chevron_right' : 'expand_more'} className="text-[18px] text-slate-500" />
          <Icon name={icon} className="text-[18px] text-slate-600" />
          <span className="text-sm font-semibold text-slate-700">{title}</span>
        </button>
        {/* Gear button */}
        <div className="relative">
          <button
            ref={gearRef}
            onClick={() => setOptionsOpen(o => !o)}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
            title="Section options"
          >
            <Icon name="settings" className="text-[16px]" />
          </button>
          {optionsOpen && options && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[200px]"
            >
              {options}
            </div>
          )}
        </div>
      </div>

      {/* Section body */}
      {!collapsed && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Option controls helpers
// ═══════════════════════════════════════════════════════════════════════════════

function OptionRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1 mb-3 last:mb-0">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function OptionSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

const COLOR_BY_OPTIONS = [
  { value: 'year', label: 'Year' },
  { value: 'venue', label: 'Venue' },
  { value: 'type', label: 'Type' },
  { value: 'uniform', label: 'Uniform' },
]

const SIZE_BY_OPTIONS = [
  { value: 'connections', label: 'Connections' },
  { value: 'year', label: 'Year' },
  { value: 'uniform', label: 'Uniform' },
]

const AXIS_OPTIONS = [
  { value: 'tags', label: 'Tags' },
  { value: 'venue', label: 'Venue' },
  { value: 'year', label: 'Year' },
  { value: 'author', label: 'Author' },
]

// ═══════════════════════════════════════════════════════════════════════════════
// ProjectReviewDashboard component
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProjectReviewDashboard({ projectId, libraryId }) {
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Network options
  const [networkColorBy, setNetworkColorBy] = useLocalStorage(
    `researchos.review.${projectId}.network.colorBy`,
    'year'
  )
  const [networkSizeBy, setNetworkSizeBy] = useLocalStorage(
    `researchos.review.${projectId}.network.sizeBy`,
    'connections'
  )
  const [networkShowAuthors, setNetworkShowAuthors] = useLocalStorage(
    `researchos.review.${projectId}.network.showAuthors`,
    true
  )
  const [networkShowVenues, setNetworkShowVenues] = useLocalStorage(
    `researchos.review.${projectId}.network.showVenues`,
    true
  )

  // Timeline options
  const [timelineColorBy, setTimelineColorBy] = useLocalStorage(
    `researchos.review.${projectId}.timeline.colorBy`,
    'year'
  )

  // Heatmap options
  const [heatmapRowAxis, setHeatmapRowAxis] = useLocalStorage(
    `researchos.review.${projectId}.heatmap.rowAxis`,
    'tags'
  )
  const [heatmapColAxis, setHeatmapColAxis] = useLocalStorage(
    `researchos.review.${projectId}.heatmap.colAxis`,
    'year'
  )

  const fetchPapers = useCallback(async () => {
    if (!projectId || !libraryId) return
    setLoading(true)
    setError(null)
    try {
      // Fetch project paper IDs
      const links = await projectPapersApi.list(projectId)
      const linkIds = new Set((links || []).map(l => l.paperId || l.paper_id || l.id))

      // Fetch full paper + website lists from library
      const [allPapers, allWebsites] = await Promise.all([
        papersApi.list({ libraryId }),
        websitesApi.list({ libraryId }),
      ])

      // Join: keep only items linked to this project
      const allItems = [
        ...(allPapers || []).map(p => ({ ...p, itemType: p.itemType || 'paper' })),
        ...(allWebsites || []).map(w => ({ ...w, itemType: 'website' })),
      ]

      const projectItems = allItems.filter(item => linkIds.has(item.id))
      setPapers(projectItems)
    } catch (err) {
      console.error('Failed to load project papers for review:', err)
      setError('Failed to load papers.')
    } finally {
      setLoading(false)
    }
  }, [projectId, libraryId])

  useEffect(() => {
    fetchPapers()
  }, [fetchPapers])

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="h-12 bg-slate-100 animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  // Network section options popover
  const networkOptions = (
    <>
      <OptionRow label="Color by">
        <OptionSelect value={networkColorBy} onChange={setNetworkColorBy} options={COLOR_BY_OPTIONS} />
      </OptionRow>
      <OptionRow label="Size by">
        <OptionSelect value={networkSizeBy} onChange={setNetworkSizeBy} options={SIZE_BY_OPTIONS} />
      </OptionRow>
      <OptionRow label="Edge types">
        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={networkShowAuthors}
            onChange={e => setNetworkShowAuthors(e.target.checked)}
            className="rounded"
          />
          Shared Authors
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={networkShowVenues}
            onChange={e => setNetworkShowVenues(e.target.checked)}
            className="rounded"
          />
          Same Venue
        </label>
      </OptionRow>
    </>
  )

  // Timeline section options popover
  const timelineOptions = (
    <OptionRow label="Color by">
      <OptionSelect value={timelineColorBy} onChange={setTimelineColorBy} options={COLOR_BY_OPTIONS} />
    </OptionRow>
  )

  // Heatmap section options popover
  const heatmapOptions = (
    <>
      <OptionRow label="Row axis">
        <OptionSelect value={heatmapRowAxis} onChange={setHeatmapRowAxis} options={AXIS_OPTIONS} />
      </OptionRow>
      <OptionRow label="Column axis">
        <OptionSelect value={heatmapColAxis} onChange={setHeatmapColAxis} options={AXIS_OPTIONS} />
      </OptionRow>
    </>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <CollapsibleSection
        title="Citation Network"
        icon="hub"
        sectionId="network"
        projectId={projectId}
        options={networkOptions}
      >
        <p className="text-sm text-slate-500">Citation network visualization</p>
      </CollapsibleSection>

      <CollapsibleSection
        title="Publication Timeline"
        icon="timeline"
        sectionId="timeline"
        projectId={projectId}
        options={timelineOptions}
      >
        <p className="text-sm text-slate-500">Publication timeline visualization</p>
      </CollapsibleSection>

      <CollapsibleSection
        title="Coverage Heatmap"
        icon="grid_view"
        sectionId="heatmap"
        projectId={projectId}
        options={heatmapOptions}
      >
        <p className="text-sm text-slate-500">Coverage heatmap visualization</p>
      </CollapsibleSection>
    </div>
  )
}
