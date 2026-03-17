import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { proposalsApi, papersApi, websitesApi, projectsApi } from '../../services/api'
import { useLibrary } from '../../context/LibraryContext'
import WindowModal from '../WindowModal'
import BibtexExportModal from '../BibtexExportModal'
import CreateProjectModal from '../CreateProjectModal'

const user = { name: 'Dr. Researcher', org: 'Lab Alpha', initials: 'DR' }

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function SidebarLink({ to, icon, label, badge, active, collapsed }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center rounded-lg transition-colors ${
          collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-3 py-1.5'
        } ${
          (active !== undefined ? active : isActive)
            ? 'bg-white/10 text-white font-medium'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        }`
      }
    >
      <Icon name={icon} className="text-[18px] flex-shrink-0" />
      {!collapsed && <span className="flex-1 text-[13px]">{label}</span>}
      {!collapsed && badge && (
        <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {badge}
        </span>
      )}
      {collapsed && badge && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
      )}
    </NavLink>
  )
}


function LibrarySwitcher({ collapsed }) {
  const { libraries, activeLibrary, createLibrary, switchLibrary } = useLibrary()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const ref = useRef(null)

  function handleSwitch(id) {
    setOpen(false)
    switchLibrary(id)
    navigate('/library')
  }

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const lib = await createLibrary(newName.trim())
    setNewName('')
    setCreating(false)
    handleSwitch(lib.id)
  }

  if (collapsed) {
    return (
      <div className="px-1 py-2 border-b border-white/10">
        <button
          title={activeLibrary?.name ?? 'No library'}
          onClick={() => setOpen(o => !o)}
          className="w-full flex justify-center py-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
        >
          <Icon name="library_books" className="text-[18px] text-slate-400" />
        </button>
      </div>
    )
  }

  return (
    <>
    <div className="px-3 py-2 border-b border-white/10 relative" ref={ref}>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors group min-w-0"
        >
          <Icon name="library_books" className="text-[18px] text-slate-400 flex-shrink-0" />
          <span className="flex-1 text-[13px] font-medium text-slate-200 truncate">
            {activeLibrary?.name ?? 'No library'}
          </span>
          <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[18px] text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
        </button>
        {activeLibrary && (
          <button
            onClick={() => { setOpen(false); navigate('/library/settings') }}
            title="Library settings"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <Icon name="settings" className="text-[16px]" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {libraries.map(lib => (
              <button
                key={lib.id}
                onClick={() => handleSwitch(lib.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  lib.id === activeLibrary?.id
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <Icon name="library_books" className="text-[16px] flex-shrink-0" />
                <span className="flex-1 truncate text-[13px]">{lib.name}</span>
                {lib.id === activeLibrary?.id && (
                  <Icon name="check" className="text-[16px] text-blue-400" />
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-white/10">
            {creating ? (
              <form onSubmit={handleCreate} className="flex items-center gap-1.5 px-3 py-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Library name…"
                  className="flex-1 bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-white/10 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName('') }}
                  className="text-xs px-2 py-1 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
              >
                <Icon name="add" className="text-[18px]" />
                <span className="text-[13px]">New library</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  )
}

function CollectionModal({ parentName, onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    await onConfirm(name.trim())
  }

  return createPortal(
    <WindowModal
      open
      onClose={onCancel}
      title={parentName ? `New subcollection in "${parentName}"` : 'New collection'}
      iconName="create_new_folder"
      iconWrapClassName="bg-blue-100"
      iconClassName="text-[16px] text-blue-600"
      normalPanelClassName="w-full max-w-[20rem] rounded-xl"
      fullscreenPanelClassName="w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] rounded-xl"
    >
      <form onSubmit={handleSubmit} className="px-5 pb-5 pt-4 space-y-3">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Collection name"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </WindowModal>,
    document.body
  )
}
function LibraryTree() {
  const { collections, createCollection, updateCollection, deleteCollection, refreshCollections, activeLibraryId } = useLibrary()
  const [viewCounts, setViewCounts] = useState({})
  const [viewIds, setViewIds] = useState({})

  useEffect(() => {
    const lib = activeLibraryId ? { library_id: activeLibraryId } : {}
    papersApi.list(lib).then(papers => {
      const dupeKeys = new Map()
      for (const p of papers) {
        if (p.doi) { const k = `doi:${p.doi.trim().toLowerCase()}`; dupeKeys.set(k, (dupeKeys.get(k) || 0) + 1) }
        if (p.arxivId) { const k = `arxiv:${p.arxivId.trim().toLowerCase()}`; dupeKeys.set(k, (dupeKeys.get(k) || 0) + 1) }
      }
      const dupeIds = new Set()
      for (const p of papers) {
        if ((p.doi && dupeKeys.get(`doi:${p.doi.trim().toLowerCase()}`) > 1) ||
            (p.arxivId && dupeKeys.get(`arxiv:${p.arxivId.trim().toLowerCase()}`) > 1)) {
          dupeIds.add(p.id)
        }
      }
      const inboxPapers   = papers.filter(p => p.status === 'inbox')
      const unfiledPapers = papers.filter(p => p.collections.length === 0)
      setViewCounts({
        all:        papers.length,
        inbox:      inboxPapers.length,
        unfiled:    unfiledPapers.length,
        duplicates: dupeIds.size,
      })
      setViewIds({
        all:        papers.map(p => p.id),
        inbox:      inboxPapers.map(p => p.id),
        unfiled:    unfiledPapers.map(p => p.id),
        duplicates: [...dupeIds],
      })
    }).catch(() => {})
  }, [activeLibraryId])

  const [searchParams] = useSearchParams()
  const location = useLocation()
  const onLibraryPage = location.pathname === '/library'
  const activeCollection = onLibraryPage ? (searchParams.get('col') || 'all') : null
  const [expanded, setExpanded] = useState({ c1: true })
  const [ctxMenu, setCtxMenu] = useState(null)
  const [modal, setModal] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragOverId, setDragOverId] = useState(null)
  const [bibtexExportCollectionId, setBibtexExportCollectionId] = useState(null)
  const [bibtexExportIds, setBibtexExportIds] = useState(null) // non-null array = modal open for quick-access
  const [quickCtxMenu, setQuickCtxMenu] = useState(null) // { id, label, x, y }

  useEffect(() => {
    if (!quickCtxMenu) return
    const close = () => setQuickCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', e => { if (e.key === 'Escape') close() })
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', e => { if (e.key === 'Escape') close() })
    }
  }, [!!quickCtxMenu])

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

  const navigate = useNavigate()
  function select(id) {
    if (id === 'all') navigate('/library')
    else navigate(`/library?col=${id}`)
  }

  async function handleCreate(name) {
    try {
      await createCollection({ name, parentId: modal.parentId })
      setModal(null)
    } catch (err) {
      console.error('Failed to create collection:', err)
      alert(`Failed to create collection: ${err.message}`)
    }
  }

  async function handleDelete(col) {
    setCtxMenu(m => ({ ...m, deleting: true }))
    const deletedIds = await deleteCollection(col)
    if (deletedIds.includes(activeCollection)) navigate('/library')
    setCtxMenu(null)
  }

  function startRename(col) {
    setRenamingId(col.id)
    setRenameValue(col.name)
    setCtxMenu(null)
  }

  async function commitRename(colId) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== collections.find(c => c.id === colId)?.name) {
      try {
        await updateCollection(colId, { name: trimmed })
      } catch (err) {
        console.error('Failed to rename collection:', err)
      }
    }
    setRenamingId(null)
    setRenameValue('')
  }

  function isDescendant(parentId, childId) {
    let cur = childId
    const visited = new Set()
    while (cur) {
      if (visited.has(cur)) return false
      visited.add(cur)
      if (cur === parentId) return true
      const node = collections.find(c => c.id === cur)
      cur = node?.parentId || null
    }
    return false
  }

  const draggedRef = useRef(null)

  function handleDragStart(e, col) {
    draggedRef.current = col.id
    e.dataTransfer.setData('text/plain', col.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    draggedRef.current = null
    setDragOverId(null)
  }

  function handleDragOver(e, colId) {
    e.preventDefault()
    e.stopPropagation()
    // Accept both collection moves and item (paper/website) drops
    const hasItem = e.dataTransfer.types.includes('application/researchos-item')
    e.dataTransfer.dropEffect = hasItem ? 'copy' : 'move'
    if (dragOverId !== colId) setDragOverId(colId)
  }

  function handleDragLeave(e) {
    e.stopPropagation()
    // Only clear if leaving the actual element, not entering a child
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverId(null)
    }
  }

  async function handleDrop(e, targetId) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverId(null)

    // Check if this is an item (paper/website) drop
    const itemData = e.dataTransfer.getData('application/researchos-item')
    if (itemData) {
      try {
        const item = JSON.parse(itemData)
        if (item.collections?.includes(targetId)) return // already in this collection
        const next = [...(item.collections || []), targetId]
        const api = item.itemType === 'website' ? websitesApi : papersApi
        await api.update(item.id, { collections: next })
        refreshCollections()
        window.dispatchEvent(new CustomEvent('researchos:items-changed'))
      } catch (err) {
        console.error('Failed to add item to collection:', err)
      }
      return
    }

    // Otherwise it's a collection move
    const draggedId = draggedRef.current || e.dataTransfer.getData('text/plain')
    draggedRef.current = null
    if (!draggedId || draggedId === targetId) return
    if (isDescendant(draggedId, targetId)) return
    const dragged = collections.find(c => c.id === draggedId)
    if (!dragged || dragged.parentId === targetId) return
    try {
      await updateCollection(draggedId, { parentId: targetId || null })
      setExpanded(prev => ({ ...prev, [targetId]: true }))
    } catch (err) {
      console.error('Failed to move collection:', err)
    }
  }

  async function handleDropRoot(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverId(null)
    const draggedId = draggedRef.current || e.dataTransfer.getData('text/plain')
    draggedRef.current = null
    if (!draggedId) return
    const dragged = collections.find(c => c.id === draggedId)
    if (!dragged || dragged.parentId === null) return
    try {
      await updateCollection(draggedId, { parentId: null })
    } catch (err) {
      console.error('Failed to move collection to root:', err)
    }
  }

  function CollectionNode({ col, depth = 0 }) {
    const children = collections.filter(c => c.parentId === col.id)
    const isOpen = expanded[col.id]
    const isActive = activeCollection === col.id
    const isCtxTarget = ctxMenu?.col.id === col.id
    const isRenaming = renamingId === col.id
    const isDragOver = dragOverId === col.id

    return (
      <div>
        <div
          draggable={!isRenaming}
          onDragStart={e => handleDragStart(e, col)}
          onDragEnd={handleDragEnd}
          onDragOver={e => handleDragOver(e, col.id)}
          onDragLeave={e => handleDragLeave(e)}
          onDrop={e => handleDrop(e, col.id)}
          onClick={() => {
            if (isRenaming) return
            select(col.id)
            if (children.length) setExpanded(e => ({ ...e, [col.id]: !isOpen }))
          }}
          onContextMenu={e => {
            e.preventDefault()
            e.stopPropagation()
            setCtxMenu({ col, x: e.clientX, y: e.clientY, confirming: false, deleting: false })
          }}
          onDoubleClick={e => {
            e.preventDefault()
            e.stopPropagation()
            startRename(col)
          }}
          title={isRenaming ? undefined : col.name}
          className={`w-full flex items-center gap-1.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
            isDragOver
              ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40'
              : isCtxTarget
              ? 'bg-red-900/30 text-red-400'
              : isActive
              ? 'bg-white/10 text-white font-medium'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
        >
          {children.length > 0 ? (
            <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="text-[14px] flex-shrink-0 opacity-50" />
          ) : (
            <span className="w-[14px] flex-shrink-0" />
          )}
          <Icon
            name={col.type === 'agent-output' ? 'smart_toy' : 'folder'}
            className={`text-[16px] flex-shrink-0 ${col.type === 'agent-output' ? 'text-purple-400' : 'text-slate-500'}`}
          />
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => commitRename(col.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(col.id)
                if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
              }}
              onClick={e => e.stopPropagation()}
              className="flex-1 bg-slate-700 text-slate-200 text-[13px] px-1.5 py-0.5 rounded border border-blue-500/50 focus:outline-none focus:border-blue-400 min-w-0"
            />
          ) : (
            <>
              <span className="flex-1 truncate text-left text-[13px]">{col.name}</span>
              <span className="text-[11px] text-slate-600 flex-shrink-0">{col.paperCount}</span>
            </>
          )}
        </div>
        {isOpen && children.map(child => (
          <CollectionNode key={child.id} col={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  const rootCollections = collections.filter(c => c.parentId === null)

  return (
    <>
      {/* Context menu */}
      {ctxMenu && createPortal(
        <div
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
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
                onClick={() => { setCtxMenu(null); setModal({ parentId: ctxMenu.col.id, parentName: ctxMenu.col.name }) }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Icon name="create_new_folder" className="text-[18px] text-slate-400" />
                New subcollection
              </button>
              <button
                onClick={() => startRename(ctxMenu.col)}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Icon name="edit" className="text-[18px] text-slate-400" />
                Rename
              </button>
              {ctxMenu.col.parentId && (
                <button
                  onClick={async () => {
                    setCtxMenu(null)
                    try {
                      await updateCollection(ctxMenu.col.id, { parentId: null })
                    } catch (err) {
                      console.error('Failed to move to root:', err)
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Icon name="drive_file_move" className="text-[18px] text-slate-400" />
                  Move to root
                </button>
              )}
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => { const id = ctxMenu.col.id; setCtxMenu(null); setBibtexExportCollectionId(id) }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Icon name="download" className="text-[18px] text-slate-400" />
                Export BibTeX
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => setCtxMenu(m => ({ ...m, confirming: true }))}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Icon name="delete" className="text-[18px]" />
                Delete
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* Quick access */}
      <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
        Quick Access
      </p>
      {[
        { id: 'all',        icon: 'collections_bookmark', label: 'All Papers' },
        { id: 'inbox',      icon: 'inbox',                label: 'Inbox' },
        { id: 'unfiled',    icon: 'folder_off',           label: 'Unfiled' },
        { id: 'duplicates', icon: 'content_copy',         label: 'Duplicates' },
      ].map(item => (
        <button
          key={item.id}
          onClick={() => select(item.id)}
          onContextMenu={e => { e.preventDefault(); setQuickCtxMenu({ id: item.id, label: item.label, x: e.clientX, y: e.clientY }) }}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors ${
            activeCollection === item.id
              ? 'bg-white/10 text-white font-medium'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <Icon name={item.icon} className="text-[18px] flex-shrink-0" />
          <span className="flex-1 text-left text-[13px]">{item.label}</span>
          {viewCounts[item.id] > 0 && (
            <span className="text-[11px] text-slate-600 flex-shrink-0">
              {viewCounts[item.id]}
            </span>
          )}
        </button>
      ))}

      {/* Quick access context menu */}
      {quickCtxMenu && createPortal(
        <div
          style={{ position: 'fixed', top: quickCtxMenu.y, left: quickCtxMenu.x, zIndex: 9999 }}
          className="bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-48"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
            <p className="text-xs text-slate-400 truncate">{quickCtxMenu.label}</p>
          </div>
          <button
            onClick={() => { const id = quickCtxMenu.id; setQuickCtxMenu(null); setBibtexExportIds(viewIds[id] || []) }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Icon name="download" className="text-[18px] text-slate-400" />
            Export BibTeX
          </button>
        </div>,
        document.body
      )}

      {/* Collections header */}
      <div
        className={`flex items-center px-3 pt-3 pb-1 rounded-lg transition-colors ${
          dragOverId === '__root__' ? 'bg-blue-500/10' : ''
        }`}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverId('__root__') }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={handleDropRoot}
      >
        <p className="flex-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Collections</p>
        <button
          onClick={() => setModal({ parentId: null, parentName: null })}
          className="p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
          title="New collection"
        >
          <Icon name="add" className="text-[18px]" />
        </button>
      </div>
      {rootCollections.map(col => (
        <CollectionNode key={col.id} col={col} />
      ))}

      {modal && (
        <CollectionModal
          parentName={modal.parentName}
          onConfirm={handleCreate}
          onCancel={() => setModal(null)}
        />
      )}
      <BibtexExportModal
        open={!!bibtexExportCollectionId}
        onClose={() => setBibtexExportCollectionId(null)}
        fetchParams={{ collectionId: bibtexExportCollectionId }}
      />
      <BibtexExportModal
        open={bibtexExportIds !== null}
        onClose={() => setBibtexExportIds(null)}
        fetchParams={{ ids: bibtexExportIds || [] }}
      />
    </>
  )
}


const projectStatusDotClass = {
  active:    'bg-emerald-500',
  paused:    'bg-amber-500',
  completed: 'bg-blue-500',
  archived:  'bg-slate-400',
}

function ProjectsTree({ collapsed }) {
  const { activeLibraryId } = useLibrary()
  const location = useLocation()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState({})

  const fetchProjects = useCallback(() => {
    if (!activeLibraryId) return
    projectsApi.list({ library_id: activeLibraryId })
      .then(data => setProjects(data))
      .catch(err => console.error('ProjectsTree: failed to fetch projects:', err))
  }, [activeLibraryId])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    const handler = () => fetchProjects()
    window.addEventListener('researchos:projects-changed', handler)
    return () => window.removeEventListener('researchos:projects-changed', handler)
  }, [fetchProjects])

  // Auto-expand project when navigating directly to a sub-route
  useEffect(() => {
    const match = location.pathname.match(/^\/projects\/(proj_[^/]+)/)
    if (match) {
      const projectId = match[1]
      setExpandedProjects(prev => prev[projectId] ? prev : { ...prev, [projectId]: true })
    }
  }, [location.pathname])

  function ProjectNode({ project }) {
    const isExpanded = !!expandedProjects[project.id]
    const isProjectActive = location.pathname.startsWith(`/projects/${project.id}`)
    const dotClass = projectStatusDotClass[project.status] || projectStatusDotClass.active

    function handleRowClick() {
      setExpandedProjects(prev => ({ ...prev, [project.id]: !isExpanded }))
      navigate(`/projects/${project.id}`)
    }

    const subLinks = [
      { label: 'Overview',    icon: 'dashboard',  to: `/projects/${project.id}`,             end: true },
      { label: 'Literature',  icon: 'menu_book',  to: `/projects/${project.id}/literature`,  end: false },
      { label: 'Experiments', icon: 'science',    to: `/projects/${project.id}/experiments`, end: false },
      { label: 'Notes',       icon: 'edit_note',  to: `/projects/${project.id}/notes`,       end: false },
    ]

    return (
      <div>
        {/* Project row */}
        <button
          onClick={handleRowClick}
          title={project.name}
          className={`w-full flex items-center gap-1.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
            isProjectActive
              ? 'bg-white/10 text-white font-medium'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
          style={{ paddingLeft: '8px', paddingRight: '8px' }}
        >
          <Icon
            name={isExpanded ? 'expand_more' : 'chevron_right'}
            className="text-[14px] flex-shrink-0 opacity-50"
          />
          <span className="w-[16px] flex items-center justify-center flex-shrink-0">
            <span className={`w-2 h-2 rounded-full ${dotClass}`} />
          </span>
          <span className="flex-1 truncate text-[13px]">{project.name}</span>
        </button>

        {/* Sub-links */}
        {isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {subLinks.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 py-1.5 rounded-lg transition-colors text-[13px] cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`
                }
                style={{ paddingLeft: '20px', paddingRight: '8px' }}
              >
                <span className="w-[14px] flex-shrink-0" />
                <Icon name={link.icon} className="text-[16px] flex-shrink-0" />
                <span className="flex-1 truncate">{link.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className="pt-2">
        <NavLink
          to="/projects"
          title="Projects"
          className={({ isActive }) =>
            `flex justify-center py-1.5 rounded-lg transition-colors ${
              isActive || location.pathname.startsWith('/projects')
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`
          }
        >
          <Icon name="topic" className="text-[18px] flex-shrink-0" />
        </NavLink>
      </div>
    )
  }

  return (
    <div className="pt-2">
      {/* Header */}
      <div className="flex items-center px-3 pb-1">
        <p className="flex-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Projects</p>
        <button
          onClick={() => setShowCreateModal(true)}
          title="New project"
          className="p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
        >
          <Icon name="add" className="text-[18px]" />
        </button>
      </div>

      {/* Project links */}
      <div className="space-y-0.5">
        <NavLink
          to="/projects"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              isActive
                ? 'bg-white/10 text-white font-medium'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`
          }
        >
          <Icon name="home" className="text-[16px] flex-shrink-0" />
          <span className="flex-1 text-[13px]">Home</span>
        </NavLink>
        {projects.map(project => (
          <ProjectNode key={project.id} project={project} />
        ))}
        {projects.length === 0 && (
          <p className="px-3 py-1 text-[12px] text-slate-600 italic">No projects yet</p>
        )}
      </div>
      {showCreateModal && (
        <CreateProjectModal
          libraryId={activeLibraryId}
          onClose={() => setShowCreateModal(false)}
          onCreated={project => {
            setShowCreateModal(false)
            fetchProjects()
            navigate(`/projects/${project.id}`)
          }}
        />
      )}
    </div>
  )
}

export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(null)

  useEffect(() => {
    proposalsApi.list().then(data => setPendingCount(data.filter(p => p.status === 'pending').length)).catch(() => {})
  }, [])

  return (
    <aside
      className={`flex-shrink-0 bg-slate-800 flex flex-col h-screen sticky top-0 dark-scroll overflow-y-auto transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Logo + toggle */}
      <div className={`flex items-center border-b border-white/10 ${collapsed ? 'flex-col gap-2 px-0 py-3' : 'px-4 py-4 justify-between'}`}>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          title="ResearchOS"
        >
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon name="hub" className="text-white text-[18px]" />
          </div>
          {!collapsed && (
            <span className="text-white font-semibold text-base tracking-tight">ResearchOS</span>
          )}
        </button>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
        >
          <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} className="text-[18px]" />
        </button>
      </div>

      {/* Library switcher */}
      <LibrarySwitcher collapsed={collapsed} />

      <nav className={`flex-1 space-y-1 ${collapsed ? 'p-2 pt-3' : 'p-3'}`}>
        {/* Dashboard */}
        <div className="space-y-0.5">
          <SidebarLink to="/dashboard" icon="dashboard" label="Dashboard" collapsed={collapsed} />
          <SidebarLink to="/library/notes" icon="edit_note" label="Notes" collapsed={collapsed} />
          <SidebarLink to="/library/map" icon="scatter_plot" label="Library Map" collapsed={collapsed} />
        </div>

        {/* Library tree (Quick Access + Collections) */}
        {!collapsed && (
          <div className="space-y-0.5">
            <LibraryTree />
          </div>
        )}

        {/* Projects */}
        <div className="space-y-0.5">
          <ProjectsTree collapsed={collapsed} />
        </div>

        {/* Authors */}
        <div className="pt-3 space-y-0.5">
          <SidebarLink to="/authors" icon="groups" label="Authors" collapsed={collapsed} />
        </div>

        {/* Agent Workflows */}
        <div className="pt-3">
          {!collapsed && (
            <p className="px-3 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Agent Workflows
            </p>
          )}
          <div className="space-y-0.5">
            <SidebarLink to="/agents" icon="smart_toy" label="Workflow Catalog" collapsed={collapsed} />
            <SidebarLink to="/proposals" icon="rate_review" label="Agent Proposals" badge={pendingCount} collapsed={collapsed} />
            <div className={`flex items-center rounded-lg text-slate-400 ${collapsed ? 'justify-center py-1.5' : 'gap-2.5 px-3 py-1.5'}`}>
              <Icon name="sensors" className="text-[18px] text-emerald-400 flex-shrink-0" />
              {!collapsed && <span className="flex-1 text-[13px]">Daily arXiv Scanner</span>}
              {!collapsed && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* User profile */}
      <div className="p-2 border-t border-white/10">
        {collapsed ? (
          <button
            title={`${user.name} — ${user.org}`}
            className="w-full flex justify-center py-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-bold">
              {user.initials}
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              {user.initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.org}</p>
            </div>
            <Icon name="settings" className="text-slate-500 text-[16px] ml-auto flex-shrink-0" />
          </div>
        )}
      </div>
    </aside>
  )
}

