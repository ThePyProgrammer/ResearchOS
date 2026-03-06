import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { proposalsApi } from '../../services/api'
import { user } from '../../data/mockData'
import { useLibrary } from '../../context/LibraryContext'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function SidebarLink({ to, icon, label, badge, active, collapsed }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center rounded-lg text-sm font-medium transition-colors ${
          collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-2'
        } ${
          (active !== undefined ? active : isActive)
            ? 'bg-white/10 text-white'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        }`
      }
    >
      <Icon name={icon} className="text-[18px] flex-shrink-0" />
      {!collapsed && <span className="flex-1">{label}</span>}
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
  const { libraries, activeLibrary, setActiveLibraryId, createLibrary } = useLibrary()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const ref = useRef(null)

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
    setActiveLibraryId(lib.id)
    setNewName('')
    setCreating(false)
    setOpen(false)
  }

  if (collapsed) {
    return (
      <div className="px-1 py-2 border-b border-white/10">
        <button
          title={activeLibrary?.name ?? 'No library'}
          onClick={() => setOpen(o => !o)}
          className="w-full flex justify-center py-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
        >
          <Icon name="library_books" className="text-[18px]" />
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 border-b border-white/10 relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors group"
      >
        <Icon name="library_books" className="text-[16px] text-slate-400 flex-shrink-0" />
        <span className="flex-1 text-[13px] font-medium text-slate-200 truncate">
          {activeLibrary?.name ?? 'No library'}
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[16px] text-slate-500 group-hover:text-slate-300" />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {libraries.map(lib => (
              <button
                key={lib.id}
                onClick={() => { setActiveLibraryId(lib.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  lib.id === activeLibrary?.id
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <Icon name="library_books" className="text-[15px] flex-shrink-0" />
                <span className="flex-1 truncate">{lib.name}</span>
                {lib.id === activeLibrary?.id && (
                  <Icon name="check" className="text-[15px] text-blue-400" />
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
                <Icon name="add" className="text-[16px]" />
                New library
              </button>
            )}
          </div>
        </div>
      )}
    </div>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-80 p-5" onClick={e => e.stopPropagation()}>
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
            <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50">
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

function LibraryTree() {
  const { collections, createCollection, deleteCollection } = useLibrary()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeCollection = searchParams.get('col') || 'all'
  const [expanded, setExpanded] = useState({ c1: true })
  const [ctxMenu, setCtxMenu] = useState(null)
  const [modal, setModal] = useState(null)

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

  function select(id) {
    const params = {}
    if (id !== 'all') params.col = id
    setSearchParams(params)
  }

  async function handleCreate(name) {
    await createCollection({ name, parentId: modal.parentId })
    setModal(null)
  }

  async function handleDelete(col) {
    setCtxMenu(m => ({ ...m, deleting: true }))
    const deletedIds = await deleteCollection(col)
    if (deletedIds.includes(activeCollection)) setSearchParams({})
    setCtxMenu(null)
  }

  function CollectionNode({ col, depth = 0 }) {
    const children = collections.filter(c => c.parentId === col.id)
    const isOpen = expanded[col.id]
    const isActive = activeCollection === col.id
    const isCtxTarget = ctxMenu?.col.id === col.id

    return (
      <div>
        <button
          onClick={() => {
            select(col.id)
            if (children.length) setExpanded(e => ({ ...e, [col.id]: !isOpen }))
          }}
          onContextMenu={e => {
            e.preventDefault()
            e.stopPropagation()
            setCtxMenu({ col, x: e.clientX, y: e.clientY, confirming: false, deleting: false })
          }}
          title={col.name}
          className={`w-full flex items-center gap-1.5 py-1.5 rounded-lg text-sm transition-colors ${
            isCtxTarget
              ? 'bg-red-900/30 text-red-400'
              : isActive
              ? 'bg-white/10 text-white font-medium'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
        >
          {children.length > 0 ? (
            <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="text-[13px] flex-shrink-0 opacity-50" />
          ) : (
            <span className="w-[13px] flex-shrink-0" />
          )}
          <Icon
            name={col.type === 'agent-output' ? 'smart_toy' : 'folder'}
            className={`text-[15px] flex-shrink-0 ${col.type === 'agent-output' ? 'text-purple-400' : 'text-slate-500'}`}
          />
          <span className="flex-1 truncate text-left text-[13px]">{col.name}</span>
          <span className="text-[11px] text-slate-600 flex-shrink-0">{col.paperCount}</span>
        </button>
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
                onClick={() => { setCtxMenu(null); setModal({ parentId: ctxMenu.col.id, parentName: ctxMenu.col.name }) }}
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

      {/* Quick access */}
      <p className="px-3 pt-1 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
        Quick Access
      </p>
      {[
        { id: 'all',    icon: 'collections_bookmark', label: 'All Papers' },
        { id: 'inbox',  icon: 'inbox',                label: 'Inbox' },
        { id: 'unfiled',icon: 'folder_off',           label: 'Unfiled' },
      ].map(item => (
        <button
          key={item.id}
          onClick={() => select(item.id)}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            activeCollection === item.id
              ? 'bg-white/10 text-white font-medium'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <Icon name={item.icon} className="text-[16px] flex-shrink-0" />
          <span className="flex-1 text-left text-[13px]">{item.label}</span>
        </button>
      ))}

      {/* Collections header */}
      <div className="flex items-center px-3 pt-3 pb-1">
        <p className="flex-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Collections</p>
        <button
          onClick={() => setModal({ parentId: null, parentName: null })}
          className="p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
          title="New collection"
        >
          <Icon name="add" className="text-[16px]" />
        </button>
      </div>
      {rootCollections.map(col => (
        <CollectionNode key={col.id} col={col} />
      ))}

      {/* Run agent shortcut */}
      <div className="pt-3">
        <button className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-purple-400 hover:bg-white/5 hover:text-purple-300 transition-colors font-medium">
          <Icon name="smart_toy" className="text-[16px]" />
          <span className="text-[13px]">Run Agent Workflow</span>
        </button>
      </div>

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


export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isLibrary = location.pathname.startsWith('/library')
  const isMyLibrary = location.pathname === '/library'
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
        {/* Main nav */}
        <div className="space-y-0.5">
          <SidebarLink to="/dashboard" icon="dashboard" label="Dashboard" collapsed={collapsed} />
          <SidebarLink to="/library" icon="collections_bookmark" label="My Library" active={isMyLibrary} collapsed={collapsed} />
        </div>

        {/* Collection tree — shown expanded when on library pages */}
        {!collapsed && isLibrary && (
          <div className="space-y-0.5">
            <LibraryTree />
          </div>
        )}

        {/* Agent Workflows */}
        <div className={isLibrary && !collapsed ? 'pt-3' : ''}>
          {!collapsed && (
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Agent Workflows
            </p>
          )}
          <div className="space-y-0.5">
            <SidebarLink to="/agents" icon="smart_toy" label="Workflow Catalog" collapsed={collapsed} />
            <SidebarLink to="/proposals" icon="rate_review" label="Agent Proposals" badge={pendingCount} collapsed={collapsed} />
            <div className={`flex items-center rounded-lg text-sm text-slate-400 ${collapsed ? 'justify-center py-2' : 'gap-2.5 px-3 py-2'}`}>
              <Icon name="sensors" className="text-[18px] text-emerald-400 flex-shrink-0" />
              {!collapsed && <span className="flex-1">Daily arXiv Scanner</span>}
              {!collapsed && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tags — hidden when collapsed or on library (tree takes up space) */}
        {!collapsed && !isLibrary && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5 px-3">
              {['#survey', '#important', '#methods', '#dataset', '#rlhf', '#transformers'].map(tag => (
                <button
                  key={tag}
                  className="text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/5 px-2 py-0.5 rounded-full transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
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
