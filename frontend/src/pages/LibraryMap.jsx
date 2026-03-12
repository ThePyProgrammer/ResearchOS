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

// ── Colour palette ─────────────────────────────────────────────────────────
const COLLECTION_PALETTE = [
  '#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#10b981', '#f97316', '#06b6d4', '#ec4899', '#84cc16',
  '#a855f7', '#0ea5e9', '#f43f5e', '#22c55e', '#eab308',
]
const UNCOLLECTED_COLOR = '#475569'
const ITEM_COLORS = {
  paper:       '#3b82f6',
  website:     '#14b8a6',
  github_repo: '#8b5cf6',
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildColMap(collections) {
  const map = {}
  collections.forEach((col, i) => {
    map[col.id] = { name: col.name, color: COLLECTION_PALETTE[i % COLLECTION_PALETTE.length] }
  })
  return map
}

function getPointColor(pt, colorBy, colMap) {
  if (colorBy === 'type') return ITEM_COLORS[pt.itemType] || UNCOLLECTED_COLOR
  if (!pt.collections?.length) return UNCOLLECTED_COLOR
  return colMap[pt.collections[0]]?.color || UNCOLLECTED_COLOR
}

// ── Main component ──────────────────────────────────────────────────────────
export default function LibraryMap() {
  const { activeLibraryId, collections, createCollection } = useLibrary()
  const navigate = useNavigate()

  const svgRef      = useRef(null)
  const wrapperRef  = useRef(null)
  const transformRef = useRef(d3.zoomIdentity) // persists across mode switches
  const colMapRef   = useRef({})               // always-fresh colMap for D3 closures

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

  // Keep colMapRef current so D3 closures see fresh names/colours.
  const colMap = buildColMap(collections)
  colMapRef.current = colMap

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeLibraryId) return
    setLoading(true)
    setError(null)
    setPoints([])
    searchApi.map(activeLibraryId)
      .then(data  => { setPoints(data); setLoading(false) })
      .catch(err  => { setError(err.message); setLoading(false) })
  }, [activeLibraryId])

  // ── D3 chart ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const svgEl     = svgRef.current
    const wrapperEl = wrapperRef.current
    if (!svgEl || !wrapperEl || loading || !points.length) return

    const svg    = d3.select(svgEl)
    svg.selectAll('*').remove()

    const width  = wrapperEl.clientWidth  || 900
    const height = wrapperEl.clientHeight || 600
    const MARGIN = 40

    svg.attr('width', width).attr('height', height)

    // ── Background ──
    const defs = svg.append('defs')
    const pat  = defs.append('pattern')
      .attr('id', 'dot-grid-lib-map')
      .attr('width', 24).attr('height', 24)
      .attr('patternUnits', 'userSpaceOnUse')
    pat.append('circle')
      .attr('cx', 1).attr('cy', 1).attr('r', 0.8)
      .attr('fill', '#1e293b')

    svg.append('rect')
      .attr('width', width).attr('height', height)
      .attr('fill', '#0f172a')
    svg.append('rect')
      .attr('width', width).attr('height', height)
      .attr('fill', 'url(#dot-grid-lib-map)')

    const W = width  - MARGIN * 2
    const H = height - MARGIN * 2

    const xScale = d3.scaleLinear().domain([-1.1, 1.1]).range([0, W])
    const yScale = d3.scaleLinear().domain([-1.1, 1.1]).range([H, 0])

    // ── Layer structure ──
    // gMain  (margin translate — static)
    //   gData  (zoom transform — circles live here)
    //   gBrush (no additional transform — brush overlay)
    const gMain  = svg.append('g').attr('transform', `translate(${MARGIN},${MARGIN})`)
    const gData  = gMain.append('g').attr('class', 'data-layer')
    const gBrush = gMain.append('g').attr('class', 'brush-layer')

    // Apply last-known zoom transform immediately so the view is stable on
    // mode/colour changes.
    gData.attr('transform', transformRef.current)

    // ── Circles ──
    const circles = gData.selectAll('circle')
      .data(points)
      .join('circle')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 5)
      .attr('fill', d => getPointColor(d, colorBy, colMapRef.current))
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 0.8)
      .style('cursor', selectMode ? 'default' : 'pointer')

    // ── Tooltip (DOM node appended to body; removed on cleanup) ──
    const tooltipEl = document.createElement('div')
    Object.assign(tooltipEl.style, {
      position: 'fixed', pointerEvents: 'none',
      background: 'rgba(15,23,42,0.97)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px', padding: '8px 12px',
      fontSize: '12px', color: '#e2e8f0',
      maxWidth: '240px', opacity: '0', zIndex: '9999',
      transition: 'opacity 0.1s', lineHeight: '1.45',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    })
    document.body.appendChild(tooltipEl)

    const TYPE_LABEL = { paper: 'Paper', website: 'Website', github_repo: 'GitHub Repo' }

    circles
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget).attr('r', 7).attr('fill-opacity', 1)
        const cm = colMapRef.current
        const colNames = (d.collections || [])
          .map(cid => cm[cid]?.name)
          .filter(Boolean)
          .join(', ') || 'Uncollected'
        tooltipEl.innerHTML =
          `<div style="font-weight:600;margin-bottom:3px">${d.title}</div>` +
          `<div style="color:#94a3b8;font-size:11px">${TYPE_LABEL[d.itemType] || d.itemType}</div>` +
          `<div style="color:#64748b;font-size:11px;margin-top:2px">${colNames}</div>`
        tooltipEl.style.opacity = '1'
        tooltipEl.style.left = `${event.clientX + 14}px`
        tooltipEl.style.top  = `${event.clientY - 10}px`
      })
      .on('mousemove', (event) => {
        tooltipEl.style.left = `${event.clientX + 14}px`
        tooltipEl.style.top  = `${event.clientY - 10}px`
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget).attr('r', 5).attr('fill-opacity', 0.85)
        tooltipEl.style.opacity = '0'
      })
      .on('click', (event, d) => {
        if (selectMode) return
        event.stopPropagation()
        tooltipEl.style.opacity = '0'
        if      (d.itemType === 'paper')       navigate(`/library/paper/${d.id}`)
        else if (d.itemType === 'website')     navigate(`/library/website/${d.id}`)
        else if (d.itemType === 'github_repo') navigate(`/library/github-repo/${d.id}`)
      })

    // ── Mode-specific interaction ──
    if (!selectMode) {
      // ── Zoom / pan ──
      const zoom = d3.zoom()
        .scaleExtent([0.2, 14])
        .on('zoom', (event) => {
          transformRef.current = event.transform
          gData.attr('transform', event.transform)
        })
      svg.call(zoom)
      // Restore last transform (no animated jump).
      svg.call(zoom.transform, transformRef.current)
    } else {
      // ── Brush select ──
      // Brush fires in gMain coordinate space; circles are in gData which has
      // transformRef.current applied.  We invert that transform to convert
      // brush pixel coords back to scale coords.
      function brushedPoints(selection) {
        if (!selection) return []
        const [[bx0, by0], [bx1, by1]] = selection
        const t = transformRef.current
        const [sx0, sy0] = t.invert([bx0, by0])
        const [sx1, sy1] = t.invert([bx1, by1])
        return points.filter(d =>
          xScale(d.x) >= Math.min(sx0, sx1) &&
          xScale(d.x) <= Math.max(sx0, sx1) &&
          yScale(d.y) >= Math.min(sy0, sy1) &&
          yScale(d.y) <= Math.max(sy0, sy1)
        )
      }

      const brush = d3.brush()
        .extent([[0, 0], [W, H]])
        .on('brush', (event) => {
          const sel = brushedPoints(event.selection)
          const selIds = new Set(sel.map(d => d.id))
          circles
            .attr('stroke',       d => selIds.has(d.id) ? '#ffffff' : '#0f172a')
            .attr('stroke-width', d => selIds.has(d.id) ? 1.5 : 0.8)
            .attr('fill-opacity', d => selIds.has(d.id) ? 1 : 0.35)
        })
        .on('end', (event) => {
          if (!event.selection) {
            setSelectedPoints([])
            circles
              .attr('stroke', '#0f172a')
              .attr('stroke-width', 0.8)
              .attr('fill-opacity', 0.85)
            return
          }
          const sel = brushedPoints(event.selection)
          setSelectedPoints(sel)
          if (sel.length > 0) setShowCreateModal(true)
        })

      gBrush.call(brush)
      // Style the brush selection rectangle.
      gBrush.select('.selection')
        .attr('fill',         'rgba(59,130,246,0.12)')
        .attr('stroke',       '#3b82f6')
        .attr('stroke-width', 1)
    }

    return () => {
      tooltipEl.remove()
      // Detach zoom/brush listeners to avoid leaks on re-render.
      svg.on('.zoom', null)
      gBrush.on('.brush', null)
    }
  }, [points, colorBy, selectMode, loading]) // collections intentionally omitted —
  //   colMapRef.current always has the latest value; we don't need a full redraw.

  // ── Create collection from brush selection ─────────────────────────────
  async function handleCreateCollection() {
    if (!newColName.trim() || saving) return
    setSaving(true)
    try {
      const col = await createCollection({ name: newColName.trim(), parentId: null })
      await Promise.all(
        selectedPoints.map(pt => {
          const newCols = [...(pt.collections || []), col.id]
          if (pt.itemType === 'paper')       return papersApi.update(pt.id, { collections: newCols })
          if (pt.itemType === 'website')     return websitesApi.update(pt.id, { collections: newCols })
          if (pt.itemType === 'github_repo') return githubReposApi.update(pt.id, { collections: newCols })
          return Promise.resolve()
        })
      )
      setShowCreateModal(false)
      setNewColName('')
      setSelectedPoints([])
      setSelectMode(false)
      // Re-fetch the map so points carry the updated collections list.
      if (activeLibraryId) {
        searchApi.map(activeLibraryId)
          .then(data => setPoints(data))
          .catch(() => {})
      }
    } catch (err) {
      alert(`Failed to create collection: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Legend items ──────────────────────────────────────────────────────────
  const legendItems = colorBy === 'type'
    ? Object.entries(ITEM_COLORS).map(([type, color]) => ({
        label: TYPE_LABELS[type] || type,
        color,
      }))
    : [
        ...collections.slice(0, 14).map((col, i) => ({
          label: col.name,
          color: COLLECTION_PALETTE[i % COLLECTION_PALETTE.length],
        })),
        { label: 'Uncollected', color: UNCOLLECTED_COLOR },
      ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-950">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-white/10 flex-shrink-0 flex-wrap">
        <Icon name="scatter_plot" className="text-blue-400 text-[20px] flex-shrink-0" />
        <h1 className="text-sm font-semibold text-slate-200 mr-1">Library Map</h1>
        <div className="h-4 w-px bg-white/10" />

        {/* Color-by toggle */}
        <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-xs gap-px">
          {[['collection', 'Collections'], ['type', 'Item type']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setColorBy(v)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                colorBy === v ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Mode toggle */}
        <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-xs gap-px">
          <button
            onClick={() => { setSelectMode(false); setSelectedPoints([]) }}
            title="Pan and zoom"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
              !selectMode ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon name="pan_tool" className="text-[13px]" />
            Explore
          </button>
          <button
            onClick={() => setSelectMode(true)}
            title="Brush-select a region"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
              selectMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon name="highlight_alt" className="text-[13px]" />
            Select
          </button>
        </div>

        {/* Create collection CTA */}
        {selectedPoints.length > 0 && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Icon name="create_new_folder" className="text-[14px]" />
            New collection from {selectedPoints.length} item{selectedPoints.length !== 1 ? 's' : ''}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!loading && points.length > 0 && (
            <span className="text-xs text-slate-500">{points.length} items mapped</span>
          )}
          <button
            onClick={() => setLegendOpen(o => !o)}
            title={legendOpen ? 'Hide legend' : 'Show legend'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
          >
            <Icon name="legend_toggle" className="text-[18px]" />
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0">

        {/* SVG canvas */}
        <div ref={wrapperRef} className="flex-1 relative overflow-hidden">

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-400">Computing semantic map…</p>
                <p className="text-xs text-slate-600 mt-1">First load may take a few seconds</p>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center max-w-sm px-6">
                <Icon name="error_outline" className="text-[44px] text-red-400 mb-3" />
                <p className="text-sm font-semibold text-slate-300 mb-2">Failed to load map</p>
                <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
                {error.toLowerCase().includes('umap') && (
                  <p className="mt-3 text-xs font-mono text-amber-400 bg-amber-400/10 px-3 py-2 rounded-lg">
                    uv add umap-learn
                  </p>
                )}
              </div>
            </div>
          )}

          {!loading && !error && points.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center max-w-sm px-6">
                <Icon name="scatter_plot" className="text-[52px] text-slate-700 mb-4" />
                <p className="text-sm font-semibold text-slate-300 mb-2">No embeddings yet</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Add papers and run a semantic search to generate embeddings.
                  The map will populate once items are indexed.
                </p>
              </div>
            </div>
          )}

          {!loading && !error && points.length > 0 && (
            <svg ref={svgRef} className="w-full h-full block" />
          )}

          {/* Select-mode hint */}
          {selectMode && !loading && points.length > 0 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="bg-slate-800/90 border border-white/10 text-slate-300 text-xs px-4 py-1.5 rounded-full">
                Click and drag to select a region
              </div>
            </div>
          )}
        </div>

        {/* Legend panel */}
        {legendOpen && !loading && points.length > 0 && (
          <div className="w-48 bg-slate-900 border-l border-white/10 flex-shrink-0 overflow-y-auto">
            <div className="p-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5">
                {colorBy === 'type' ? 'Item type' : 'Collections'}
              </p>
              <div className="space-y-2">
                {legendItems.map(item => (
                  <div key={item.label} className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: item.color }}
                    />
                    <span className="text-[12px] text-slate-400 truncate" title={item.label}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Create collection modal ── */}
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
              {selectedPoints.length} item{selectedPoints.length !== 1 ? 's' : ''} from the
              selected region will be added to a new collection.
            </p>
            <input
              autoFocus
              type="text"
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateCollection() }}
              placeholder="Collection name"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setNewColName('') }}
                className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCollection}
                disabled={!newColName.trim() || saving}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
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

// ── Module-level constants referenced inside the component ──────────────────
const TYPE_LABELS = { paper: 'Paper', website: 'Website', github_repo: 'GitHub Repo' }
