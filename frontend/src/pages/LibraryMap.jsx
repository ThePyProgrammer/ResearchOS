import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import * as d3 from 'd3'
import { searchApi, papersApi, websitesApi, githubReposApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'
import WindowModal from '../components/WindowModal'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// ── Colour palettes ──────────────────────────────────────────────────────────
const COLLECTION_PALETTE = [
  '#60a5fa', '#34d399', '#a78bfa', '#fbbf24', '#f87171',
  '#4ade80', '#fb923c', '#22d3ee', '#f472b6', '#a3e635',
  '#c084fc', '#38bdf8', '#fb7185', '#86efac', '#fde047',
]
const UNCOLLECTED_COLOR = '#334155'
const ITEM_COLORS = {
  paper:       '#60a5fa',
  website:     '#34d399',
  github_repo: '#a78bfa',
}
const TYPE_LABELS = { paper: 'Paper', website: 'Website', github_repo: 'GitHub Repo' }

// ── Pure helpers ─────────────────────────────────────────────────────────────
function buildColMap(collections) {
  const map = {}
  collections.forEach((col, i) => {
    map[col.id] = { name: col.name, color: COLLECTION_PALETTE[i % COLLECTION_PALETTE.length] }
  })
  return map
}

function getColor(pt, colorBy, colMap) {
  if (colorBy === 'type') return ITEM_COLORS[pt.itemType] || UNCOLLECTED_COLOR
  if (!pt.collections?.length) return UNCOLLECTED_COLOR
  return colMap[pt.collections[0]]?.color || UNCOLLECTED_COLOR
}

// KNN proximity edges — k nearest neighbours within maxDist, deduped
function proximityEdges(points, k = 3, maxDist = 0.7) {
  const seen = new Set()
  const edges = []
  for (let i = 0; i < points.length; i++) {
    const dists = []
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      const d  = Math.sqrt(dx * dx + dy * dy)
      if (d <= maxDist) dists.push({ j, d })
    }
    dists.sort((a, b) => a.d - b.d)
    for (const { j, d } of dists.slice(0, k)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (!seen.has(key)) { seen.add(key); edges.push({ source: points[i], target: points[j], dist: d }) }
    }
  }
  return edges
}

// Convex hulls — group by first collection or item type
function buildHulls(points, colorBy, colMap) {
  const groups = {}
  for (const pt of points) {
    const key = colorBy === 'type'
      ? (pt.itemType || 'paper')
      : (pt.collections?.[0] || null)
    if (!key) continue
    if (!groups[key]) groups[key] = []
    groups[key].push(pt)
  }
  return Object.entries(groups)
    .filter(([, pts]) => pts.length >= 3)
    .map(([key, pts]) => ({
      pts,
      color: colorBy === 'type' ? (ITEM_COLORS[key] || UNCOLLECTED_COLOR) : (colMap[key]?.color || UNCOLLECTED_COLOR),
    }))
}

// ── Main component ───────────────────────────────────────────────────────────
export default function LibraryMap() {
  const { activeLibraryId, collections, createCollection } = useLibrary()
  const navigate = useNavigate()

  const svgRef       = useRef(null)
  const wrapperRef   = useRef(null)
  const transformRef = useRef(d3.zoomIdentity)
  const colMapRef    = useRef({})

  const [points,          setPoints]          = useState([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [colorBy,         setColorBy]         = useState('collection')
  const [selectMode,      setSelectMode]      = useState(false)
  const [selectedPoints,  setSelectedPoints]  = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newColName,      setNewColName]      = useState('')
  const [saving,          setSaving]          = useState(false)
  const [legendOpen,      setLegendOpen]      = useState(true)

  const colMap = buildColMap(collections)
  colMapRef.current = colMap

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeLibraryId) return
    setLoading(true); setError(null); setPoints([])
    searchApi.map(activeLibraryId)
      .then(data => { setPoints(data); setLoading(false) })
      .catch(err  => { setError(err.message); setLoading(false) })
  }, [activeLibraryId])

  // ── D3 chart ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const svgEl     = svgRef.current
    const wrapperEl = wrapperRef.current
    if (!svgEl || !wrapperEl || loading || !points.length) return

    const svg    = d3.select(svgEl)
    svg.selectAll('*').remove()

    const width  = wrapperEl.clientWidth  || 900
    const height = wrapperEl.clientHeight || 600
    const M      = 48  // margin

    svg.attr('width', width).attr('height', height)

    // ── Defs ──────────────────────────────────────────────────────────────────
    const defs = svg.append('defs')

    // Cyan-tinted dot grid
    const pat = defs.append('pattern')
      .attr('id', 'dot-map').attr('width', 28).attr('height', 28)
      .attr('patternUnits', 'userSpaceOnUse')
    pat.append('circle').attr('cx', 1).attr('cy', 1).attr('r', 0.9).attr('fill', '#0c2a3e')

    // Radial vignette
    const vig = defs.append('radialGradient').attr('id', 'vignette')
      .attr('cx', '50%').attr('cy', '50%').attr('r', '52%')
    vig.append('stop').attr('offset', '0%').attr('stop-color', '#060e1c').attr('stop-opacity', 0)
    vig.append('stop').attr('offset', '100%').attr('stop-color', '#010409').attr('stop-opacity', 1)

    // Neon glow filter (multi-pass bloom)
    const flt = defs.append('filter').attr('id', 'glow')
      .attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%')
    flt.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '2').attr('result', 'b1')
    flt.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '5').attr('result', 'b2')
    flt.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '10').attr('result', 'b3')
    const glowMerge = flt.append('feMerge')
    glowMerge.append('feMergeNode').attr('in', 'b3')
    glowMerge.append('feMergeNode').attr('in', 'b2')
    glowMerge.append('feMergeNode').attr('in', 'b1')
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Softer glow for hulls
    const hullFlt = defs.append('filter').attr('id', 'hull-glow')
      .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%')
    hullFlt.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'hb')
    const hullMerge = hullFlt.append('feMerge')
    hullMerge.append('feMergeNode').attr('in', 'hb')
    hullMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Scan line gradient
    const sg = defs.append('linearGradient').attr('id', 'scan-grad')
    sg.append('stop').attr('offset', '0%').attr('stop-color', 'transparent')
    sg.append('stop').attr('offset', '25%').attr('stop-color', '#22d3ee').attr('stop-opacity', 0.5)
    sg.append('stop').attr('offset', '50%').attr('stop-color', '#67e8f9').attr('stop-opacity', 0.8)
    sg.append('stop').attr('offset', '75%').attr('stop-color', '#22d3ee').attr('stop-opacity', 0.5)
    sg.append('stop').attr('offset', '100%').attr('stop-color', 'transparent')

    // ── Background layers ──────────────────────────────────────────────────────
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', '#060e1c')
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#dot-map)')
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#vignette)')

    // ── HUD corners ────────────────────────────────────────────────────────────
    const B = 20, P = 10
    ;[
      `M ${P+B},${P} L ${P},${P} L ${P},${P+B}`,
      `M ${width-P-B},${P} L ${width-P},${P} L ${width-P},${P+B}`,
      `M ${P+B},${height-P} L ${P},${height-P} L ${P},${height-P-B}`,
      `M ${width-P-B},${height-P} L ${width-P},${height-P} L ${width-P},${height-P-B}`,
    ].forEach(d => svg.append('path').attr('d', d)
      .attr('fill', 'none').attr('stroke', '#22d3ee')
      .attr('stroke-width', 1.5).attr('opacity', 0.35))

    // ── Zoom level readout ─────────────────────────────────────────────────────
    const zoomLabel = svg.append('text')
      .attr('x', width - P - 4).attr('y', height - P - 4)
      .attr('text-anchor', 'end')      .attr('fill', '#1e4a6a')
      .attr('font-size', '10').attr('font-family', 'monospace')
      .attr('letter-spacing', '0.06em').text('1.0×')

    // ── Scan line ──────────────────────────────────────────────────────────────
    const scanLine = svg.append('rect')
      .attr('x', 0).attr('width', width).attr('height', 2)
      .attr('fill', 'url(#scan-grad)').attr('opacity', 0).attr('y', 0)

    let alive = true
    let scanTimer = null
    function doScan() {
      if (!alive) return
      scanLine.interrupt()
        .attr('y', -2).attr('opacity', 0)
        .transition().duration(300).attr('opacity', 0.7)
        .transition().duration(4000).ease(d3.easeLinear).attr('y', height + 2)
        .transition().duration(300).attr('opacity', 0)
        .on('end', () => { if (alive) scanTimer = setTimeout(doScan, 5000) })
    }
    scanTimer = setTimeout(doScan, 2000)

    // ── Data scales ────────────────────────────────────────────────────────────
    const W = width  - M * 2
    const H = height - M * 2
    const xScale = d3.scaleLinear().domain([-1.1, 1.1]).range([0, W])
    const yScale = d3.scaleLinear().domain([-1.1, 1.1]).range([H, 0])

    // ── Layer structure ────────────────────────────────────────────────────────
    // gMain  — fixed margin translate
    //   gData    — receives zoom transform; circles, edges, hulls live here
    //   gOverlay — NOT zoom-transformed; ripple effects (pointer-events:none)
    //   gBrush   — NOT zoom-transformed; brush overlay
    const gMain    = svg.append('g').attr('transform', `translate(${M},${M})`)
    const gData    = gMain.append('g').attr('class', 'data-layer')
    const gOverlay = gMain.append('g').style('pointer-events', 'none')
    const gBrush   = gMain.append('g').attr('class', 'brush-layer')

    gData.attr('transform', transformRef.current)

    // ── Hull fills (drawn first, beneath lines and circles) ───────────────────
    const hulls = buildHulls(points, colorBy, colMapRef.current)
    const hullLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5))

    gData.selectAll('.hull')
      .data(hulls)
      .join('path')
      .attr('class', 'hull')
      .attr('d', h => {
        const pts2d = h.pts.map(p => [xScale(p.x), yScale(p.y)])
        const hull  = d3.polygonHull(pts2d)
        if (!hull) return null
        const cx = d3.mean(hull, p => p[0])
        const cy = d3.mean(hull, p => p[1])
        const expanded = hull.map(([px, py]) => {
          const dx = px - cx, dy = py - cy
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          return [px + (dx / len) * 30, py + (dy / len) * 30]
        })
        return hullLine(expanded)
      })
      .attr('fill', h => h.color)
      .attr('fill-opacity', 0.06)
      .attr('stroke', h => h.color)
      .attr('stroke-opacity', 0)
      .attr('stroke-width', 1.5)
      .attr('filter', 'url(#hull-glow)')
      .attr('opacity', 0)
      .transition().duration(700).delay(200)
        .attr('opacity', 1)
        .attr('stroke-opacity', 0.2)

    // ── Constellation lines ────────────────────────────────────────────────────
    const edges = proximityEdges(points)

    gData.selectAll('.edge')
      .data(edges)
      .join('line')
      .attr('class', 'edge')
      .attr('x1', e => xScale(e.source.x)).attr('y1', e => yScale(e.source.y))
      .attr('x2', e => xScale(e.target.x)).attr('y2', e => yScale(e.target.y))
      .attr('stroke', e => getColor(e.source, colorBy, colMapRef.current))
      .attr('stroke-width', 0.7)
      .attr('stroke-opacity', 0)
      .transition().duration(900).delay(150)
        .attr('stroke-opacity', e => Math.max(0.07, 0.22 - e.dist * 0.18))

    // ── Circles ────────────────────────────────────────────────────────────────
    const circles = gData.selectAll('circle.node')
      .data(points)
      .join('circle')
      .attr('class', 'node')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 0)
      .attr('fill', d => getColor(d, colorBy, colMapRef.current))
      .attr('fill-opacity', 0.92)
      .attr('stroke', d => getColor(d, colorBy, colMapRef.current))
      .attr('stroke-width', 0.6)
      .attr('stroke-opacity', 0.5)
      .attr('filter', 'url(#glow)')
      .style('cursor', selectMode ? 'default' : 'pointer')

    // Staggered entrance
    circles
      .transition().duration(500)
      .delay((_, i) => Math.min(i * 4, 500))
      .ease(d3.easeBackOut.overshoot(1.5))
      .attr('r', 5)

    // ── Tooltip ────────────────────────────────────────────────────────────────
    const tip = document.createElement('div')
    Object.assign(tip.style, {
      position: 'fixed', pointerEvents: 'none',
      background: 'rgba(4,10,20,0.97)',
      border: '1px solid rgba(34,211,238,0.3)',
      borderRadius: '6px', padding: '9px 13px',
      fontSize: '12px', color: '#e2e8f0', maxWidth: '240px',
      opacity: '0', zIndex: '9999', transition: 'opacity 0.1s',
      lineHeight: '1.5', boxShadow: '0 0 24px rgba(34,211,238,0.12), 0 8px 32px rgba(0,0,0,0.7)',
    })
    document.body.appendChild(tip)

    circles
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget)
          .transition().duration(120)
          .attr('r', 7.5).attr('stroke-width', 1.5).attr('stroke-opacity', 1)

        // Ripple in gOverlay (screen space relative to gMain)
        const t   = transformRef.current
        const rx  = t.applyX(xScale(d.x))
        const ry  = t.applyY(yScale(d.y))
        const col = getColor(d, colorBy, colMapRef.current)
        const ripple = gOverlay.append('circle')
          .attr('cx', rx).attr('cy', ry).attr('r', 7)
          .attr('fill', 'none').attr('stroke', col)
          .attr('stroke-width', 1.5).attr('opacity', 0.9)
        ripple.transition().duration(650).ease(d3.easeCubicOut)
          .attr('r', 26).attr('opacity', 0).remove()
        // Second, slower ripple
        const ripple2 = gOverlay.append('circle')
          .attr('cx', rx).attr('cy', ry).attr('r', 5)
          .attr('fill', 'none').attr('stroke', col)
          .attr('stroke-width', 0.8).attr('opacity', 0.5)
        ripple2.transition().duration(1100).ease(d3.easeCubicOut)
          .attr('r', 38).attr('opacity', 0).remove()

        const cm       = colMapRef.current
        const colNames = (d.collections || []).map(id => cm[id]?.name).filter(Boolean).join(', ') || 'Uncollected'
        tip.innerHTML =
          `<div style="font-weight:600;margin-bottom:3px;color:#f8fafc">${d.title}</div>` +
          `<div style="color:#22d3ee;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">${TYPE_LABELS[d.itemType] || d.itemType}</div>` +
          `<div style="color:#94a3b8;font-size:11px">${colNames}</div>`
        tip.style.opacity = '1'
        tip.style.left    = `${event.clientX + 15}px`
        tip.style.top     = `${event.clientY - 12}px`
      })
      .on('mousemove', (event) => {
        tip.style.left = `${event.clientX + 15}px`
        tip.style.top  = `${event.clientY - 12}px`
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget)
          .transition().duration(120)
          .attr('r', 5).attr('stroke-width', 0.6).attr('stroke-opacity', 0.5)
        tip.style.opacity = '0'
      })
      .on('click', (event, d) => {
        if (selectMode) return
        event.stopPropagation(); tip.style.opacity = '0'
        if      (d.itemType === 'paper')       navigate(`/library/paper/${d.id}`)
        else if (d.itemType === 'website')     navigate(`/library/website/${d.id}`)
        else if (d.itemType === 'github_repo') navigate(`/library/github-repo/${d.id}`)
      })

    // ── Mode interaction ───────────────────────────────────────────────────────
    if (!selectMode) {
      const zoom = d3.zoom()
        .scaleExtent([0.15, 16])
        .on('zoom', (event) => {
          transformRef.current = event.transform
          gData.attr('transform', event.transform)
          zoomLabel.text(`${event.transform.k.toFixed(1)}×`)
        })
      svg.call(zoom)
      svg.call(zoom.transform, transformRef.current)
    } else {
      function brushedPoints(sel) {
        if (!sel) return []
        const [[bx0, by0], [bx1, by1]] = sel
        const t = transformRef.current
        const [sx0, sy0] = t.invert([bx0, by0])
        const [sx1, sy1] = t.invert([bx1, by1])
        return points.filter(d =>
          xScale(d.x) >= Math.min(sx0, sx1) && xScale(d.x) <= Math.max(sx0, sx1) &&
          yScale(d.y) >= Math.min(sy0, sy1) && yScale(d.y) <= Math.max(sy0, sy1)
        )
      }

      const brush = d3.brush()
        .extent([[0, 0], [W, H]])
        .on('brush', (event) => {
          const ids = new Set(brushedPoints(event.selection).map(d => d.id))
          circles
            .attr('stroke',       d => ids.has(d.id) ? '#ffffff' : getColor(d, colorBy, colMapRef.current))
            .attr('stroke-width', d => ids.has(d.id) ? 2 : 0.6)
            .attr('stroke-opacity', d => ids.has(d.id) ? 1 : 0.5)
            .attr('fill-opacity', d => ids.has(d.id) ? 1 : 0.25)
        })
        .on('end', (event) => {
          if (!event.selection) {
            setSelectedPoints([])
            circles
              .attr('stroke', d => getColor(d, colorBy, colMapRef.current))
              .attr('stroke-width', 0.6).attr('stroke-opacity', 0.5).attr('fill-opacity', 0.92)
            return
          }
          const sel = brushedPoints(event.selection)
          setSelectedPoints(sel)
          if (sel.length > 0) setShowCreateModal(true)
        })

      gBrush.call(brush)
      gBrush.select('.selection')
        .attr('fill', 'rgba(34,211,238,0.07)')
        .attr('stroke', '#22d3ee').attr('stroke-width', 1)
      gBrush.selectAll('.handle').attr('fill', '#22d3ee').attr('fill-opacity', 0.4)
    }

    return () => {
      alive = false
      if (scanTimer) clearTimeout(scanTimer)
      scanLine.interrupt()
      tip.remove()
      svg.on('.zoom', null)
      gBrush.on('.brush', null)
    }
  }, [points, colorBy, selectMode, loading])

  // ── Create collection ──────────────────────────────────────────────────────
  async function handleCreateCollection() {
    if (!newColName.trim() || saving) return
    setSaving(true)
    try {
      const col = await createCollection({ name: newColName.trim(), parentId: null })
      await Promise.all(selectedPoints.map(pt => {
        const next = [...(pt.collections || []), col.id]
        if (pt.itemType === 'paper')       return papersApi.update(pt.id, { collections: next })
        if (pt.itemType === 'website')     return websitesApi.update(pt.id, { collections: next })
        if (pt.itemType === 'github_repo') return githubReposApi.update(pt.id, { collections: next })
        return Promise.resolve()
      }))
      setShowCreateModal(false); setNewColName(''); setSelectedPoints([]); setSelectMode(false)
      if (activeLibraryId) searchApi.map(activeLibraryId).then(setPoints).catch(() => {})
    } catch (err) {
      alert(`Failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Legend items ───────────────────────────────────────────────────────────
  const legendItems = colorBy === 'type'
    ? Object.entries(ITEM_COLORS).map(([t, c]) => ({ label: TYPE_LABELS[t] || t, color: c }))
    : [
        ...collections.slice(0, 14).map((col, i) => ({
          label: col.name, color: COLLECTION_PALETTE[i % COLLECTION_PALETTE.length],
        })),
        { label: 'Uncollected', color: UNCOLLECTED_COLOR },
      ]

  // ── Render ─────────────────────────────────────────────────────────────────
  const CYAN = '#22d3ee'
  return (
    <div className="flex flex-col h-full" style={{ background: '#060e1c' }}>

      {/* CSS keyframes (always in DOM) */}
      <style>{`
        @keyframes map-spin { to { transform: rotate(360deg) } }
        @keyframes map-spin-rev { to { transform: rotate(-360deg) } }
      `}</style>

      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2 flex-shrink-0 flex-wrap"
        style={{
          background: 'rgba(4,10,20,0.92)',
          borderBottom: `1px solid rgba(34,211,238,0.18)`,
          backdropFilter: 'blur(10px)',
          boxShadow: `0 1px 0 rgba(34,211,238,0.05)`,
        }}
      >
        {/* Title */}
        <div className="flex items-center gap-2">
          <Icon name="scatter_plot" className="text-[18px]" style={{ color: CYAN }} />
          <span style={{ color: CYAN, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Library Map
          </span>
        </div>

        <div style={{ width: 1, height: 14, background: 'rgba(34,211,238,0.18)' }} />

        {/* Color-by */}
        <div className="flex items-center gap-px p-0.5 rounded" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.12)' }}>
          {[['collection', 'Collections'], ['type', 'Item type']].map(([v, lbl]) => (
            <button
              key={v}
              onClick={() => setColorBy(v)}
              className="px-2.5 py-1 rounded text-xs transition-all"
              style={colorBy === v
                ? { background: 'rgba(34,211,238,0.18)', color: CYAN, fontWeight: 600 }
                : { color: '#64748b' }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Mode */}
        <div className="flex items-center gap-px p-0.5 rounded" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.12)' }}>
          <button
            onClick={() => { setSelectMode(false); setSelectedPoints([]) }}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-all"
            style={!selectMode
              ? { background: 'rgba(34,211,238,0.18)', color: CYAN, fontWeight: 600 }
              : { color: '#64748b' }}
          >
            <Icon name="pan_tool" className="text-[13px]" />
            Explore
          </button>
          <button
            onClick={() => setSelectMode(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-all"
            style={selectMode
              ? { background: 'rgba(96,165,250,0.2)', color: '#93c5fd', fontWeight: 600 }
              : { color: '#64748b' }}
          >
            <Icon name="highlight_alt" className="text-[13px]" />
            Select
          </button>
        </div>

        {selectedPoints.length > 0 && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-all"
            style={{ background: 'rgba(96,165,250,0.15)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.25)' }}
          >
            <Icon name="create_new_folder" className="text-[13px]" />
            New collection · {selectedPoints.length}
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {!loading && points.length > 0 && (
            <span style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.1em', fontWeight: 700, textTransform: 'uppercase' }}>
              {points.length} nodes
            </span>
          )}
          <button
            onClick={() => setLegendOpen(o => !o)}
            title={legendOpen ? 'Hide legend' : 'Show legend'}
            className="p-1.5 rounded transition-colors"
            style={{ color: legendOpen ? CYAN : '#475569' }}
          >
            <Icon name="legend_toggle" className="text-[18px]" />
          </button>
        </div>
      </div>

      {/* ── Canvas + legend ── */}
      <div className="flex flex-1 min-h-0">

        <div ref={wrapperRef} className="flex-1 relative overflow-hidden" style={{ background: '#060e1c' }}>

          {/* Loading */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#060e1c' }}>
              <div className="text-center">
                <div className="relative w-14 h-14 mx-auto mb-5">
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '2px solid transparent', borderTopColor: CYAN,
                    animation: 'map-spin 1s linear infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: '5px', borderRadius: '50%',
                    border: '2px solid transparent', borderTopColor: '#60a5fa',
                    animation: 'map-spin-rev 1.6s linear infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: '10px', borderRadius: '50%',
                    background: `radial-gradient(circle, rgba(34,211,238,0.15), transparent)`,
                  }} />
                </div>
                <p style={{ color: CYAN, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Computing semantic map
                </p>
                <p style={{ color: '#475569', fontSize: '11px', marginTop: '4px' }}>
                  Running UMAP projection…
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#060e1c' }}>
              <div className="text-center max-w-sm px-6">
                <Icon name="error_outline" className="text-[44px] mb-3" style={{ color: '#f87171' }} />
                <p className="text-sm font-semibold mb-2" style={{ color: '#f1f5f9' }}>Map failed to load</p>
                <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>{error}</p>
                {error.toLowerCase().includes('umap') && (
                  <p className="mt-3 text-xs font-mono px-3 py-2 rounded"
                    style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)' }}>
                    uv add umap-learn
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && points.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#060e1c' }}>
              <div className="text-center max-w-sm px-6">
                <Icon name="scatter_plot" className="text-[52px] mb-4" style={{ color: '#1e3a5f' }} />
                <p className="text-sm font-semibold mb-2" style={{ color: '#64748b' }}>No embeddings yet</p>
                <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
                  Add papers and use semantic search to index items.
                </p>
              </div>
            </div>
          )}

          {!loading && !error && points.length > 0 && (
            <svg ref={svgRef} className="w-full h-full block" />
          )}

          {selectMode && !loading && points.length > 0 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="text-xs px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(34,211,238,0.05)', border: `1px solid rgba(34,211,238,0.2)`, color: CYAN, letterSpacing: '0.05em' }}>
                Drag to select a region
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        {legendOpen && !loading && points.length > 0 && (
          <div className="w-44 flex-shrink-0 overflow-y-auto" style={{ background: 'rgba(4,10,20,0.9)', borderLeft: `1px solid rgba(34,211,238,0.1)` }}>
            <div className="p-3 pt-4">
              <p className="mb-3" style={{ color: CYAN, fontSize: '9px', letterSpacing: '0.14em', fontWeight: 700, textTransform: 'uppercase' }}>
                {colorBy === 'type' ? 'Item type' : 'Collections'}
              </p>
              <div className="space-y-2">
                {legendItems.map(item => (
                  <div key={item.label} className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                    <span                     className="truncate" style={{ color: '#94a3b8', fontSize: '11px' }} title={item.label}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create collection modal */}
      {showCreateModal && createPortal(
        <WindowModal
          open
          onClose={() => { setShowCreateModal(false); setNewColName('') }}
          title={`New collection from ${selectedPoints.length} item${selectedPoints.length !== 1 ? 's' : ''}`}
          iconName="create_new_folder"
          iconWrapClassName="bg-blue-100"
          iconClassName="text-[16px] text-blue-600"
          normalPanelClassName="w-full max-w-[22rem] rounded-xl"
          fullscreenPanelClassName="w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] rounded-xl"
        >
          <div className="px-5 pb-5 pt-3 space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              {selectedPoints.length} item{selectedPoints.length !== 1 ? 's' : ''} from the selected region will be added to a new collection.
            </p>
            <input
              autoFocus type="text" value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateCollection() }}
              placeholder="Collection name"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowCreateModal(false); setNewColName('') }}
                className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleCreateCollection} disabled={!newColName.trim() || saving}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Creating…' : 'Create collection'}
              </button>
            </div>
          </div>
        </WindowModal>,
        document.body
      )}
    </div>
  )
}
