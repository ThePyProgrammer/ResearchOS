import { useEffect, useRef, useCallback, useState } from 'react'
import * as d3 from 'd3'
import { extractWikiLinks } from './WikiLinkExtension'
import { useLocalStorage } from '../hooks/useLocalStorage'

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

// Generate padding points in a circle around a node position.
// Using multiple points per node means the convex hull naturally
// becomes a smooth "inflated" shape even for 1–2 node groups.
function paddedHullPoints(nodePoints, radius = 30, resolution = 10) {
  const result = []
  for (const [x, y] of nodePoints) {
    for (let i = 0; i < resolution; i++) {
      const angle = (i / resolution) * Math.PI * 2
      result.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius])
    }
  }
  return result
}

// Smooth closed path through hull vertices using Catmull-Rom
const smoothLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5))

export default function NoteGraphView({
  allNotes,
  collections = [],
  sourceKeyCollections = {},
  onNoteClick,
  customSourceColors = {},
  customSourceLabels = {},
  storagePrefix = 'researchos.graph.',
}) {
  // Merge custom colors/labels with defaults so callers can add new node types
  // (e.g. 'project', 'experiment') without forking the component.
  const mergedColors = { ...SOURCE_COLOR, ...customSourceColors }
  const mergedLabels = { ...SOURCE_LABEL, ...customSourceLabels }

  const svgRef          = useRef(null)
  const svgWrapperRef   = useRef(null)   // used for D3 size measurement
  const simRef          = useRef(null)
  const clusterRef      = useRef(0.3)    // selective: same-source pull
  const gravityRef      = useRef(0.5)    // global: all-nodes pull toward centre
  const collDropRef     = useRef(null)   // for outside-click detection on collection dropdown
  const nodeElsRef      = useRef(null)   // D3 selection of node groups — for search highlight
  const linkElsRef      = useRef(null)   // D3 selection of link lines  — for search highlight
  const hullEntriesRef  = useRef([])     // hull {path, label, nodes}   — for search highlight

  const [hoveredNode,     setHoveredNode]     = useState(null)
  const [clusterStrength, setClusterStrength] = useLocalStorage(`${storagePrefix}clusterStrength`, 0.3)
  const [gravityStrength, setGravityStrength] = useLocalStorage(`${storagePrefix}gravityStrength`, 0.5)

  // Options panel
  const [panelOpen,       setPanelOpen]       = useLocalStorage(`${storagePrefix}panelOpen`,       false)
  const [visibleTypes,    setVisibleTypes]    = useLocalStorage(`${storagePrefix}visibleTypes`,    { library: true, paper: true, website: true, github: true })
  const [hullCollections, setHullCollections] = useLocalStorage(`${storagePrefix}hullCollections`, [])
  const [collSearch,      setCollSearch]      = useState('')
  const [collDropOpen,    setCollDropOpen]    = useState(false)

  // Graph search
  const [graphSearch, setGraphSearch] = useState('')

  // ── Close collection dropdown on outside click ──────────────────────────────
  useEffect(() => {
    function handleOutsideClick(e) {
      if (collDropRef.current && !collDropRef.current.contains(e.target)) {
        setCollDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // ── Slider refs keep sim in sync without full rebuild ────────────────────────
  useEffect(() => {
    clusterRef.current = clusterStrength
    if (simRef.current) simRef.current.alpha(0.35).restart()
  }, [clusterStrength])

  useEffect(() => {
    gravityRef.current = gravityStrength
    if (simRef.current) simRef.current.alpha(0.35).restart()
  }, [gravityStrength])

  // ── Search highlight: opacity pass directly on stored D3 selections ──────────
  useEffect(() => {
    const nodeEls    = nodeElsRef.current
    const linkEls    = linkElsRef.current
    const hulls      = hullEntriesRef.current
    if (!nodeEls) return

    const q = graphSearch.trim().toLowerCase()
    if (!q) {
      nodeEls.attr('opacity', null)
      linkEls?.attr('opacity', null)
      hulls.forEach(({ path, label }) => { path.attr('opacity', null); label.attr('opacity', null) })
      return
    }

    const DIM = 0.25
    const matches = d => d.name.toLowerCase().includes(q) || (d.sourceName ?? '').toLowerCase().includes(q)
    nodeEls.attr('opacity', d => matches(d) ? 1 : DIM)
    linkEls?.attr('opacity', d => (matches(d.source) || matches(d.target)) ? 0.6 : DIM)
    hulls.forEach(({ nodes: gNodes, path, label }) => {
      const hit = gNodes.some(d => matches(d))
      path.attr('opacity',  hit ? 1   : DIM)
      label.attr('opacity', hit ? 0.7 : DIM)
    })
  }, [graphSearch])

  // ── Build graph data (filtered by visibleTypes and selected collections) ───────
  const buildGraph = useCallback(() => {
    const fileNotes = allNotes.filter(n => {
      if (n.type !== 'file') return false
      if (visibleTypes[n.source ?? 'library'] === false) return false
      if (hullCollections.length > 0 && (n.sourceKey ?? n.source ?? 'library') !== 'library') {
        const collIds = sourceKeyCollections[n.sourceKey ?? n.source ?? 'library'] || []
        if (!collIds.some(id => hullCollections.includes(id))) return false
      }
      return true
    })

    const nameMultiMap = new Map()
    for (const n of fileNotes) {
      const key = n.name.toLowerCase()
      if (!nameMultiMap.has(key)) nameMultiMap.set(key, [])
      nameMultiMap.get(key).push(n)
    }
    const idMap = new Map(fileNotes.map(n => [n.id, n]))

    const nodes = fileNotes.map(n => ({
      id:         n.id,
      name:       n.name,
      source:     n.source     ?? 'library',
      sourceKey:  n.sourceKey  ?? n.source ?? 'library',
      sourceName: n.sourceName ?? mergedLabels[n.source] ?? 'Library',
    }))

    const nodeIdSet = new Set(nodes.map(n => n.id))
    const linkSet   = new Set()
    const links     = []

    for (const note of fileNotes) {
      for (const { name: targetName, noteId: targetId } of extractWikiLinks(note.content || '')) {
        let target
        if (targetId) {
          target = idMap.get(targetId)
        } else {
          const candidates = nameMultiMap.get(targetName.toLowerCase()) || []
          target = candidates.find(c => c.sourceKey === note.sourceKey) ?? candidates[0]
        }
        if (!target || !nodeIdSet.has(target.id) || target.id === note.id) continue
        const key = `${note.id}→${target.id}`
        if (linkSet.has(key)) continue
        linkSet.add(key)
        links.push({ source: note.id, target: target.id })
      }
    }

    // Degree = total connections (in + out) per node
    const degree = Object.fromEntries(nodes.map(n => [n.id, 0]))
    for (const l of links) {
      degree[l.source] = (degree[l.source] || 0) + 1
      degree[l.target] = (degree[l.target] || 0) + 1
    }
    for (const n of nodes) n.degree = degree[n.id] || 0

    return { nodes, links }
  }, [allNotes, visibleTypes, hullCollections, sourceKeyCollections])

  // ── D3 render ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !svgWrapperRef.current) return

    const { nodes, links } = buildGraph()

    const width  = svgWrapperRef.current.clientWidth  || 900
    const height = svgWrapperRef.current.clientHeight || 600

    const svgEl = d3.select(svgRef.current)
    svgEl.selectAll('*').remove()

    // ── Defs: arrow marker + dot-grid pattern ─────────────────────────────────
    const defs = svgEl.append('defs')

    defs.append('marker')
      .attr('id', 'wiki-arrow').attr('viewBox', '0 -5 10 10')
      .attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#cbd5e1')

    const dotPattern = defs.append('pattern')
      .attr('id', 'dot-grid')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 24).attr('height', 24)
    dotPattern.append('circle')
      .attr('cx', 12).attr('cy', 12).attr('r', 1)
      .attr('fill', '#cbd5e1')

    // Background rect — sits behind the zoom group, pattern moves with zoom
    svgEl.append('rect')
      .attr('width', width).attr('height', height)
      .attr('fill', 'url(#dot-grid)')

    const g = svgEl.append('g')

    const zoom = d3.zoom()
      .scaleExtent([0.1, 5])
      .on('zoom', ({ transform }) => {
        g.attr('transform', transform)
        dotPattern.attr('patternTransform', transform)
      })
    svgEl.call(zoom)

    function fitView() {
      if (!nodes.length) return
      const xs = nodes.map(d => d.x), ys = nodes.map(d => d.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const w = maxX - minX || 1, h = maxY - minY || 1
      const pad   = 100
      const scale = Math.min(0.9, (width - pad * 2) / w, (height - pad * 2) / h)
      svgEl.transition().duration(600).call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2 - scale * ((minX + maxX) / 2),
                     height / 2 - scale * ((minY + maxY) / 2))
          .scale(scale)
      )
    }

    // ── Hull layer (behind everything) ────────────────────────────────────────
    const hullLayer = g.append('g').attr('class', 'hulls')
    const groupMap  = d3.group(nodes, d => d.sourceKey)

    const hullEntries = []
    for (const [key, groupNodes] of groupMap) {
      const source   = groupNodes[0].source
      const color    = mergedColors[source] || mergedColors.library
      const label    = groupNodes[0].sourceName || mergedLabels[source] || key

      const hullPath = hullLayer.append('path')
        .attr('fill',           color)
        .attr('fill-opacity',   0.07)
        .attr('stroke',         color)
        .attr('stroke-opacity', 0.35)
        .attr('stroke-width',   1.5)
        .attr('stroke-dasharray', '5,3')
        .attr('stroke-linejoin', 'round')

      const displayLabel = label.length > 32 ? label.slice(0, 30) + '…' : label

      const hullLabel = hullLayer.append('text')
        .text(displayLabel)
        .attr('font-size',   '13px')
        .attr('font-family', 'ui-sans-serif, system-ui, sans-serif')
        .attr('font-weight', '500')
        .attr('fill',         color)
        .attr('fill-opacity', 0.7)
        .attr('text-anchor',  'middle')
        .attr('pointer-events', 'none')

      hullEntries.push({ sourceKey: key, nodes: groupNodes, path: hullPath, label: hullLabel })
    }
    hullEntriesRef.current = hullEntries

    // ── Links ─────────────────────────────────────────────────────────────────
    const linkEls = g.append('g').attr('class', 'links')
      .selectAll('line').data(links).join('line')
      .attr('stroke', '#cbd5e1').attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#wiki-arrow)')
    linkElsRef.current = linkEls

    // ── Nodes ─────────────────────────────────────────────────────────────────
    const maxDegree = Math.max(1, ...nodes.map(d => d.degree))
    const nodeRadius = d3.scaleSqrt().domain([0, maxDegree]).range([6, 16])

    const nodeEls = g.append('g').attr('class', 'nodes')
      .selectAll('g').data(nodes).join('g')
      .attr('cursor', 'pointer')
      .on('click',       (event, d) => { event.stopPropagation(); onNoteClick?.(d.id) })
      .on('contextmenu', (event, d) => {
        event.preventDefault()
        event.stopPropagation()
        d.pinned = !d.pinned
        if (d.pinned) { d.fx = d.x; d.fy = d.y }
        else          { d.fx = null; d.fy = null; sim.alpha(0.2).restart() }
        d3.select(event.currentTarget).select('.pin-ring')
          .attr('display', d.pinned ? null : 'none')
      })
      .on('mouseenter',  (_, d) => setHoveredNode(d))
      .on('mouseleave',  ()     => setHoveredNode(null))
    nodeElsRef.current = nodeEls

    nodeEls.call(d3.drag()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); if (!d.pinned) { d.fx = null; d.fy = null } })
    )

    // Pin-ring: amber dashed ring, hidden by default, shown when node is pinned
    nodeEls.append('circle').attr('class', 'pin-ring')
      .attr('r', d => nodeRadius(d.degree) + 4)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '3,2')
      .attr('display', 'none')
      .attr('pointer-events', 'none')

    nodeEls.append('circle').attr('r', d => nodeRadius(d.degree) + 5).attr('fill', 'transparent')
    nodeEls.append('circle').attr('r', d => nodeRadius(d.degree))
      .attr('fill',   d => mergedColors[d.source] || mergedColors.library)
      .attr('stroke', '#fff').attr('stroke-width', 2.5)
    nodeEls.append('text').text(d => d.name)
      .attr('x', 0).attr('y', d => nodeRadius(d.degree) + 13)
      .attr('font-size',   '11px')
      .attr('font-family', 'ui-sans-serif, system-ui, sans-serif')
      .attr('fill',        '#334155')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')

    // ── Selective clustering force (pulls same-source nodes together) ─────────
    function clusterForce(alpha) {
      const strength = clusterRef.current
      if (!strength) return
      const centroids = {}
      nodes.forEach(d => {
        if (!centroids[d.sourceKey]) centroids[d.sourceKey] = { x: 0, y: 0, n: 0 }
        centroids[d.sourceKey].x += d.x || 0
        centroids[d.sourceKey].y += d.y || 0
        centroids[d.sourceKey].n++
      })
      for (const c of Object.values(centroids)) { c.x /= c.n; c.y /= c.n }
      nodes.forEach(d => {
        const c = centroids[d.sourceKey]
        if (!c) return
        d.vx = (d.vx || 0) + (c.x - d.x) * strength * alpha
        d.vy = (d.vy || 0) + (c.y - d.y) * strength * alpha
      })
    }

    // ── Global gravity force (pulls every node toward canvas centre) ──────────
    const cx = width / 2, cy = height / 2
    function gravityForce(alpha) {
      const g = gravityRef.current
      if (!g) return
      nodes.forEach(d => {
        d.vx = (d.vx || 0) + (cx - d.x) * g * alpha * 0.08
        d.vy = (d.vy || 0) + (cy - d.y) * g * alpha * 0.08
      })
    }

    // ── Simulation ────────────────────────────────────────────────────────────
    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(links).id(d => d.id).distance(100).strength(0.6))
      .force('charge',    d3.forceManyBody().strength(-250))
      .force('center',    d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(d => nodeRadius(d.degree) + Math.max(20, d.name.length * 3.2)))
      .force('cluster',   clusterForce)
      .force('gravity',   gravityForce)

    simRef.current = sim

    sim.on('tick', () => {
      linkEls
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)

      nodeEls.attr('transform', d => `translate(${d.x},${d.y})`)

      for (const { nodes: gNodes, path, label } of hullEntries) {
        const pts  = paddedHullPoints(gNodes.map(d => [d.x, d.y]))
        const hull = d3.polygonHull(pts)
        if (!hull) continue
        path.attr('d', smoothLine(hull))
        const topY  = Math.min(...hull.map(p => p[1]))
        const centX = d3.polygonCentroid(hull)[0]
        label.attr('x', centX).attr('y', topY - 5)
      }
    })

    sim.on('end', fitView)

    return () => {
      sim.stop()
      nodeElsRef.current   = null
      linkElsRef.current   = null
      hullEntriesRef.current = []
    }
  }, [buildGraph, onNoteClick])

  // ── Derive display data (no D3 side-effects) ─────────────────────────────────
  const { nodes, links } = buildGraph()
  const presentSources   = [...new Set(nodes.map(n => n.source))]

  const filteredCollections = collections.filter(c =>
    c.name.toLowerCase().includes(collSearch.toLowerCase())
  )

  function toggleType(type) {
    setVisibleTypes(prev => ({ ...prev, [type]: !prev[type] }))
  }

  function toggleCollection(key) {
    setHullCollections(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

      {/* Header bar */}
      <div className="px-4 py-2 border-b border-slate-100 bg-white flex items-center justify-between flex-shrink-0 gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
            <Icon name="hub" className="text-[15px] text-indigo-500" />
            Graph View
          </span>
          <span className="text-[11px] text-slate-400">
            {nodes.length} notes · {links.length} links
          </span>
        </div>

        {/* Graph search */}
        <div className="relative flex items-center flex-1 max-w-[220px]">
          <Icon name="search" className="absolute left-2 text-[13px] text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={graphSearch}
            onChange={e => setGraphSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setGraphSearch('')}
            placeholder="Search nodes…"
            className="w-full pl-6 pr-5 py-1 text-[11px] bg-slate-100 border border-transparent rounded-lg focus:outline-none focus:border-indigo-300 focus:bg-white transition-colors placeholder-slate-400 text-slate-700"
          />
          {graphSearch && (
            <button
              onClick={() => setGraphSearch('')}
              className="absolute right-1.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Icon name="close" className="text-[12px]" />
            </button>
          )}
        </div>

        {/* Legend + tip */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {presentSources.map(src => (
              <div key={src} className="flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: mergedColors[src] }}
                />
                <span className="text-[10px] text-slate-500">{mergedLabels[src]}</span>
              </div>
            ))}
          </div>
          <span className="text-[10px] text-slate-300 hidden sm:block">
            Drag · Scroll to zoom · Click to open
          </span>
        </div>
      </div>

      {/* Hovered node tooltip — bottom left */}
      {hoveredNode && (
        <div
          className="absolute z-50 bg-slate-800 text-white text-[11px] rounded-md px-2 py-1 pointer-events-none"
          style={{ bottom: 12, left: 12 }}
        >
          <span className="opacity-60 mr-1">{mergedLabels[hoveredNode.source]}</span>
          {hoveredNode.name}
        </div>
      )}

      {/* SVG area — always rendered so options panel is accessible */}
      <div ref={svgWrapperRef} className="flex-1 relative overflow-hidden">
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3 z-0">
            <Icon name="hub" className="text-[48px] text-slate-200" />
            <div className="text-center">
              <p className="text-[13px] text-slate-400 font-medium">No notes to graph yet</p>
              <p className="text-[11px] text-slate-300 mt-1">
                Create notes and use{' '}
                <code className="bg-slate-100 px-1 rounded">[[wiki links]]</code> to connect them
              </p>
            </div>
          </div>
        )}
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ background: 'radial-gradient(ellipse at center, #f8fafc 0%, #f1f5f9 100%)' }}
          />

          {/* ── Options panel — top-right overlay ─────────────────────────── */}
          <div className="absolute top-3 right-3 z-10 flex flex-col items-end">

            {/* Toggle button */}
            <button
              onClick={() => setPanelOpen(o => !o)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium shadow-sm border transition-all ${
                panelOpen
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white/90 backdrop-blur border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              title="Graph options"
            >
              <Icon name="tune" className="text-[14px]" />
              Options
              <Icon name={panelOpen ? 'expand_less' : 'expand_more'} className="text-[13px]" />
            </button>

            {/* Collapsible panel */}
            {panelOpen && (
              <div className="mt-1.5 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-4 w-72 flex flex-col gap-4">

                {/* ── Physics ───────────────────────────────────────────── */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                    Physics
                  </p>

                  {/* Selective gravity */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <Icon name="grain" className="text-[13px] text-slate-400 flex-shrink-0" />
                    <span className="text-[11px] text-slate-600 flex-shrink-0 w-20">Selective</span>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={clusterStrength}
                      onChange={e => setClusterStrength(parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-500 cursor-pointer"
                      title={`Selective clustering: ${Math.round(clusterStrength * 100)}%`}
                    />
                    <span className="text-[11px] text-slate-400 w-7 text-right tabular-nums flex-shrink-0">
                      {Math.round(clusterStrength * 100)}%
                    </span>
                  </div>

                  {/* Overall gravity */}
                  <div className="flex items-center gap-2">
                    <Icon name="filter_center_focus" className="text-[13px] text-slate-400 flex-shrink-0" />
                    <span className="text-[11px] text-slate-600 flex-shrink-0 w-20">Gravity</span>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={gravityStrength}
                      onChange={e => setGravityStrength(parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-500 cursor-pointer"
                      title={`Global gravity: ${Math.round(gravityStrength * 100)}%`}
                    />
                    <span className="text-[11px] text-slate-400 w-7 text-right tabular-nums flex-shrink-0">
                      {Math.round(gravityStrength * 100)}%
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                {/* ── Show ──────────────────────────────────────────────── */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                    Show
                  </p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                    {Object.keys(mergedColors).map(type => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={visibleTypes[type] !== false}
                          onChange={() => toggleType(type)}
                          className="accent-indigo-500 cursor-pointer w-3.5 h-3.5"
                        />
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: mergedColors[type] }}
                        />
                        <span className="text-[11px] text-slate-600 group-hover:text-slate-800 transition-colors">
                          {mergedLabels[type]}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                {/* ── Hull Collections ──────────────────────────────────── */}
                <div ref={collDropRef}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                      Hull Collections
                    </p>
                    {hullCollections.length > 0 && (
                      <button
                        onClick={() => { setHullCollections([]); setCollSearch('') }}
                        className="text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {/* Selected collection chips */}
                  {hullCollections.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {hullCollections.map(id => {
                        const coll = collections.find(c => c.id === id)
                        if (!coll) return null
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                          >
                            {coll.name.length > 22 ? coll.name.slice(0, 20) + '…' : coll.name}
                            <button
                              onClick={() => toggleCollection(id)}
                              className="ml-0.5 leading-none hover:opacity-60 transition-opacity"
                              title={`Remove ${coll.name}`}
                            >
                              ×
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {/* Autocomplete input + dropdown */}
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={
                          hullCollections.length === 0
                            ? 'All collections shown…'
                            : 'Add another…'
                        }
                        value={collSearch}
                        onChange={e => { setCollSearch(e.target.value); setCollDropOpen(true) }}
                        onFocus={() => setCollDropOpen(true)}
                        className="w-full text-[11px] px-2.5 pr-7 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 transition"
                      />
                      <button
                        onMouseDown={e => { e.preventDefault(); setCollDropOpen(o => !o) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        tabIndex={-1}
                      >
                        <Icon
                          name={collDropOpen ? 'expand_less' : 'expand_more'}
                          className="text-[15px]"
                        />
                      </button>
                    </div>

                    {/* Dropdown list */}
                    {collDropOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto z-20">
                        {filteredCollections.length === 0 ? (
                          <p className="text-[11px] text-slate-400 px-3 py-2">
                            {collections.length === 0 ? 'No collections in this library' : 'No collections found'}
                          </p>
                        ) : (
                          filteredCollections.map(coll => (
                            <label
                              key={coll.id}
                              className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={hullCollections.includes(coll.id)}
                                onChange={() => toggleCollection(coll.id)}
                                className="accent-indigo-500 w-3.5 h-3.5 cursor-pointer flex-shrink-0"
                              />
                              <Icon name="folder" className="text-[13px] text-amber-500 flex-shrink-0" />
                              <span className="text-[11px] text-slate-600 truncate">{coll.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    {hullCollections.length === 0
                      ? 'All hull boundaries visible'
                      : `${hullCollections.length} collection${hullCollections.length > 1 ? 's' : ''} selected`}
                  </p>
                </div>

              </div>
            )}
          </div>
        </div>
    </div>
  )
}
