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
  const [abstractExpanded, setAbstractExpanded] = useState(false)

  async function handleStatusChange(newStatus) {
    try {
      await papersApi.update(paper.id, { status: newStatus })
      onStatusChange?.(paper.id, newStatus)
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  async function handleLinkSave(field, value) {
    try {
      const updated = await papersApi.update(paper.id, { [field]: value })
      onPaperUpdate?.(updated)
    } catch (err) {
      console.error('Failed to update link:', err)
    }
  }

  const addedLabel = formatAdded(paper.createdAt)

  return (
    <div className="p-4 space-y-5">
      {/* Metadata */}
      <div className="space-y-2">
        {[
          { label: 'Venue', value: paper.venue },
          { label: 'Added', value: addedLabel },
        ].filter(r => r.value).map(({ label, value }) => (
          <div key={label} className="flex gap-3 text-xs">
            <span className="text-slate-400 w-12 flex-shrink-0 pt-px">{label}</span>
            <span className="text-slate-700">{value}</span>
          </div>
        ))}
        {paper.doi && (
          <div className="flex gap-3 text-xs">
            <span className="text-slate-400 w-12 flex-shrink-0 pt-px">DOI</span>
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline font-mono truncate"
              title={paper.doi}
            >
              {paper.doi}
            </a>
          </div>
        )}
        {paper.arxivId && (
          <div className="flex gap-3 text-xs">
            <span className="text-slate-400 w-12 flex-shrink-0 pt-px">arXiv</span>
            <a
              href={`https://arxiv.org/abs/${paper.arxivId}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline font-mono"
            >
              {paper.arxivId}
            </a>
          </div>
        )}
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
      {paper.abstract && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Abstract</p>
          <p className={`text-xs text-slate-600 leading-relaxed ${abstractExpanded ? '' : 'line-clamp-4'}`}>
            {paper.abstract}
          </p>
          <button
            onClick={() => setAbstractExpanded(e => !e)}
            className="mt-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            {abstractExpanded ? 'Show less' : 'Read more'}
          </button>
        </div>
      )}

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
            onSave={v => handleLinkSave('githubUrl', v)}
          />
          <LinkField
            label="Website"
            icon="language"
            type="website"
            value={paper.websiteUrl}
            placeholder="https://…"
            onSave={v => handleLinkSave('websiteUrl', v)}
          />
          <NamedLinks
            links={paper.links || []}
            onSave={links => handleLinkSave('links', links)}
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
