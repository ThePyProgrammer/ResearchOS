import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { papersApi, authorsApi } from '../services/api'
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

// ─── Citation formatters ────────────────────────────────────────────────────

function formatAuthorAPA(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  const last = parts[parts.length - 1]
  const initials = parts.slice(0, -1).map(p => p[0].toUpperCase() + '.').join(' ')
  return `${last}, ${initials}`
}

export function formatCitationAPA(paper) {
  const authors = (paper.authors || [])
  let authorStr
  if (authors.length === 0) authorStr = 'Unknown'
  else if (authors.length <= 6) authorStr = authors.map(formatAuthorAPA).join(', ')
  else authorStr = authors.slice(0, 6).map(formatAuthorAPA).join(', ') + ', ...'
  const year = paper.year ? `(${paper.year})` : '(n.d.)'
  const title = paper.title || 'Untitled'
  const venue = paper.venue ? ` ${paper.venue}.` : ''
  const doi = paper.doi ? ` https://doi.org/${paper.doi}` : (paper.arxivId ? ` https://arxiv.org/abs/${paper.arxivId}` : '')
  return `${authorStr} ${year}. ${title}.${venue}${doi}`.trim()
}

function bibtexKey(paper) {
  const first = (paper.authors?.[0] || '').trim().split(/\s+/).pop() || 'unknown'
  return (first + (paper.year || '')).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function formatCitationBibTeX(paper) {
  const key = bibtexKey(paper)
  const lines = [`@article{${key},`]
  if (paper.title)   lines.push(`  title   = {${paper.title}},`)
  if (paper.authors?.length) lines.push(`  author  = {${paper.authors.join(' and ')}},`)
  if (paper.year)    lines.push(`  year    = {${paper.year}},`)
  if (paper.venue)   lines.push(`  journal = {${paper.venue}},`)
  if (paper.doi)     lines.push(`  doi     = {${paper.doi}},`)
  if (paper.arxivId && !paper.doi) lines.push(`  eprint  = {${paper.arxivId}},`)
  lines.push('}')
  return lines.join('\n')
}

export function formatCitationMarkdown(paper) {
  const url = paper.doi
    ? `https://doi.org/${paper.doi}`
    : paper.arxivId
      ? `https://arxiv.org/abs/${paper.arxivId}`
      : null
  const title = paper.title || 'Untitled'
  const authors = (paper.authors || []).slice(0, 3).join(', ') + (paper.authors?.length > 3 ? ' et al.' : '')
  const meta = [authors, paper.venue, paper.year].filter(Boolean).join(', ')
  const link = url ? `[${title}](${url})` : title
  return meta ? `${link} — ${meta}` : link
}

const CITE_FORMATS = [
  { id: 'apa',      label: 'APA',    fn: formatCitationAPA },
  { id: 'bibtex',   label: 'BibTeX', fn: formatCitationBibTeX },
  { id: 'markdown', label: 'MD',     fn: formatCitationMarkdown },
]

function CitationPanel({ paper }) {
  const [fmt, setFmt] = useState('apa')
  const [copied, setCopied] = useState(false)
  const current = CITE_FORMATS.find(f => f.id === fmt)
  const text = current.fn(paper)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Cite</p>
        <div className="flex items-center gap-1">
          {CITE_FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setFmt(f.id)}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                fmt === f.id
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative group">
        <pre className="text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap break-all font-mono select-all">
          {text}
        </pre>
        <button
          onClick={handleCopy}
          title="Copy citation"
          className={`absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
            copied
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Icon name={copied ? 'check' : 'content_copy'} className="text-[12px]" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
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

function AuthorPopover({ authorName, paperId, linkedAuthor, onLink, onClose, anchorRef }) {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const popoverRef = useRef(null)
  const [pos, setPos] = useState(null)

  // Position below the anchor chip, clamped to viewport horizontally
  const popoverWidth = linkedAuthor ? 256 : 288 // w-64 = 256, w-72 = 288
  useEffect(() => {
    if (!anchorRef?.current) return
    function update() {
      const rect = anchorRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      let left = rect.left
      if (left + popoverWidth > vw - 8) left = vw - popoverWidth - 8
      if (left < 8) left = 8
      setPos({ top: rect.bottom + 4, left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef, popoverWidth])

  useEffect(() => {
    authorsApi.match(authorName)
      .then(data => setCandidates(data))
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false))
  }, [authorName])

  // Close on click outside the popover (but not inside it)
  useEffect(() => {
    const onClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose()
    }
    // Use a timeout so the opening click doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', onClick) }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleLink(authorId) {
    if (!paperId) return
    try {
      await papersApi.linkAuthor(paperId, authorId, 0, authorName)
      onLink?.()
      onClose()
    } catch (err) {
      console.error('Failed to link:', err)
    }
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const author = await authorsApi.create({ name: authorName })
      if (paperId) {
        await papersApi.linkAuthor(paperId, author.id, 0, authorName)
      }
      onLink?.()
      onClose()
    } catch (err) {
      console.error('Failed to create author:', err)
      setCreating(false)
    }
  }

  if (!pos) return null

  const content = linkedAuthor ? (
    <div ref={popoverRef} className="bg-white border border-slate-200 rounded-xl shadow-xl p-3" style={{ position: 'fixed', top: pos.top, left: pos.left, width: popoverWidth, zIndex: 9999 }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
          <Icon name="person" className="text-[14px] text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-800 truncate">{linkedAuthor.name}</p>
          {linkedAuthor.orcid && <p className="text-[10px] text-slate-400 font-mono">{linkedAuthor.orcid}</p>}
        </div>
      </div>
      <button
        onClick={() => { onClose(); navigate(`/authors/${linkedAuthor.id}`) }}
        className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium py-1.5 hover:bg-blue-50 rounded-lg transition-colors"
      >
        View Profile
      </button>
    </div>
  ) : (
    <div ref={popoverRef} className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden" style={{ position: 'fixed', top: pos.top, left: pos.left, width: popoverWidth, zIndex: 9999 }}>
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
        <p className="text-xs text-slate-500">Match &ldquo;{authorName}&rdquo;</p>
      </div>
      {loading ? (
        <div className="p-3 text-xs text-slate-400">Searching...</div>
      ) : candidates?.length > 0 ? (
        <div className="max-h-48 overflow-y-auto">
          {candidates.map(({ author, confidence }) => (
            <div key={author.id} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{author.name}</p>
                <p className="text-[10px] text-slate-400">{author.paperCount} papers · {confidence}</p>
              </div>
              <button
                onClick={() => handleLink(author.id)}
                className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0"
              >
                Link
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-slate-400">No matches found</div>
      )}
      <div className="border-t border-slate-100 px-3 py-2">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium py-1 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create new author'}
        </button>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

function AuthorChip({ author, index, linked, isPopoverOpen, dragIdx, paperId,
  onDragStart, onDragOver, onDrop, onDragEnd, onClickChip, onDoubleClick, onRemove, onLink, onClosePopover }) {
  const chipRef = useRef(null)

  return (
    <div>
      <span
        ref={chipRef}
        draggable
        onDragStart={e => onDragStart(e, index)}
        onDragOver={e => onDragOver(e, index)}
        onDrop={e => onDrop(e, index)}
        onDragEnd={onDragEnd}
        onClick={onClickChip}
        onDoubleClick={onDoubleClick}
        className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full group cursor-grab active:cursor-grabbing transition-opacity ${
          linked ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
        } ${dragIdx === index ? 'opacity-40' : ''}`}
        title={linked ? `Linked: ${linked.name} — Click to view, double-click to edit` : 'Click to link, double-click to edit'}
      >
        <Icon name="person" className={`text-[12px] ${linked ? 'text-blue-500' : 'text-slate-400'}`} />
        {author}
        {linked && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5" title="Linked to author record" />
        )}
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="text-slate-400 hover:text-red-500 transition-colors ml-0.5"
          title="Remove author"
        >
          <Icon name="close" className="text-[11px]" />
        </button>
      </span>
      {isPopoverOpen && (
        <AuthorPopover
          authorName={author}
          paperId={paperId}
          linkedAuthor={linked}
          anchorRef={chipRef}
          onLink={onLink}
          onClose={onClosePopover}
        />
      )}
    </div>
  )
}

export function AuthorChips({ authors = [], onSave, paperId, paperAuthorLinks }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [dragIdx, setDragIdx] = useState(null)
  const [editIdx, setEditIdx] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [popoverIdx, setPopoverIdx] = useState(null)
  const [autocomplete, setAutocomplete] = useState([])
  const [acQuery, setAcQuery] = useState('')

  // Build a map of raw_name → author for linked authors
  const linkMap = {}
  if (Array.isArray(paperAuthorLinks)) {
    for (const item of paperAuthorLinks) {
      if (item.author && item.link?.rawName) {
        linkMap[item.link.rawName] = item.author
      }
    }
  }

  async function addAuthor(value = draft) {
    const name = value.trim()
    if (!name) return
    await onSave([...authors, name])
    setDraft('')
    setAdding(false)
    setAutocomplete([])
    setAcQuery('')
  }

  async function addMultipleAuthors(text) {
    const names = text.split(',').map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return
    await onSave([...authors, ...names])
    setDraft('')
    setAdding(false)
    setAutocomplete([])
    setAcQuery('')
  }

  async function removeAuthor(idx) {
    await onSave(authors.filter((_, i) => i !== idx))
  }

  function startEdit(idx) {
    setEditIdx(idx)
    setEditDraft(authors[idx])
    setPopoverIdx(null)
  }

  async function commitEdit() {
    const name = editDraft.trim()
    if (name && name !== authors[editIdx]) {
      const next = [...authors]
      next[editIdx] = name
      await onSave(next)
    }
    setEditIdx(null)
    setEditDraft('')
  }

  function cancelEdit() {
    setEditIdx(null)
    setEditDraft('')
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

  // Autocomplete for the add input
  useEffect(() => {
    if (!acQuery || acQuery.length < 2) { setAutocomplete([]); return }
    const timer = setTimeout(() => {
      authorsApi.search(acQuery, 5).then(setAutocomplete).catch(() => setAutocomplete([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [acQuery])

  async function selectAutocomplete(result) {
    await addAuthor(result.name)
    // Auto-link if we have paperId
    if (paperId) {
      try {
        await papersApi.linkAuthor(paperId, result.id, authors.length, result.name)
      } catch (_) { /* link may already exist */ }
    }
  }

  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Authors</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {authors.map((author, i) => {
          const linked = linkMap[author]
          const isPopoverOpen = popoverIdx === i

          return editIdx === i ? (
            <input
              key={`edit-${i}`}
              autoFocus
              type="text"
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              onBlur={commitEdit}
              className="px-2 py-0.5 text-[11px] border border-blue-400 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-32"
            />
          ) : (
            <AuthorChip
              key={`${author}-${i}`}
              author={author}
              index={i}
              linked={linked}
              isPopoverOpen={isPopoverOpen}
              dragIdx={dragIdx}
              paperId={paperId}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={() => setDragIdx(null)}
              onClickChip={() => setPopoverIdx(isPopoverOpen ? null : i)}
              onDoubleClick={() => startEdit(i)}
              onRemove={() => removeAuthor(i)}
              onLink={() => {
                setPopoverIdx(null)
                window.dispatchEvent(new CustomEvent('researchos:author-links-changed'))
              }}
              onClosePopover={() => setPopoverIdx(null)}
            />
          )
        })}
        {authors.length === 0 && !adding && (
          <span className="text-[11px] text-slate-400 italic">No authors</span>
        )}
      </div>
      {adding ? (
        <div className="relative">
          <div className="flex gap-1.5 items-center">
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={e => {
                const val = e.target.value
                if (val.includes(',')) {
                  addMultipleAuthors(val)
                } else {
                  setDraft(val)
                  setAcQuery(val)
                }
              }}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text')
                if (pasted.includes(',')) {
                  e.preventDefault()
                  addMultipleAuthors(draft + pasted)
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') addAuthor()
                if (e.key === 'Escape') { setAdding(false); setDraft(''); setAutocomplete([]); setAcQuery('') }
              }}
              onBlur={() => {
                // Delay to allow autocomplete click
                setTimeout(() => {
                  if (draft.trim()) addAuthor()
                  else { setAdding(false); setAutocomplete([]); setAcQuery('') }
                }, 200)
              }}
              placeholder="Author name or paste comma-separated…"
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
          {autocomplete.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {autocomplete.map(result => (
                <button
                  key={result.id}
                  onMouseDown={e => { e.preventDefault(); selectAutocomplete(result) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left"
                >
                  <Icon name="person" className="text-[14px] text-slate-400" />
                  <span className="flex-1 truncate">{result.name}</span>
                  {result.currentAffiliation && (
                    <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{result.currentAffiliation}</span>
                  )}
                  <span className="text-[10px] text-slate-400">{result.paperCount}p</span>
                </button>
              ))}
            </div>
          )}
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
  const [paperAuthorLinks, setPaperAuthorLinks] = useState([])

  useEffect(() => {
    if (paper?.id) loadAuthorLinks()
    function onLinksChanged() { loadAuthorLinks() }
    window.addEventListener('researchos:author-links-changed', onLinksChanged)
    return () => window.removeEventListener('researchos:author-links-changed', onLinksChanged)
  }, [paper?.id])

  async function loadAuthorLinks() {
    try {
      const links = await papersApi.authorLinks(paper.id)
      setPaperAuthorLinks(links)
    } catch (_) { /* silently fail — links are optional enrichment */ }
  }

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
      <AuthorChips authors={paper.authors || []} onSave={v => handleFieldSave('authors', v)} paperId={paper.id} paperAuthorLinks={paperAuthorLinks} />

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

      {/* Citation */}
      <CitationPanel paper={paper} />

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
