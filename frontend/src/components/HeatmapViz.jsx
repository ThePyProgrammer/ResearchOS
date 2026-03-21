import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { projectPapersApi } from '../services/api'

// ─── Icon helper ──────────────────────────────────────────────────────────────
function Icon({ name, className = '' }) {
  return (
    <span className={`material-symbols-outlined select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  )
}

// Layout constants
const MARGIN_LEFT   = 120
const MARGIN_TOP    = 60
const MARGIN_RIGHT  = 16
const MARGIN_BOTTOM = 16
const CELL_MIN = 24
const CELL_MAX = 50

/**
 * Build a heatmap matrix with papers arrays included per cell.
 * This extends buildHeatmapMatrix (from ProjectReviewDashboard) to include
 * a map of "row||col" → paper[] for tooltip and click navigation.
 */
function buildLocalMatrix(papers, rowAxis, colAxis) {
  if (!papers || papers.length === 0) {
    return { rows: [], cols: [], cells: [], papersMap: {} }
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
        return authors.slice(0, 3).length > 0 ? authors.slice(0, 3) : ['(no author)']
      }
      default:
        return ['(unknown)']
    }
  }

  const countMap = {}     // "row||col" -> count
  const papersMap = {}    // "row||col" -> paper[]
  const rowSet = new Set()
  const colSet = new Set()

  for (const paper of papers) {
    const rowVals = getDimensionValues(paper, rowAxis)
    const colVals = getDimensionValues(paper, colAxis)

    for (const rv of rowVals) {
      for (const cv of colVals) {
        const key = `${rv}||${cv}`
        countMap[key] = (countMap[key] || 0) + 1
        if (!papersMap[key]) papersMap[key] = []
        papersMap[key].push(paper)
        rowSet.add(rv)
        colSet.add(cv)
      }
    }
  }

  const rows = Array.from(rowSet).sort()
  const cols = Array.from(colSet).sort()
  const cells = Object.entries(countMap).map(([key, count]) => {
    const [row, col] = key.split('||')
    return { row, col, count, papers: papersMap[key] || [] }
  })

  return { rows, cols, cells, papersMap }
}

/**
 * HeatmapViz — d3 SVG coverage heatmap with configurable row/col axes.
 *
 * Props:
 *   papers          — array of paper/website objects
 *   rowAxis         — 'tags' | 'venue' | 'year' | 'author'
 *   colAxis         — 'tags' | 'venue' | 'year' | 'author'
 *   projectId       — string, used for API calls
 *   onPapersRefresh — callback to re-fetch papers in parent after keyword extraction
 */
export default function HeatmapViz({
  papers = [],
  rowAxis = 'venue',
  colAxis = 'year',
  projectId,
  onPapersRefresh,
}) {
  const containerRef = useRef(null)
  const svgRef = useRef(null)

  const [hoveredCell, setHoveredCell] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState(null)
  const [extractError, setExtractError] = useState(null)

  // Build matrix with paper references
  const { rows, cols, cells, papersMap } = useMemo(
    () => buildLocalMatrix(papers, rowAxis, colAxis),
    [papers, rowAxis, colAxis]
  )

  // Count untagged papers
  const untaggedCount = useMemo(
    () => (papers || []).filter(p => !p.tags?.length).length,
    [papers]
  )

  const showTagsCallout =
    (rowAxis === 'tags' || colAxis === 'tags') &&
    papers.length > 0 &&
    untaggedCount > papers.length * 0.5

  const showExtractButton = rowAxis === 'tags' || colAxis === 'tags'

  // Render SVG using d3
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    if (rows.length === 0 || cols.length === 0) {
      d3.select(svgRef.current).selectAll('*').remove()
      return
    }

    const containerWidth = containerRef.current.clientWidth || 600

    const availW = Math.max(60, containerWidth - MARGIN_LEFT - MARGIN_RIGHT)

    const cellW = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(availW / cols.length)))
    const cellH = CELL_MIN  // Fixed row height for readability

    const svgW = MARGIN_LEFT + cellW * cols.length + MARGIN_RIGHT
    const svgH = MARGIN_TOP + cellH * rows.length + MARGIN_BOTTOM

    const maxCount = Math.max(...cells.map(c => c.count), 1)
    const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxCount])

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg
      .attr('width', svgW)
      .attr('height', svgH)

    const g = svg.append('g')
      .attr('transform', `translate(${MARGIN_LEFT},${MARGIN_TOP})`)

    // Column labels (rotated -45 deg)
    g.append('g')
      .attr('class', 'col-labels')
      .selectAll('text')
      .data(cols)
      .join('text')
      .attr('x', (d, i) => i * cellW + cellW / 2)
      .attr('y', -8)
      .attr('transform', (d, i) => `rotate(-45, ${i * cellW + cellW / 2}, -8)`)
      .attr('text-anchor', 'end')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-sans-serif, system-ui, sans-serif')
      .attr('fill', '#64748b')
      .text(d => d.length > 20 ? d.slice(0, 20) + '\u2026' : d)

    // Row labels
    g.append('g')
      .attr('class', 'row-labels')
      .selectAll('text')
      .data(rows)
      .join('text')
      .attr('x', -8)
      .attr('y', (d, i) => i * cellH + cellH / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-sans-serif, system-ui, sans-serif')
      .attr('fill', '#64748b')
      .text(d => d.length > 25 ? d.slice(0, 25) + '\u2026' : d)

    // Cells
    const cellGroup = g.append('g').attr('class', 'cells')

    rows.forEach((row, ri) => {
      cols.forEach((col, ci) => {
        const key = `${row}||${col}`
        const cellData = papersMap[key]
          ? { row, col, count: papersMap[key].length, papers: papersMap[key] }
          : { row, col, count: 0, papers: [] }
        const count = cellData.count

        const rect = cellGroup.append('rect')
          .attr('x', ci * cellW)
          .attr('y', ri * cellH)
          .attr('width', cellW - 1)
          .attr('height', cellH - 1)
          .attr('rx', 2)
          .attr('ry', 2)
          .attr('fill', count === 0 ? '#f8fafc' : colorScale(count))
          .attr('stroke', count === 0 ? '#e2e8f0' : 'none')
          .attr('stroke-dasharray', count === 0 ? '3,2' : 'none')
          .attr('cursor', count > 0 ? 'pointer' : 'default')

        // Count text for non-zero cells
        if (count > 0) {
          const isLight = count <= maxCount / 2
          cellGroup.append('text')
            .attr('x', ci * cellW + (cellW - 1) / 2)
            .attr('y', ri * cellH + (cellH - 1) / 2 + 4)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-family', 'ui-sans-serif, system-ui, sans-serif')
            .attr('fill', isLight ? '#475569' : 'white')
            .attr('pointer-events', 'none')
            .text(count)
        }

        // Mouse events
        rect.on('mouseenter', function (event) {
          const containerRect = containerRef.current?.getBoundingClientRect()
          const x = event.clientX - (containerRect?.left || 0)
          const y = event.clientY - (containerRect?.top || 0)
          setHoveredCell({ ...cellData, x, y })
        })
        rect.on('mouseleave', () => setHoveredCell(null))

        if (count > 0) {
          rect.on('click', () => {
            const paper = (cellData.papers || [])[0]
            if (paper) {
              const prefix = paper.itemType === 'website' ? '/library/website/' : '/library/paper/'
              window.location.href = prefix + paper.id
            }
          })
        }
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, cells, papersMap])

  // Handle Extract Keywords
  async function handleExtractKeywords() {
    if (!projectId || extracting) return
    setExtracting(true)
    setExtractError(null)
    setExtractResult(null)
    try {
      const result = await projectPapersApi.extractKeywords(projectId)
      setExtractResult(result)
      if (onPapersRefresh) onPapersRefresh()
    } catch (err) {
      console.error('Failed to extract keywords:', err)
      setExtractError(err.message || 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  // Empty state
  if (!papers || papers.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-slate-400">
        No papers to display
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Toolbar strip — only shown when tags axis is selected */}
      {showExtractButton && (
        <div className="flex items-center gap-2 mb-3">
          {untaggedCount === 0 ? (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Icon name="check_circle" className="text-[14px] text-emerald-500" />
              All papers tagged
            </span>
          ) : (
            <button
              onClick={handleExtractKeywords}
              disabled={extracting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-md transition-colors"
            >
              {extracting ? (
                <>
                  <span
                    className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  Extracting keywords...
                </>
              ) : (
                <>
                  <Icon name="auto_awesome" className="text-[14px]" />
                  Extract Keywords ({untaggedCount} untagged)
                </>
              )}
            </button>
          )}
          {extractResult && (
            <span className="text-xs text-emerald-600">
              Updated {extractResult.updated} papers
            </span>
          )}
          {extractError && (
            <span className="text-xs text-red-500">{extractError}</span>
          )}
        </div>
      )}

      {/* Tags sparsity callout */}
      {showTagsCallout && (
        <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
          <Icon name="info" className="text-[14px] text-amber-500 mt-0.5 flex-shrink-0" />
          <span>
            Most papers don&apos;t have tags yet. Click &apos;Extract Keywords&apos; to auto-generate tags from paper abstracts.
          </span>
        </div>
      )}

      {/* SVG heatmap */}
      {rows.length === 0 || cols.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-slate-400">
          No data to display for selected axes
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg ref={svgRef} />
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredCell && (
        <div
          className="absolute z-50 bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 pointer-events-none shadow-lg max-w-[200px]"
          style={{ top: hoveredCell.y + 10, left: hoveredCell.x + 10 }}
        >
          <div className="font-semibold">
            {hoveredCell.row} &times; {hoveredCell.col}
          </div>
          <div className="text-slate-300 mt-0.5">
            {hoveredCell.count} paper{hoveredCell.count !== 1 ? 's' : ''}
          </div>
          {hoveredCell.count > 0 && hoveredCell.count <= 3 && (
            <div className="text-slate-400 mt-1 space-y-0.5">
              {(hoveredCell.papers || []).map(p => (
                <div key={p.id} className="truncate">{p.title}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
