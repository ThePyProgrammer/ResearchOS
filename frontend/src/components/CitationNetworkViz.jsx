import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  buildCitationEdges,
  getNodeColor,
  getNodeSize,
} from '../pages/ProjectReviewDashboard'

// ─── Icon helper ──────────────────────────────────────────────────────────────
function Icon({ name, className = '' }) {
  return (
    <span className={`material-symbols-outlined select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  )
}

// ─── Build d3 color scales from the current paper set ─────────────────────────
function buildScales(papers) {
  const years = papers.map(p => p.year).filter(y => y != null)
  const minYear = years.length ? Math.min(...years) : 1990
  const maxYear = years.length ? Math.max(...years) : 2024

  const yearScale = d3.scaleSequential()
    .domain([minYear, maxYear])
    .interpolator(d3.interpolateYlOrRd)

  // Venue → color (categorical)
  const venues = [...new Set(papers.map(p => (p.venue || '').trim()).filter(Boolean))]
  const palette = d3.schemeTableau10
  const venueColorMap = {}
  venues.forEach((v, i) => {
    venueColorMap[v] = palette[i % palette.length]
  })

  return { yearScale, venueColorMap, typeColorMap: {} }
}

// ─── Build degree map from active edges ──────────────────────────────────────
function buildDegreeMap(papers, activeEdges) {
  const map = {}
  for (const p of papers) map[p.id] = 0
  for (const e of activeEdges) {
    const src = typeof e.source === 'object' ? e.source.id : e.source
    const tgt = typeof e.target === 'object' ? e.target.id : e.target
    map[src] = (map[src] || 0) + 1
    map[tgt] = (map[tgt] || 0) + 1
  }
  return map
}

// ═══════════════════════════════════════════════════════════════════════════════
// CitationNetworkViz
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * d3 force-directed citation network graph.
 *
 * Props:
 *   papers           - array of paper/website objects linked to the project
 *   colorBy          - 'year' | 'venue' | 'type' | 'uniform'
 *   sizeBy           - 'connections' | 'year' | 'uniform'
 *   showAuthorEdges  - boolean
 *   showVenueEdges   - boolean
 *   projectId        - string (unused here, kept for future localStorage keying)
 */
export default function CitationNetworkViz({
  papers = [],
  colorBy = 'year',
  sizeBy = 'connections',
  showAuthorEdges = true,
  showVenueEdges = true,
}) {
  const svgRef        = useRef(null)
  const svgWrapperRef = useRef(null)
  const simRef        = useRef(null)
  // Store scales ref so the color/size effect can access them without rebuilding sim
  const scalesRef     = useRef(null)
  const degreeMapRef  = useRef({})

  const [hoveredNode, setHoveredNode] = useState(null)

  // ── Build / rebuild graph when papers or edge toggles change ─────────────
  useEffect(() => {
    if (!svgRef.current || !svgWrapperRef.current) return

    // Stop any running simulation first
    if (simRef.current) {
      simRef.current.stop()
      simRef.current = null
    }

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (papers.length === 0) return

    const width  = svgWrapperRef.current.clientWidth  || 900
    const height = svgWrapperRef.current.clientHeight || 500

    // Build edges
    const { authorEdges, venueEdges } = buildCitationEdges(papers)
    const activeEdges = [
      ...(showAuthorEdges ? authorEdges : []),
      ...(showVenueEdges  ? venueEdges  : []),
    ]

    // Build scales and degree map
    const scales = buildScales(papers)
    scalesRef.current = scales
    const degreeMap = buildDegreeMap(papers, activeEdges)
    degreeMapRef.current = degreeMap

    // Deep-copy nodes so d3 can mutate x/y
    const nodes = papers.map(p => ({ ...p }))

    // Deep-copy edges with string IDs (d3 forceLink will replace with object refs)
    const links = activeEdges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
    }))

    // ── Zoom target group ────────────────────────────────────────────────────
    const g = svg.append('g')

    // ── Zoom ────────────────────────────────────────────────────────────────
    const zoom = d3.zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)

    // ── fitView — zoom to fit all nodes in viewport after simulation ends ──
    function fitView() {
      const xs = nodes.map(d => d.x).filter(v => v != null)
      const ys = nodes.map(d => d.y).filter(v => v != null)
      if (!xs.length) return
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const w = maxX - minX || 1, h = maxY - minY || 1
      const pad   = 80
      const scale = Math.min(0.95, (width - pad * 2) / w, (height - pad * 2) / h)
      svg.transition().duration(600).call(
        zoom.transform,
        d3.zoomIdentity
          .translate(
            width  / 2 - scale * ((minX + maxX) / 2),
            height / 2 - scale * ((minY + maxY) / 2)
          )
          .scale(scale)
      )
    }

    // ── Links ────────────────────────────────────────────────────────────────
    const linkEls = g.append('g').attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke',       d => d.type === 'author' ? '#3b82f6' : '#f97316')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', d => d.type === 'venue' ? '5,3' : null)
      .attr('stroke-opacity', 0.35)

    // ── Nodes ────────────────────────────────────────────────────────────────
    const nodeEls = g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('mouseenter', (_, d) => setHoveredNode(d))
      .on('mouseleave', ()     => setHoveredNode(null))
      .on('click', (_, d) => {
        const path = d.itemType === 'website'
          ? `/library/website/${d.id}`
          : `/library/paper/${d.id}`
        window.location.href = path
      })

    // Invisible larger hit area
    nodeEls.append('circle')
      .attr('r', d => getNodeSize(d, sizeBy, degreeMap) + 6)
      .attr('fill', 'transparent')

    // Visible node circle
    nodeEls.append('circle')
      .attr('class', 'node-circle')
      .attr('r',      d => getNodeSize(d, sizeBy, degreeMap))
      .attr('fill',   d => getNodeColor(d, colorBy, scales))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

    // Label below node
    nodeEls.append('text')
      .attr('class', 'node-label')
      .text(d => {
        const t = d.title || d.name || ''
        return t.length > 20 ? t.slice(0, 20) + '…' : t
      })
      .attr('y',           d => getNodeSize(d, sizeBy, degreeMap) + 12)
      .attr('font-size',   '9px')
      .attr('font-family', 'ui-sans-serif, system-ui, sans-serif')
      .attr('fill',        '#64748b')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')

    // ── Drag behavior ────────────────────────────────────────────────────────
    nodeEls.call(
      d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
    )

    // ── Simulation ────────────────────────────────────────────────────────────
    const sim = d3.forceSimulation(nodes)
      .force(
        'link',
        d3.forceLink(links).id(d => d.id).distance(100).strength(0.6)
      )
      .force('charge',    d3.forceManyBody().strength(-250))
      .force('center',    d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(d => getNodeSize(d, sizeBy, degreeMap) + 15))

    simRef.current = sim

    sim.on('tick', () => {
      linkEls
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      nodeEls.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    sim.on('end', fitView)

    return () => {
      if (simRef.current) {
        simRef.current.stop()
        simRef.current = null
      }
    }
  }, [papers, showAuthorEdges, showVenueEdges])

  // ── Update colors + sizes when options change, without restarting sim ─────
  useEffect(() => {
    if (!svgRef.current || !scalesRef.current || papers.length === 0) return

    const scales    = buildScales(papers)
    scalesRef.current = scales

    // Rebuild degreeMap from current active edges to reflect current toggle state
    const { authorEdges, venueEdges } = buildCitationEdges(papers)
    const activeEdges = [
      ...(showAuthorEdges ? authorEdges : []),
      ...(showVenueEdges  ? venueEdges  : []),
    ]
    const degreeMap = buildDegreeMap(papers, activeEdges)
    degreeMapRef.current = degreeMap

    const svg = d3.select(svgRef.current)

    svg.selectAll('.node-circle')
      .attr('fill',   d => getNodeColor(d, colorBy, scales))
      .attr('r',      d => getNodeSize(d, sizeBy, degreeMap))

    svg.selectAll('.node-label')
      .attr('y', d => getNodeSize(d, sizeBy, degreeMap) + 12)
  }, [colorBy, sizeBy, papers, showAuthorEdges, showVenueEdges])

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-slate-400 gap-3 py-16">
        <Icon name="hub" className="text-[48px] text-slate-200" />
        <div className="text-center">
          <p className="text-sm text-slate-400 font-medium">No papers linked to this project</p>
          <p className="text-xs text-slate-300 mt-1">
            Link papers from the Literature tab to see the citation network
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative" style={{ minHeight: '60vh' }}>
      {/* SVG graph */}
      <div
        ref={svgWrapperRef}
        className="relative overflow-hidden rounded-lg bg-slate-50"
        style={{ minHeight: '60vh' }}
      >
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{ minHeight: '60vh' }}
        />

        {/* Hover tooltip */}
        {hoveredNode && (
          <div
            className="absolute z-50 bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 pointer-events-none shadow-lg max-w-xs"
            style={{ bottom: 12, left: 12 }}
          >
            <div className="font-semibold truncate">{hoveredNode.title || hoveredNode.name}</div>
            <div className="text-slate-300 mt-0.5">
              {hoveredNode.authors?.slice(0, 3).join(', ')}
              {hoveredNode.authors?.length > 3 ? ' et al.' : ''}
            </div>
            <div className="text-slate-400 mt-0.5">
              {[hoveredNode.venue, hoveredNode.year].filter(Boolean).join(' ')}
            </div>
          </div>
        )}

        {/* Hint */}
        <div className="absolute bottom-3 right-3 text-[10px] text-slate-300 select-none pointer-events-none">
          Scroll to zoom · Drag to pan · Click node to open
        </div>
      </div>

      {/* Edge type legend */}
      {(showAuthorEdges || showVenueEdges) && (
        <div className="flex items-center gap-4 mt-2 px-1">
          {showAuthorEdges && (
            <div className="flex items-center gap-1.5">
              <svg width="24" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="24" y2="4" stroke="#3b82f6" strokeWidth="2" />
              </svg>
              <span className="text-[11px] text-slate-500">Shared Authors</span>
            </div>
          )}
          {showVenueEdges && (
            <div className="flex items-center gap-1.5">
              <svg width="24" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="24" y2="4" stroke="#f97316" strokeWidth="2" strokeDasharray="5,3" />
              </svg>
              <span className="text-[11px] text-slate-500">Same Venue</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
