import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { papersApi, collectionsApi } from '../services/api'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const statusConfig = {
  'read': { label: 'Read', class: 'bg-emerald-100 text-emerald-700' },
  'to-read': { label: 'To Read', class: 'bg-amber-100 text-amber-700' },
  'inbox': { label: 'Inbox', class: 'bg-blue-100 text-blue-700' },
}

function CollectionSidebar({ collections, active, onSelect, totalCount }) {
  const rootCollections = collections.filter(c => c.parentId === null)
  const [expanded, setExpanded] = useState({ c1: true })

  function CollectionNode({ col, depth = 0 }) {
    const children = collections.filter(c => c.parentId === col.id)
    const isOpen = expanded[col.id]

    return (
      <div>
        <button
          onClick={() => {
            onSelect(col.id)
            if (children.length) setExpanded(e => ({ ...e, [col.id]: !isOpen }))
          }}
          className={`w-full flex items-center gap-2 py-1.5 rounded-lg text-sm transition-colors ${
            active === col.id
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
        >
          {children.length > 0 ? (
            <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="text-[14px] text-slate-400" />
          ) : (
            <span className="w-[14px]" />
          )}
          <Icon
            name={col.type === 'agent-output' ? 'smart_toy' : 'folder'}
            className={`text-[16px] ${col.type === 'agent-output' ? 'text-purple-400' : 'text-slate-400'}`}
          />
          <span className="flex-1 truncate text-left">{col.name}</span>
          <span className="text-[11px] text-slate-400">{col.paperCount}</span>
        </button>
        {isOpen && children.map(child => (
          <CollectionNode key={child.id} col={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <aside className="w-52 flex-shrink-0 border-r border-slate-200 bg-white p-3 space-y-1 overflow-y-auto">
      <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
        Quick Access
      </p>
      {[
        { id: 'inbox', icon: 'inbox', label: 'Inbox', count: 12 },
        { id: 'all', icon: 'collections_bookmark', label: 'All Papers', count: totalCount },
      ].map(item => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
            active === item.id
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Icon name={item.icon} className="text-[16px]" />
          <span className="flex-1 text-left">{item.label}</span>
          <span className="text-[11px] text-slate-400">{item.count}</span>
        </button>
      ))}

      <p className="px-2 pt-3 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
        Collections
      </p>
      {rootCollections.map(col => (
        <CollectionNode key={col.id} col={col} />
      ))}

      <div className="pt-4 space-y-2">
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 transition-colors">
          <Icon name="upload_file" className="text-[16px]" />
          Import
        </button>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium">
          <Icon name="smart_toy" className="text-[16px]" />
          Run Agent Workflow
        </button>
      </div>
    </aside>
  )
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

function PaperDetail({ paper, onClose, onStatusChange }) {
  const [tab, setTab] = useState('info')
  const navigate = useNavigate()

  const statusOptions = ['inbox', 'to-read', 'read']

  const handleStatusChange = async (newStatus) => {
    try {
      await papersApi.update(paper.id, { status: newStatus })
      onStatusChange(paper.id, newStatus)
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex gap-1.5">
          <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Article</span>
          {paper.source === 'agent' && (
            <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Agent-sourced</span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 leading-snug mb-3">{paper.title}</h3>
          <button
            onClick={() => navigate(`/library/paper/${paper.id}`)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Icon name="picture_as_pdf" className="text-[16px]" />
            View PDF
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {['info', 'notes', 'graph'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="p-4 space-y-4">
            <div className="space-y-2 text-sm">
              {[
                { label: 'Year', value: paper.year },
                { label: 'Venue', value: paper.venue },
                { label: 'Authors', value: paper.authors.join(', ') },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-2">
                  <span className="text-slate-400 w-14 flex-shrink-0">{label}</span>
                  <span className="text-slate-700 flex-1">{value}</span>
                </div>
              ))}
              {paper.doi && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-14 flex-shrink-0">DOI</span>
                  <a href="#" className="text-blue-600 hover:underline text-sm break-all">{paper.doi}</a>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Status</p>
              <div className="flex gap-1.5">
                {statusOptions.map(s => {
                  const cfg = statusConfig[s]
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-opacity ${cfg.class} ${
                        paper.status === s ? 'opacity-100 ring-2 ring-offset-1 ring-current' : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {paper.source === 'agent' && paper.agentRun && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-purple-700 text-xs font-semibold">
                  <Icon name="smart_toy" className="text-[14px]" />
                  Provenance
                </div>
                <p className="text-xs text-purple-700">
                  Added by <strong>{paper.agentRun.name}</strong> during Run #{paper.agentRun.runNumber}
                </p>
                {paper.agentReasoning && (
                  <p className="text-xs text-purple-600 leading-relaxed">{paper.agentReasoning}</p>
                )}
                <button className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1">
                  View workflow run
                  <Icon name="arrow_forward" className="text-[12px]" />
                </button>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Abstract</p>
              <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">{paper.abstract}</p>
              <button className="mt-1 text-xs text-blue-600 hover:underline">Read more</button>
            </div>

            {paper.tags.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {paper.tags.map(tag => (
                    <span
                      key={tag}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        paper.source === 'agent' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div className="p-4">
            <p className="text-sm text-slate-400 text-center py-8">No notes yet.</p>
            <button className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
              + Add note
            </button>
          </div>
        )}

        {tab === 'graph' && (
          <div className="p-4">
            <div className="h-40 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200">
              <p className="text-sm text-slate-400">Citation graph coming soon</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export default function Library() {
  const [activeCollection, setActiveCollection] = useState('all')
  const [filterTab, setFilterTab] = useState('all')
  const [selectedPaper, setSelectedPaper] = useState(null)
  const [papers, setPapers] = useState([])
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchPapers = (collectionId = activeCollection) => {
    const params = {}
    if (collectionId !== 'all') params.collection_id = collectionId
    if (filterTab !== 'all') params.status = filterTab
    return papersApi.list(params).then(setPapers)
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      papersApi.list(
        activeCollection !== 'all' ? { collection_id: activeCollection } : {}
      ),
      collectionsApi.list(),
    ])
      .then(([papersData, collectionsData]) => {
        setPapers(papersData)
        setCollections(collectionsData)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeCollection])

  useEffect(() => {
    if (loading) return
    const params = {}
    if (activeCollection !== 'all') params.collection_id = activeCollection
    if (filterTab !== 'all') params.status = filterTab
    papersApi.list(params).then(setPapers).catch(err => setError(err.message))
  }, [filterTab])

  const handleStatusChange = (paperId, newStatus) => {
    setPapers(prev => prev.map(p => p.id === paperId ? { ...p, status: newStatus } : p))
    if (selectedPaper?.id === paperId) {
      setSelectedPaper(prev => ({ ...prev, status: newStatus }))
    }
  }

  const filtered = papers.filter(p => {
    if (filterTab === 'all') return true
    return p.status === filterTab
  })

  return (
    <div className="flex h-full">
      <CollectionSidebar
        collections={collections}
        active={activeCollection}
        onSelect={id => { setActiveCollection(id); setFilterTab('all') }}
        totalCount={papers.length}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-sm">
            {[
              { id: 'all', label: 'All' },
              { id: 'inbox', label: 'Inbox' },
              { id: 'to-read', label: 'To Read' },
              { id: 'read', label: 'Read' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setFilterTab(t.id)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filterTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors ml-auto">
            <Icon name="filter_list" className="text-[16px]" />
            Filter
          </button>
          <div className="flex gap-0.5">
            {['view_list', 'grid_view'].map((icon, i) => (
              <button
                key={icon}
                className={`p-1.5 rounded-lg transition-colors ${i === 0 ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
              >
                <Icon name={icon} className="text-[18px]" />
              </button>
            ))}
          </div>
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
          <span>Showing {filtered.length} of {papers.length} papers</span>
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
        />
      )}
    </div>
  )
}
