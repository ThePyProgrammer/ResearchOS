import { useState, useRef, useEffect } from 'react'
import { papersApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'

export const statusConfig = {
  'read':    { label: 'Read',    class: 'bg-emerald-100 text-emerald-700' },
  'to-read': { label: 'To Read', class: 'bg-amber-100 text-amber-700' },
  'inbox':   { label: 'Inbox',   class: 'bg-blue-100 text-blue-700' },
}

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function displayUrl(url, type) {
  if (!url) return url
  if (type === 'github') return url.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export function formatAdded(raw) {
  if (!raw) return null
  const normalized = raw.replace(/(\.\d{3})\d+/, '$1')
  const date = new Date(normalized)
  if (isNaN(date.getTime())) return null
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function NamedLinks({ links = [], onSave }) {
  const [adding, setAdding] = useState(false)
  const [editIdx, setEditIdx] = useState(null)
  const [draft, setDraft] = useState({ name: '', url: '' })

  function startAdd() { setDraft({ name: '', url: '' }); setAdding(true); setEditIdx(null) }
  function startEdit(i) { setDraft({ ...links[i] }); setEditIdx(i); setAdding(false) }
  function cancel() { setAdding(false); setEditIdx(null) }

  async function saveAdd() {
    if (!draft.name.trim() || !draft.url.trim()) return
    await onSave([...links, { name: draft.name.trim(), url: draft.url.trim() }])
    setAdding(false)
  }

  async function saveEdit(i) {
    if (!draft.name.trim() || !draft.url.trim()) return
    const next = links.map((l, idx) => idx === i ? { name: draft.name.trim(), url: draft.url.trim() } : l)
    await onSave(next)
    setEditIdx(null)
  }

  async function remove(i) {
    await onSave(links.filter((_, idx) => idx !== i))
  }

  const rowForm = (onConfirm) => (
    <div className="space-y-1.5 pl-1">
      <input
        autoFocus
        type="text"
        value={draft.name}
        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') cancel() }}
        placeholder="Label (e.g. Project Page)"
        className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
      />
      <input
        type="url"
        value={draft.url}
        onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') cancel() }}
        placeholder="https://…"
        className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono"
      />
      <div className="flex gap-1.5">
        <button onClick={onConfirm} className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Save</button>
        <button onClick={cancel} className="px-2 py-1 text-slate-400 text-xs rounded-lg hover:bg-slate-100">✕</button>
      </div>
    </div>
  )

  return (
    <div className="space-y-1.5">
      {links.map((link, i) => (
        editIdx === i ? (
          <div key={i}>{rowForm(() => saveEdit(i))}</div>
        ) : (
          <div key={i} className="flex items-center gap-2 group">
            <Icon name="link" className="text-[14px] text-slate-400 flex-shrink-0" />
            <a href={link.url} target="_blank" rel="noreferrer"
              className="flex-1 text-xs text-blue-600 hover:underline truncate"
              title={link.url}>
              {link.name}
            </a>
            <button onClick={() => startEdit(i)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 flex-shrink-0 transition-opacity">
              <Icon name="edit" className="text-[13px]" />
            </button>
            <button onClick={() => remove(i)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 flex-shrink-0 transition-opacity">
              <Icon name="close" className="text-[13px]" />
            </button>
          </div>
        )
      ))}
      {adding ? rowForm(saveAdd) : (
        <button onClick={startAdd} className="text-xs text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1">
          <Icon name="add" className="text-[13px]" />
          Add link…
        </button>
      )}
    </div>
  )
}

export function AuthorChips({ authors = [], onSave }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [dragIdx, setDragIdx] = useState(null)

  async function addAuthor() {
    const name = draft.trim()
    if (!name) return
    await onSave([...authors, name])
    setDraft('')
    setAdding(false)
  }

  async function removeAuthor(idx) {
    await onSave(authors.filter((_, i) => i !== idx))
  }

  function onDragStart(e, idx) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  function onDragOver(e, idx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    e.dataTransfer.dropEffect = 'move'
  }

  async function onDrop(e, targetIdx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return }
    const next = [...authors]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(targetIdx, 0, moved)
    setDragIdx(null)
    await onSave(next)
  }

  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Authors</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {authors.map((author, i) => (
          <span
            key={`${author}-${i}`}
            draggable
            onDragStart={e => onDragStart(e, i)}
            onDragOver={e => onDragOver(e, i)}
            onDrop={e => onDrop(e, i)}
            onDragEnd={() => setDragIdx(null)}
            className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 group cursor-grab active:cursor-grabbing transition-opacity ${
              dragIdx === i ? 'opacity-40' : ''
            }`}
          >
            <Icon name="person" className="text-[12px] text-slate-400" />
            {author}
            <button
              onClick={() => removeAuthor(i)}
              className="text-slate-400 hover:text-red-500 transition-colors ml-0.5"
              title="Remove author"
            >
              <Icon name="close" className="text-[11px]" />
            </button>
          </span>
        ))}
        {authors.length === 0 && !adding && (
          <span className="text-[11px] text-slate-400 italic">No authors</span>
        )}
      </div>
      {adding ? (
        <div className="flex gap-1.5 items-center">
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addAuthor()
              if (e.key === 'Escape') { setAdding(false); setDraft('') }
            }}
            onBlur={() => { if (draft.trim()) addAuthor(); else setAdding(false) }}
            placeholder="Author name…"
            className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1">
          <Icon name="add" className="text-[13px]" />
          Add author…
        </button>
      )}
    </div>
  )
}

export function EditableField({ label, value, onSave, type = 'text', placeholder = '', mono = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit() { setDraft(value || ''); setEditing(true) }
  function cancel() { setEditing(false) }
  async function save() {
    let val = draft.trim()
    if (type === 'number') val = val ? Number(val) : null
    if (type === 'date') val = val || null
    // eslint-disable-next-line eqeqeq
    if (val != value && (val || value)) {
      await onSave(val || null)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex gap-3 text-xs">
        <span className="text-slate-400 w-12 flex-shrink-0 pt-1">{label}</span>
        <div className="flex-1 flex gap-1.5 items-center min-w-0">
          <input
            autoFocus
            type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            onBlur={save}
            placeholder={placeholder}
            className={`flex-1 min-w-0 px-1.5 py-0.5 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-xs ${mono ? 'font-mono' : ''}`}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 text-xs group">
      <span className="text-slate-400 w-12 flex-shrink-0 pt-px">{label}</span>
      {value ? (
        <span
          className={`text-slate-700 cursor-default ${mono ? 'font-mono truncate' : ''}`}
          onDoubleClick={startEdit}
          title="Double-click to edit"
        >
          {value}
        </span>
      ) : (
        <button onClick={startEdit} className="text-slate-400 hover:text-blue-600 transition-colors italic">
          Add {label.toLowerCase()}…
        </button>
      )}
    </div>
  )
}

export function EditableTextArea({ label, value, onSave, placeholder = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState(false)

  function startEdit() { setDraft(value || ''); setEditing(true) }
  function cancel() { setEditing(false) }
  async function save() {
    const val = draft.trim() || null
    if (val !== (value || null)) await onSave(val)
    setEditing(false)
  }

  if (editing) {
    return (
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
        <textarea
          autoFocus
          rows={5}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') cancel() }}
          onBlur={save}
          placeholder={placeholder}
          className="w-full px-2 py-1.5 text-xs text-slate-600 leading-relaxed border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
        />
      </div>
    )
  }

  if (!value) {
    return (
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
        <button onClick={startEdit} className="text-xs text-slate-400 hover:text-blue-600 transition-colors italic">
          Add {label.toLowerCase()}…
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <p
        className={`text-xs text-slate-600 leading-relaxed cursor-default ${expanded ? '' : 'line-clamp-4'}`}
        onDoubleClick={startEdit}
        title="Double-click to edit"
      >
        {value}
      </p>
      <button
        onClick={() => setExpanded(e => !e)}
        className="mt-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-medium transition-colors"
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </div>
  )
}

function LinkField({ label, icon, value, placeholder, onSave, type }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  function startEdit() { setDraft(value || ''); setEditing(true) }
  function cancel() { setEditing(false) }
  async function save() { await onSave(draft.trim() || null); setEditing(false) }

  if (editing) {
    return (
      <div className="flex gap-1.5 items-center">
        <Icon name={icon} className="text-[15px] text-slate-400 flex-shrink-0" />
        <input
          autoFocus
          type="url"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono"
        />
        <button onClick={save} className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 flex-shrink-0">Save</button>
        <button onClick={cancel} className="px-2 py-1 text-slate-400 text-xs rounded-lg hover:bg-slate-100 flex-shrink-0">✕</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group">
      <Icon name={icon} className="text-[15px] text-slate-400 flex-shrink-0" />
      {value ? (
        <>
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className={`flex-1 text-xs text-blue-600 hover:underline truncate ${type === 'github' ? 'font-mono' : ''}`}
            title={value}
          >
            {displayUrl(value, type)}
          </a>
          <button onClick={startEdit} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 flex-shrink-0 transition-opacity">
            <Icon name="edit" className="text-[13px]" />
          </button>
          <button onClick={() => onSave(null)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 flex-shrink-0 transition-opacity">
            <Icon name="close" className="text-[13px]" />
          </button>
        </>
      ) : (
        <button onClick={startEdit} className="text-xs text-slate-400 hover:text-blue-600 transition-colors">
          Add {label.toLowerCase()}…
        </button>
      )}
    </div>
  )
}

export function CollectionsPicker({ item, onUpdate, updateFn }) {
  const { collections } = useLibrary()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const itemCollections = item.collections || []
  const assignedCols = collections.filter(c => itemCollections.includes(c.id))
  const available = collections.filter(c =>
    !itemCollections.includes(c.id) &&
    c.name.toLowerCase().includes(query.toLowerCase())
  )

  const apiFn = updateFn || ((id, data) => papersApi.update(id, data))

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function addCollection(colId) {
    const next = [...itemCollections, colId]
    try {
      const updated = await apiFn(item.id, { collections: next })
      onUpdate?.(updated)
      window.dispatchEvent(new CustomEvent('researchos:items-changed'))
    } catch (err) {
      console.error('Failed to add collection:', err)
    }
    setQuery('')
    setOpen(false)
  }

  async function removeCollection(colId) {
    const next = itemCollections.filter(id => id !== colId)
    try {
      const updated = await apiFn(item.id, { collections: next })
      onUpdate?.(updated)
      window.dispatchEvent(new CustomEvent('researchos:items-changed'))
    } catch (err) {
      console.error('Failed to remove collection:', err)
    }
  }

  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Collections</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {assignedCols.map(col => (
          <span
            key={col.id}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 group"
          >
            <Icon name="folder" className="text-[12px]" />
            {col.name}
            <button
              onClick={() => removeCollection(col.id)}
              className="text-blue-400 hover:text-red-500 transition-colors ml-0.5"
              title="Remove from collection"
            >
              <Icon name="close" className="text-[11px]" />
            </button>
          </span>
        ))}
        {assignedCols.length === 0 && (
          <span className="text-[11px] text-slate-400 italic">No collections</span>
        )}
      </div>
      <div className="relative" ref={dropdownRef}>
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 border border-slate-200 rounded-lg cursor-text hover:border-slate-300 transition-colors"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        >
          <Icon name="add" className="text-[14px] text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Add to collection…"
            className="flex-1 text-xs bg-transparent focus:outline-none text-slate-700 placeholder-slate-400 min-w-0"
          />
        </div>
        {open && available.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
            {available.map(col => (
              <button
                key={col.id}
                onClick={() => addCollection(col.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left"
              >
                <Icon name={col.type === 'agent-output' ? 'smart_toy' : 'folder'} className="text-[14px] text-slate-400" />
                {col.name}
              </button>
            ))}
          </div>
        )}
        {open && query && available.length === 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
            <p className="text-xs text-slate-400">No matching collections</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PaperInfoPanel({ paper, onStatusChange, onPaperUpdate }) {
  async function handleStatusChange(newStatus) {
    try {
      await papersApi.update(paper.id, { status: newStatus })
      onStatusChange?.(paper.id, newStatus)
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  async function handleFieldSave(field, value) {
    try {
      const updated = await papersApi.update(paper.id, { [field]: value })
      onPaperUpdate?.(updated)
    } catch (err) {
      console.error('Failed to update field:', err)
    }
  }

  const addedLabel = formatAdded(paper.createdAt)

  return (
    <div className="p-4 space-y-5">
      {/* Authors */}
      <AuthorChips authors={paper.authors || []} onSave={v => handleFieldSave('authors', v)} />

      {/* Metadata */}
      <div className="space-y-2">
        <EditableField label="Date" value={paper.publishedDate || (paper.year ? String(paper.year) : '')}
          type={paper.publishedDate ? 'date' : 'date'} placeholder="2024-01-15"
          onSave={async v => {
            const updates = { publishedDate: v }
            if (v && v.length >= 4) updates.year = parseInt(v.substring(0, 4), 10) || paper.year
            const updated = await papersApi.update(paper.id, updates)
            onPaperUpdate?.(updated)
          }} />
        <EditableField label="Venue" value={paper.venue} placeholder="e.g. NeurIPS 2024"
          onSave={v => handleFieldSave('venue', v)} />
        {addedLabel && (
          <div className="flex gap-3 text-xs">
            <span className="text-slate-400 w-12 flex-shrink-0 pt-px">Added</span>
            <span className="text-slate-700">{addedLabel}</span>
          </div>
        )}
        <EditableField label="DOI" value={paper.doi} placeholder="10.xxxx/…" mono
          onSave={v => handleFieldSave('doi', v)} />
        <EditableField label="arXiv" value={paper.arxivId} placeholder="2401.12345" mono
          onSave={v => handleFieldSave('arxivId', v)} />
      </div>

      {/* Status */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Status</p>
        <div className="flex gap-1.5">
          {['inbox', 'to-read', 'read'].map(s => {
            const cfg = statusConfig[s]
            return (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${cfg.class} ${
                  paper.status === s ? 'ring-2 ring-offset-1 ring-current' : 'opacity-50 hover:opacity-80'
                }`}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Collections */}
      <CollectionsPicker item={paper} onUpdate={onPaperUpdate} />

      {/* Abstract */}
      <EditableTextArea
        label="Abstract"
        value={paper.abstract}
        placeholder="Add abstract…"
        onSave={v => handleFieldSave('abstract', v)}
      />

      {/* Links */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Links</p>
        <div className="space-y-2">
          <LinkField
            label="GitHub"
            icon="code"
            type="github"
            value={paper.githubUrl}
            placeholder="https://github.com/owner/repo"
            onSave={v => handleFieldSave('githubUrl', v)}
          />
          <LinkField
            label="Website"
            icon="language"
            type="website"
            value={paper.websiteUrl}
            placeholder="https://…"
            onSave={v => handleFieldSave('websiteUrl', v)}
          />
          <NamedLinks
            links={paper.links || []}
            onSave={links => handleFieldSave('links', links)}
          />
        </div>
      </div>

      {/* Tags */}
      {paper.tags?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {paper.tags.map(tag => (
              <span
                key={tag}
                className={`text-[11px] px-2 py-0.5 rounded-full ${
                  paper.source === 'agent' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Agent provenance */}
      {paper.source === 'agent' && paper.agentRun && (
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-purple-700 text-[11px] font-semibold uppercase tracking-wide">
            <Icon name="smart_toy" className="text-[13px]" />
            Provenance
          </div>
          <p className="text-xs text-purple-700">
            Added by <strong>{paper.agentRun.name}</strong> · Run #{paper.agentRun.runNumber}
          </p>
          {paper.agentReasoning && (
            <p className="text-xs text-purple-600 leading-relaxed">{paper.agentReasoning}</p>
          )}
          <button className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1 mt-1">
            View workflow run
            <Icon name="arrow_forward" className="text-[11px]" />
          </button>
        </div>
      )}
    </div>
  )
}
