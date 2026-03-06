import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { papersApi, searchApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'
import PaperInfoPanel, { statusConfig } from '../components/PaperInfoPanel'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}


function PaperRow({ paper, selected, onSelect }) {
  const status = statusConfig[paper.status] || statusConfig['inbox']

  return (
    <tr
      onClick={() => onSelect(paper)}
      className={`cursor-pointer transition-colors ${
        selected ? 'bg-blue-50' : 'hover:bg-slate-50'
      }`}
    >
      <td className="pl-4 pr-2 py-3 w-8">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-blue-600"
          checked={selected}
          onChange={() => onSelect(paper)}
          onClick={e => e.stopPropagation()}
        />
      </td>
      <td className="px-2 py-3">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.class}`}>
          {status.label}
        </span>
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 line-clamp-1">{paper.title}</span>
          {paper.source === 'agent' && (
            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              Run #{paper.agentRun?.runNumber}
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-3 text-sm text-slate-500 max-w-[160px]">
        <span className="truncate block">{paper.authors.slice(0, 2).join(', ')}{paper.authors.length > 2 ? ', et al.' : ''}</span>
      </td>
      <td className="px-2 py-3 text-sm text-slate-500">{paper.year}</td>
      <td className="px-2 py-3 text-sm text-slate-500">{paper.venue}</td>
      <td className="px-3 py-3 text-sm text-slate-400">
        {paper.source === 'agent' ? (
          <Icon name="smart_toy" className="text-[16px] text-purple-400" />
        ) : (
          <Icon name="person" className="text-[16px] text-slate-300" />
        )}
      </td>
    </tr>
  )
}


function PaperDetail({ paper, onClose, onStatusChange, onPaperUpdate, onDelete }) {
  const [tab, setTab] = useState('info')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await papersApi.remove(paper.id)
      onDelete(paper.id)
    } catch (err) {
      console.error('Failed to delete paper:', err)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const statusCfg = statusConfig[paper.status] || statusConfig['inbox']

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusCfg.class}`}>
            {statusCfg.label}
          </span>
          {paper.source === 'agent' && (
            <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <Icon name="smart_toy" className="text-[11px]" />
              Agent
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete paper"
          >
            <Icon name="delete" className="text-[16px]" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-xs font-semibold mb-1">Delete this paper?</p>
          <p className="text-red-600 text-xs mb-3">This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Title + quick actions */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{paper.title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ` +${paper.authors.length - 3} more` : ''}
            {paper.year ? <span className="text-slate-400"> · {paper.year}</span> : null}
          </p>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/library/paper/${paper.id}`)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Icon name="picture_as_pdf" className="text-[14px]" />
              View PDF
            </button>
            {paper.arxivId && (
              <a
                href={`https://arxiv.org/abs/${paper.arxivId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                title={`arXiv:${paper.arxivId}`}
              >
                arXiv
              </a>
            )}
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                title={`DOI: ${paper.doi}`}
              >
                DOI
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {['info', 'notes', 'graph'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors capitalize tracking-wide ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <PaperInfoPanel
            paper={paper}
            onStatusChange={onStatusChange}
            onPaperUpdate={onPaperUpdate}
          />
        )}

        {tab === 'notes' && (
          <div className="p-4">
            <p className="text-xs text-slate-400 text-center py-8">No notes yet.</p>
            <button className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              + Add note
            </button>
          </div>
        )}

        {tab === 'graph' && (
          <div className="p-4">
            <div className="h-40 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200">
              <p className="text-xs text-slate-400">Citation graph coming soon</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export default function Library() {
  const { activeLibraryId, refreshCollections } = useLibrary() // derived from ?lib= URL param
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPaper, setSelectedPaper] = useState(null)
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [titleFilter, setTitleFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')
  const [tagFilters, setTagFilters] = useState(new Set())
  const location = useLocation()

  // Derive active filters from URL — URL is the single source of truth
  const activeCollection = searchParams.get('col') || 'all'
  const filterTab = searchParams.get('status') || 'all'
  const urlQuery = searchParams.get('q') || ''
  const urlMode = searchParams.get('mode') || 'lexical'
  const libParam = searchParams.get('lib')

  // Helper: build next params preserving fields we want to keep
  function navParams({ col, status, q, mode } = {}) {
    const p = {}
    if (libParam) p.lib = libParam
    const nextCol = col !== undefined ? col : activeCollection
    const nextStatus = status !== undefined ? status : filterTab
    if (nextCol && nextCol !== 'all') p.col = nextCol
    if (nextStatus && nextStatus !== 'all') p.status = nextStatus
    if (q) { p.q = q; p.mode = mode || 'lexical' }
    return p
  }


  // Re-fetch papers whenever collection, status filter, URL search query, or active library changes
  useEffect(() => {
    setLoading(true)
    setError(null)

    const listParams = activeLibraryId ? { library_id: activeLibraryId } : {}
    const baseFetch = papersApi.list(listParams)

    const fetchPromise = urlQuery
      ? searchApi.query(urlQuery, { mode: urlMode, limit: 50 }).catch(() => {
          // Search endpoint unavailable — clear the query and fall back to full list
          setSearchParams({})
          return baseFetch
        })
      : baseFetch

    fetchPromise
      .then(data => setPapers(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [urlQuery, urlMode, location.key, activeLibraryId])

  const handleStatusChange = (paperId, newStatus) => {
    setPapers(prev => prev.map(p => p.id === paperId ? { ...p, status: newStatus } : p))
    if (selectedPaper?.id === paperId) {
      setSelectedPaper(prev => ({ ...prev, status: newStatus }))
    }
  }

  const handlePaperUpdate = (updated) => {
    setPapers(prev => prev.map(p => p.id === updated.id ? updated : p))
    if (selectedPaper?.id === updated.id) setSelectedPaper(updated)
  }

  const handleDelete = (paperId) => {
    setPapers(prev => prev.filter(p => p.id !== paperId))
    setSelectedPaper(null)
    refreshCollections()
  }


  const allTags = useMemo(() => [...new Set(papers.flatMap(p => p.tags))].sort(), [papers])
  const activeFilterCount = (sourceFilter !== 'all' ? 1 : 0)
    + (yearFrom || yearTo ? 1 : 0)
    + (titleFilter ? 1 : 0)
    + (venueFilter ? 1 : 0)
    + tagFilters.size

  const filtered = useMemo(() => {
    let result = urlQuery ? papers : papers.filter(p => filterTab === 'all' || p.status === filterTab)
    if (activeCollection === 'inbox') result = result.filter(p => p.status === 'inbox')
    else if (activeCollection === 'unfiled') result = result.filter(p => p.collections.length === 0)
    else if (activeCollection !== 'all') result = result.filter(p => p.collections.includes(activeCollection))
    if (sourceFilter !== 'all') result = result.filter(p => p.source === sourceFilter)
    if (titleFilter) result = result.filter(p => p.title.toLowerCase().includes(titleFilter.toLowerCase()))
    if (venueFilter) result = result.filter(p => p.venue.toLowerCase().includes(venueFilter.toLowerCase()))
    if (yearFrom) result = result.filter(p => p.year >= Number(yearFrom))
    if (yearTo) result = result.filter(p => p.year <= Number(yearTo))
    if (tagFilters.size > 0) result = result.filter(p => [...tagFilters].every(t => p.tags.includes(t)))
    return result
  }, [papers, urlQuery, filterTab, activeCollection, sourceFilter, titleFilter, venueFilter, yearFrom, yearTo, tagFilters])

  function clearFilters() {
    setSourceFilter('all')
    setYearFrom('')
    setYearTo('')
    setTitleFilter('')
    setVenueFilter('')
    setTagFilters(new Set())
  }

  function toggleTag(tag) {
    setTagFilters(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          {urlQuery && (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium border ${
                urlMode === 'semantic'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}>
                <Icon name={urlMode === 'semantic' ? 'auto_awesome' : 'search'} className="text-[14px]" />
                <span>"{urlQuery}"</span>
                {urlMode === 'semantic' && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold ml-1">
                    Semantic
                  </span>
                )}
                <button
                  onClick={() => setSearchParams(navParams({ q: undefined }))}
                  className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Clear search"
                >
                  <Icon name="close" className="text-[14px]" />
                </button>
              </div>
              <span className="text-xs text-slate-400">{papers.length} result{papers.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Filter panel */}
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">

              {/* Status */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Status</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all', label: 'All', count: papers.length },
                    { id: 'inbox', label: 'Inbox', count: papers.filter(p => p.status === 'inbox').length },
                    { id: 'to-read', label: 'To Read', count: papers.filter(p => p.status === 'to-read').length },
                    { id: 'read', label: 'Read', count: papers.filter(p => p.status === 'read').length },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSearchParams(navParams({ status: opt.id }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        filterTab === opt.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                      <span className={`text-[10px] font-bold px-1 rounded ${
                        filterTab === opt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>{opt.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Source */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Source</span>
                <div className="flex gap-1.5">
                  {[
                    { id: 'all', label: 'All', count: papers.length },
                    { id: 'human', label: 'Human', count: papers.filter(p => p.source === 'human').length },
                    { id: 'agent', label: 'Agent', count: papers.filter(p => p.source === 'agent').length },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSourceFilter(opt.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        sourceFilter === opt.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                      <span className={`text-[10px] font-bold px-1 rounded ${
                        sourceFilter === opt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>{opt.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Title</span>
                <div className="relative flex-1">
                  <Icon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={titleFilter}
                    onChange={e => setTitleFilter(e.target.value)}
                    placeholder="Filter by title…"
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  {titleFilter && (
                    <button onClick={() => setTitleFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <Icon name="close" className="text-[13px]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Venue */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Venue</span>
                <div className="relative flex-1">
                  <Icon name="location_on" className="absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={venueFilter}
                    onChange={e => setVenueFilter(e.target.value)}
                    placeholder="e.g. NeurIPS, arXiv…"
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  {venueFilter && (
                    <button onClick={() => setVenueFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <Icon name="close" className="text-[13px]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Year range */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Year</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={yearFrom}
                    onChange={e => setYearFrom(e.target.value)}
                    placeholder="From"
                    min="1900" max="2100"
                    className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <span className="text-slate-300 text-sm">—</span>
                  <input
                    type="number"
                    value={yearTo}
                    onChange={e => setYearTo(e.target.value)}
                    placeholder="To"
                    min="1900" max="2100"
                    className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
              </div>

              {/* Tags */}
              {allTags.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0 pt-1">Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          tagFilters.has(tag)
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="mt-3 text-xs text-slate-400 hover:text-red-500 transition-colors">
                Clear all filters
              </button>
            )}
          </div>

        {error && (
          <div className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b border-red-100">
            Failed to load papers: {error}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="animate-pulse p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 bg-slate-100 rounded" />
              ))}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="pl-4 pr-2 py-2.5 w-8">
                    <input type="checkbox" className="rounded border-slate-300" />
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Authors</th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Year</th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Venue</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(paper => (
                  <PaperRow
                    key={paper.id}
                    paper={paper}
                    selected={selectedPaper?.id === paper.id}
                    onSelect={p => setSelectedPaper(selectedPaper?.id === p.id ? null : p)}
                  />
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Icon name="search_off" className="text-[48px] mb-3" />
              <p className="text-sm">No papers match the current filter.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-white text-sm text-slate-500">
          <span>
            {urlQuery
              ? `${papers.length} search result${papers.length !== 1 ? 's' : ''} for "${urlQuery}"`
              : `Showing ${filtered.length} of ${papers.length} paper${papers.length !== 1 ? 's' : ''}`}
          </span>
          <div className="flex items-center gap-1">
            <button className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40" disabled>
              <Icon name="chevron_left" className="text-[18px]" />
            </button>
            <span className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium">1</span>
            <button className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40" disabled>
              <Icon name="chevron_right" className="text-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {selectedPaper && (
        <PaperDetail
          paper={selectedPaper}
          onClose={() => setSelectedPaper(null)}
          onStatusChange={handleStatusChange}
          onPaperUpdate={handlePaperUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
