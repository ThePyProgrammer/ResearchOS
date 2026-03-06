import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { papersApi, collectionsApi, searchApi } from '../services/api'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function CollectionModal({ parentName, onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    await onConfirm(name.trim())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-80 p-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-800">
          {parentName ? `New subcollection in "${parentName}"` : 'New collection'}
        </h2>
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Collection name"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const statusConfig = {
  'read': { label: 'Read', class: 'bg-emerald-100 text-emerald-700' },
  'to-read': { label: 'To Read', class: 'bg-amber-100 text-amber-700' },
  'inbox': { label: 'Inbox', class: 'bg-blue-100 text-blue-700' },
}

function CollectionSidebar({ collections, active, onSelect, onDeleteCollection, onCreateCollection, totalCount }) {
  const rootCollections = collections.filter(c => c.parentId === null)
  const [expanded, setExpanded] = useState({ c1: true })
  const [ctxMenu, setCtxMenu] = useState(null) // { col, x, y, confirming, deleting }
  const [modal, setModal] = useState(null) // { parentId: string|null, parentName: string|null }

  async function handleCreate(name) {
    await onCreateCollection({ name, parentId: modal.parentId })
    setModal(null)
  }

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', e => { if (e.key === 'Escape') close() })
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', e => { if (e.key === 'Escape') close() })
    }
  }, [!!ctxMenu])

  async function handleDelete(col) {
    setCtxMenu(m => ({ ...m, deleting: true }))
    await onDeleteCollection(col)
    setCtxMenu(null)
  }

  function CollectionNode({ col, depth = 0 }) {
    const children = collections.filter(c => c.parentId === col.id)
    const isOpen = expanded[col.id]
    const isCtxTarget = ctxMenu?.col.id === col.id

    return (
      <div>
        <button
          onClick={() => {
            onSelect(col.id)
            if (children.length) setExpanded(e => ({ ...e, [col.id]: !isOpen }))
          }}
          onContextMenu={e => {
            e.preventDefault()
            e.stopPropagation()
            setCtxMenu({ col, x: e.clientX, y: e.clientY, confirming: false, deleting: false })
          }}
          className={`w-full flex items-center gap-2 py-1.5 rounded-lg text-sm transition-colors ${
            isCtxTarget
              ? 'bg-red-50 text-red-700'
              : active === col.id
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
    <>
    {ctxMenu && (
      <div
        style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 50 }}
        className="bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-52"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
          <p className="text-xs text-slate-400 truncate">{ctxMenu.col.name}</p>
        </div>
        {ctxMenu.confirming ? (
          <div className="px-3 py-2">
            <p className="text-xs text-slate-600 mb-0.5 font-medium">Delete this collection?</p>
            {collections.some(c => c.parentId === ctxMenu.col.id) && (
              <p className="text-[11px] text-amber-600 mb-2">Subcollections will also be deleted.</p>
            )}
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={() => handleDelete(ctxMenu.col)}
                disabled={ctxMenu.deleting}
                className="flex-1 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {ctxMenu.deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setCtxMenu(null)}
                className="flex-1 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                setCtxMenu(null)
                setModal({ parentId: ctxMenu.col.id, parentName: ctxMenu.col.name })
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Icon name="create_new_folder" className="text-[16px] text-slate-400" />
              New subcollection
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              onClick={() => setCtxMenu(m => ({ ...m, confirming: true }))}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Icon name="delete" className="text-[16px]" />
              Delete
            </button>
          </>
        )}
      </div>
    )}
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

      <div className="flex items-center px-2 pt-3 pb-1.5">
        <p className="flex-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Collections</p>
        <button
          onClick={() => setModal({ parentId: null, parentName: null })}
          className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="New collection"
        >
          <Icon name="add" className="text-[16px]" />
        </button>
      </div>
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
    {modal && (
      <CollectionModal
        parentName={modal.parentName}
        onConfirm={handleCreate}
        onCancel={() => setModal(null)}
      />
    )}
    </>
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

function LinkField({ label, icon, value, placeholder, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  function startEdit() { setDraft(value || ''); setEditing(true) }
  function cancel() { setEditing(false) }
  async function save() {
    await onSave(draft.trim() || null)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <div className="flex gap-1.5">
          <input
            autoFocus
            type="url"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            placeholder={placeholder}
            className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          <button onClick={save} className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Save</button>
          <button onClick={cancel} className="px-2 py-1 text-slate-500 text-xs rounded-lg hover:bg-slate-100">✕</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} className="text-[15px] text-slate-400 flex-shrink-0" />
      {value ? (
        <>
          <a href={value} target="_blank" rel="noreferrer" className="flex-1 text-xs text-blue-600 hover:underline truncate">{value}</a>
          <button onClick={startEdit} className="text-slate-300 hover:text-slate-500 flex-shrink-0">
            <Icon name="edit" className="text-[13px]" />
          </button>
          <button onClick={() => onSave(null)} className="text-slate-300 hover:text-red-400 flex-shrink-0">
            <Icon name="close" className="text-[13px]" />
          </button>
        </>
      ) : (
        <button onClick={startEdit} className="text-xs text-slate-400 hover:text-blue-600">
          Add {label.toLowerCase()}…
        </button>
      )}
    </div>
  )
}

function PaperDetail({ paper, onClose, onStatusChange, onPaperUpdate, onDelete }) {
  const [tab, setTab] = useState('info')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
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

  const handleLinkSave = async (field, value) => {
    try {
      const updated = await papersApi.update(paper.id, { [field]: value })
      onPaperUpdate(updated)
    } catch (err) {
      console.error('Failed to update link:', err)
    }
  }

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

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex gap-1.5">
          <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Article</span>
          {paper.source === 'agent' && (
            <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Agent-sourced</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete paper"
          >
            <Icon name="delete" className="text-[16px]" />
          </button>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
          <p className="text-red-700 font-medium mb-1">Delete this paper?</p>
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

            <div className="space-y-2 pt-1">
              <LinkField
                label="GitHub"
                icon="code"
                value={paper.githubUrl}
                placeholder="https://github.com/…"
                onSave={v => handleLinkSave('githubUrl', v)}
              />
              <LinkField
                label="Website"
                icon="language"
                value={paper.websiteUrl}
                placeholder="https://…"
                onSave={v => handleLinkSave('websiteUrl', v)}
              />
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
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  const urlQuery = searchParams.get('q') || ''
  const urlMode = searchParams.get('mode') || 'lexical'

  // Fetch collections once
  useEffect(() => {
    collectionsApi.list().then(setCollections).catch(() => {})
  }, [])

  // Re-fetch papers whenever collection, status filter, or URL search query changes
  useEffect(() => {
    setLoading(true)
    setError(null)

    const baseFetch = papersApi.list({
      ...(activeCollection !== 'all' && { collection_id: activeCollection }),
      ...(filterTab !== 'all' && { status: filterTab }),
    })

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
  }, [activeCollection, filterTab, urlQuery, urlMode, location.key])

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
  }

  const handleCreateCollection = async ({ name, parentId }) => {
    const created = await collectionsApi.create({ name, parent_id: parentId || null, type: 'folder' })
    setCollections(prev => [...prev, created])
  }

  const handleDeleteCollection = async (col) => {
    // Collect the target + all descendants
    const allCollections = collections
    const toDelete = []
    const gather = (parentId) => {
      allCollections.filter(c => c.id === parentId || c.parentId === parentId).forEach(c => {
        if (!toDelete.includes(c.id)) {
          toDelete.push(c.id)
          gather(c.id)
        }
      })
    }
    gather(col.id)

    await Promise.all(toDelete.map(id => collectionsApi.remove(id).catch(() => {})))
    setCollections(prev => prev.filter(c => !toDelete.includes(c.id)))
    if (toDelete.includes(activeCollection)) {
      setActiveCollection('all')
      setFilterTab('all')
    }
  }

  // In search mode, results are already filtered by the backend; otherwise apply status tab
  const filtered = urlQuery
    ? papers
    : papers.filter(p => filterTab === 'all' || p.status === filterTab)

  return (
    <div className="flex h-full">
      <CollectionSidebar
        collections={collections}
        active={activeCollection}
        onSelect={id => {
          setActiveCollection(id)
          setFilterTab('all')
          // Keep col in URL so Header's QuickAdd knows which collection is active.
          // Clear q/mode when switching collections.
          const params = {}
          if (id !== 'all' && id !== 'inbox') params.col = id
          setSearchParams(params)
        }}
        onDeleteCollection={handleDeleteCollection}
        onCreateCollection={handleCreateCollection}
        totalCount={papers.length}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          {urlQuery ? (
            /* Search mode — show chip instead of status tabs */
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
                  onClick={() => setSearchParams({})}
                  className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Clear search"
                >
                  <Icon name="close" className="text-[14px]" />
                </button>
              </div>
              <span className="text-xs text-slate-400">{papers.length} result{papers.length !== 1 ? 's' : ''}</span>
            </div>
          ) : (
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
          )}
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
          <span>
            {urlQuery
              ? `${papers.length} search result${papers.length !== 1 ? 's' : ''} for "${urlQuery}"`
              : `Showing ${filtered.length} of ${papers.length} papers`}
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
