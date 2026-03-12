import { useEffect, useRef, useCallback, useState } from 'react'
import * as d3 from 'd3'
import { extractWikiLinks } from './WikiLinkExtension'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const SOURCE_COLOR = {
  library: '#64748b',
  paper:   '#3b82f6',
  website: '#14b8a6',
  github:  '#8b5cf6',
}

const SOURCE_LABEL = {
  library: 'Library',
  paper:   'Paper',
  website: 'Website',
  github:  'GitHub',
}

export default function NoteGraphView({ allNotes, onNoteClick }) {
  const svgRef        = useRef(null)
  const containerRef  = useRef(null)
  const simRef        = useRef(null)
  const nodesRef      = useRef([])          // live D3-mutated node array
  const clusterRef    = useRef(0.3)         // read by the force function each tick

  const [hoveredNode,     setHoveredNode]     = useState(null)
  const [clusterStrength, setClusterStrength] = useState(0.3)

  // Keep the ref in sync so the running force always reads the latest value
  useEffect(() => {
    clusterRef.current = clusterStrength
    // Reheat gently so the new strength takes effect visually
    if (simRef.current) simRef.current.alpha(0.35).restart()
  }, [clusterStrength])

  // ── Build graph data ───────────────────────────────────────────────────────
  const buildGraph = useCallback(() => {
    const fileNotes = allNotes.filter(n => n.type === 'file')
    const nameMap   = new Map(fileNotes.map(n => [n.name.toLowerCase(), n]))

    const nodes = fileNotes.map(n => ({
      id:        n.id,
      name:      n.name,
      source:    n.source    ?? 'library',
      sourceKey: n.sourceKey ?? n.source ?? 'library',
    }))

    const nodeIdSet = new Set(nodes.map(n => n.id))
    const linkSet   = new Set()
    const links     = []

    for (const note of fileNotes) {
      for (const targetName of extractWikiLinks(note.content || '')) {
        const target = nameMap.get(targetName.toLowerCase())
        if (!target || !nodeIdSet.has(target.id) || target.id === note.id) continue
        const key = `${note.id}→${target.id}`
        if (linkSet.has(key)) continue
        linkSet.add(key)
        links.push({ source: note.id, target: target.id })
      }
    }

    return { nodes, links }
  }, [allNotes])

  // ── Build + render D3 graph ────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const { nodes, links } = buildGraph()
    nodesRef.current = nodes

    const width  = containerRef.current.clientWidth  || 900
    const height = containerRef.current.clientHeight || 600

    const svgEl = d3.select(svgRef.current)
    svgEl.selectAll('*').remove()

    const g = svgEl.append('g')

    const zoom = d3.zoom()
      .scaleExtent([0.1, 5])
      .on('zoom', ({ transform }) => g.attr('transform', transform))
    svgEl.call(zoom)

    function fitView() {
      if (!nodes.length) return
      const xs = nodes.map(d => d.x), ys = nodes.map(d => d.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const w = maxX - minX || 1, h = maxY - minY || 1
      const pad   = 80
      const scale = Math.min(0.9, (width - pad * 2) / w, (height - pad * 2) / h)
      svgEl.transition().duration(600).call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2 - scale * ((minX + maxX) / 2),
                     height / 2 - scale * ((minY + maxY) / 2))
          .scale(scale)
      )
    }

    // Arrow marker
    svgEl.append('defs').append('marker')
      .attr('id', 'wiki-arrow').attr('viewBox', '0 -5 10 10')
      .attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#cbd5e1')

    // Links
    const linkEls = g.append('g').attr('class', 'links')
      .selectAll('line').data(links).join('line')
      .attr('stroke', '#cbd5e1').attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#wiki-arrow)')

    // Node groups
    const nodeEls = g.append('g').attr('class', 'nodes')
      .selectAll('g').data(nodes).join('g')
      .attr('cursor', 'pointer')
      .on('click',      (event, d) => { event.stopPropagation(); onNoteClick?.(d.id) })
      .on('mouseenter', (_, d)     => setHoveredNode(d))
      .on('mouseleave', ()         => setHoveredNode(null))

    nodeEls.call(d3.drag()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
    )

    nodeEls.append('circle').attr('r', 14).attr('fill', 'transparent')          // hit area
    nodeEls.append('circle').attr('r', 9)
      .attr('fill', d => SOURCE_COLOR[d.source] || SOURCE_COLOR.library)
      .attr('stroke', '#fff').attr('stroke-width', 2.5)
    nodeEls.append('text').text(d => d.name)
      .attr('x', 13).attr('y', 4)
      .attr('font-size', '11px')
      .attr('font-family', 'ui-sans-serif, system-ui, sans-serif')
      .attr('fill', '#334155').attr('pointer-events', 'none')

    // ── Clustering force (reads clusterRef each tick) ──────────────────────
    function clusterForce(alpha) {
      const strength = clusterRef.current
      if (!strength) return

      // Compute centroid per sourceKey group
      const centroids = {}
      nodes.forEach(d => {
        if (!centroids[d.sourceKey]) centroids[d.sourceKey] = { x: 0, y: 0, n: 0 }
        centroids[d.sourceKey].x += d.x || 0
        centroids[d.sourceKey].y += d.y || 0
        centroids[d.sourceKey].n++
      })
      for (const c of Object.values(centroids)) { c.x /= c.n; c.y /= c.n }

      // Pull each node toward its group centroid
      nodes.forEach(d => {
        const c = centroids[d.sourceKey]
        if (!c) return
        d.vx = (d.vx || 0) + (c.x - d.x) * strength * alpha
        d.vy = (d.vy || 0) + (c.y - d.y) * strength * alpha
      })
    }

    // ── Simulation ─────────────────────────────────────────────────────────
    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(links).id(d => d.id).distance(100).strength(0.6))
      .force('charge',    d3.forceManyBody().strength(-250))
      .force('center',    d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(22))
      .force('cluster',   clusterForce)   // custom force registered by name

    simRef.current = sim

    sim.on('tick', () => {
      linkEls
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      nodeEls.attr('transform', d => `translate(${d.x},${d.y})`)
    })
    sim.on('end', fitView)

    return () => sim.stop()
  }, [buildGraph, onNoteClick])

  const { nodes, links } = buildGraph()

  const presentSources = [...new Set(nodes.map(n => n.source))]

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-w-0 overflow-hidden">

      {/* Header bar */}
      <div className="px-4 py-2 border-b border-slate-100 bg-white flex items-center justify-between flex-shrink-0 gap-4">
        {/* Left: title + counts */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
            <Icon name="hub" className="text-[15px] text-indigo-500" />
            Graph View
          </span>
          <span className="text-[11px] text-slate-400">
            {nodes.length} notes · {links.length} links
          </span>
        </div>

        {/* Centre: clustering slider */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Icon name="grain" className="text-[14px] text-slate-400 flex-shrink-0" />
          <span className="text-[11px] text-slate-500 flex-shrink-0 whitespace-nowrap">Clustering</span>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={clusterStrength}
            onChange={e => setClusterStrength(parseFloat(e.target.value))}
            className="flex-1 accent-indigo-500 cursor-pointer"
            title={`Clustering strength: ${Math.round(clusterStrength * 100)}%`}
          />
          <span className="text-[11px] text-slate-400 w-7 text-right flex-shrink-0 tabular-nums">
            {Math.round(clusterStrength * 100)}%
          </span>
        </div>

        {/* Right: legend + tip */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {presentSources.map(src => (
              <div key={src} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: SOURCE_COLOR[src] }} />
                <span className="text-[10px] text-slate-500">{SOURCE_LABEL[src]}</span>
              </div>
            ))}
          </div>
          <span className="text-[10px] text-slate-300 hidden sm:block">
            Drag · Scroll to zoom · Click to open
          </span>
        </div>
      </div>

      {/* Hovered node label — bottom left */}
      {hoveredNode && (
        <div
          className="absolute z-50 bg-slate-800 text-white text-[11px] rounded-md px-2 py-1 pointer-events-none"
          style={{ bottom: 12, left: 12 }}
        >
          <span className="opacity-60 mr-1">{SOURCE_LABEL[hoveredNode.source]}</span>
          {hoveredNode.name}
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Icon name="hub" className="text-[48px] text-slate-200" />
          <div className="text-center">
            <p className="text-[13px] text-slate-400 font-medium">No notes to graph yet</p>
            <p className="text-[11px] text-slate-300 mt-1">
              Create notes and use{' '}
              <code className="bg-slate-100 px-1 rounded">[[wiki links]]</code> to connect them
            </p>
          </div>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="flex-1 w-full h-full"
          style={{ background: 'radial-gradient(ellipse at center, #f8fafc 0%, #f1f5f9 100%)' }}
        />
      )}
    </div>
  )
}
