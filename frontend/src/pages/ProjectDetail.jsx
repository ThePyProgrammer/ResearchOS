import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { projectsApi, notesApi, researchQuestionsApi, projectPapersApi, papersApi, websitesApi, githubReposApi, experimentsApi } from '../services/api'
import NotesPanel from '../components/NotesPanel'
import {
  DndContext,
  closestCenter,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const projectStatusConfig = {
  active:    { label: 'Active',    class: 'bg-emerald-100 text-emerald-700' },
  paused:    { label: 'Paused',    class: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', class: 'bg-blue-100 text-blue-700' },
  archived:  { label: 'Archived',  class: 'bg-slate-100 text-slate-600' },
}

const rqStatusConfig = {
  open:          { label: 'Open',          class: 'bg-blue-100 text-blue-700' },
  investigating: { label: 'Investigating', class: 'bg-amber-100 text-amber-700' },
  answered:      { label: 'Answered',      class: 'bg-emerald-100 text-emerald-700' },
  discarded:     { label: 'Discarded',     class: 'bg-slate-100 text-slate-600' },
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildRqTree(flatRqs) {
  const byId = Object.fromEntries(flatRqs.map(rq => [rq.id, { ...rq, children: [] }]))
  const roots = []
  for (const rq of Object.values(byId)) {
    if (rq.parentId) byId[rq.parentId]?.children.push(rq)
    else roots.push(rq)
  }
  const sortLevel = nodes => {
    nodes.sort((a, b) => a.position - b.position)
    nodes.forEach(n => sortLevel(n.children))
  }
  sortLevel(roots)
  return roots
}

const experimentStatusConfig = {
  planned:   { label: 'Planned',   class: 'bg-blue-100 text-blue-700' },
  running:   { label: 'Running',   class: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', class: 'bg-emerald-100 text-emerald-700' },
  failed:    { label: 'Failed',    class: 'bg-red-100 text-red-700' },
}

function buildExperimentTree(flatExperiments) {
  const byId = Object.fromEntries(flatExperiments.map(e => [e.id, { ...e, children: [] }]))
  const roots = []
  for (const exp of Object.values(byId)) {
    if (exp.parentId) byId[exp.parentId]?.children.push(exp)
    else roots.push(exp)
  }
  const sortLevel = nodes => {
    nodes.sort((a, b) => a.position - b.position)
    nodes.forEach(n => sortLevel(n.children))
  }
  sortLevel(roots)
  return roots
}

function flattenExperimentTree(nodes, parentId = null) {
  const result = []
  for (const node of nodes) {
    result.push({ ...node, _parentId: parentId })
    if (node.children && node.children.length > 0) {
      result.push(...flattenExperimentTree(node.children, node.id))
    }
  }
  return result
}

function detectType(raw) {
  const trimmed = String(raw).trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const num = Number(trimmed)
  if (trimmed !== '' && !isNaN(num)) return num
  return trimmed
}

// ─── Inline editable field ──────────────────────────────────────────────────

function EditableName({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => { setDraft(value) }, [value])

  async function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) await onSave(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        className="text-2xl font-bold text-slate-800 w-full bg-white border border-blue-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
    )
  }

  return (
    <h1
      className="text-2xl font-bold text-slate-800 cursor-pointer hover:bg-slate-100 rounded-lg px-2 py-1 -ml-2 transition-colors truncate"
      title="Click to edit"
      onClick={() => setEditing(true)}
    >
      {value || 'Untitled Project'}
    </h1>
  )
}

function EditableDescription({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => { setDraft(value || '') }, [value])

  async function commit() {
    const trimmed = draft.trim()
    if (trimmed !== (value || '').trim()) await onSave(trimmed || null)
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
        }}
        rows={4}
        placeholder="Add a description for this project..."
        className="w-full text-sm text-slate-600 bg-white border border-blue-400 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
      />
    )
  }

  return (
    <p
      className={`text-sm cursor-pointer hover:bg-slate-100 rounded-lg px-2 py-1.5 -ml-2 transition-colors ${
        value ? 'text-slate-600' : 'text-slate-400 italic'
      }`}
      title="Click to edit"
      onClick={() => setEditing(true)}
    >
      {value || 'Add a description...'}
    </p>
  )
}

// ─── Status dropdowns ─────────────────────────────────────────────────────────

function StatusDropdown({ status, onSave }) {
  const cfg = projectStatusConfig[status] || projectStatusConfig.active
  return (
    <select
      value={status || 'active'}
      onChange={e => onSave(e.target.value)}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${cfg.class}`}
    >
      {Object.entries(projectStatusConfig).map(([key, cfg]) => (
        <option key={key} value={key}>{cfg.label}</option>
      ))}
    </select>
  )
}

function RQStatusDropdown({ status, onChange }) {
  const cfg = rqStatusConfig[status] || rqStatusConfig.open
  return (
    <select
      value={status || 'open'}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex-shrink-0 ${cfg.class}`}
    >
      {Object.entries(rqStatusConfig).map(([key, c]) => (
        <option key={key} value={key}>{c.label}</option>
      ))}
    </select>
  )
}

function ExperimentStatusDropdown({ status, onChange }) {
  const cfg = experimentStatusConfig[status] || experimentStatusConfig.planned
  return (
    <select
      value={status || 'planned'}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex-shrink-0 ${cfg.class}`}
    >
      {Object.entries(experimentStatusConfig).map(([key, c]) => (
        <option key={key} value={key}>{c.label}</option>
      ))}
    </select>
  )
}

// ─── Add RQ inline input ──────────────────────────────────────────────────────

function AddRQInput({ projectId, parentId, onCreated }) {
  const [active, setActive] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (active && inputRef.current) inputRef.current.focus()
  }, [active])

  async function commit() {
    const trimmed = text.trim()
    if (trimmed) {
      try {
        await researchQuestionsApi.create(projectId, {
          question: trimmed,
          parent_id: parentId || null,
        })
        onCreated()
      } catch (err) {
        console.error('Failed to create research question:', err)
      }
    }
    setText('')
    setActive(false)
  }

  async function handleBlur() {
    const trimmed = text.trim()
    if (trimmed) {
      await commit()
    } else {
      setText('')
      setActive(false)
    }
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors py-1 px-1"
      >
        <Icon name="add" className="text-[14px]" />
        {parentId ? 'Add sub-question' : 'Add research question'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setText(''); setActive(false) }
        }}
        placeholder={parentId ? 'Sub-question...' : 'Research question...'}
        className="flex-1 text-sm text-slate-800 bg-white border border-blue-400 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
    </div>
  )
}

// ─── Mini Search Picker (for RQ-level paper linking) ─────────────────────────

function MiniSearchPicker({ onLink, existingPaperIds = new Set(), existingWebsiteIds = new Set(), existingRepoIds = new Set(), libraryId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const containerRef = useRef(null)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleQueryChange(e) {
    const q = e.target.value
    setQuery(q)
    if (!q.trim()) { setResults([]); setOpen(false); return }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const libFilter = libraryId ? { search: q, library_id: libraryId } : { search: q }
        const [papers, websites, repos] = await Promise.all([
          papersApi.list(libFilter),
          websitesApi.list(libFilter),
          githubReposApi.list(libFilter),
        ])
        const paperResults = (Array.isArray(papers) ? papers : papers?.items || []).map(p => ({ ...p, _type: 'paper' }))
        const websiteResults = (Array.isArray(websites) ? websites : websites?.items || []).map(w => ({ ...w, _type: 'website' }))
        const repoResults = (Array.isArray(repos) ? repos : repos?.items || []).map(r => ({ ...r, _type: 'github_repo' }))
        setResults([...paperResults.slice(0, 5), ...websiteResults.slice(0, 5), ...repoResults.slice(0, 5)])
        setOpen(true)
      } catch (err) {
        console.error('Mini search failed:', err)
      }
    }, 300)
  }

  async function handleSelect(item) {
    if (linking) return
    const alreadyLinked = item._type === 'paper' ? existingPaperIds.has(item.id) : item._type === 'github_repo' ? existingRepoIds.has(item.id) : existingWebsiteIds.has(item.id)
    if (alreadyLinked) return
    setLinking(true)
    try {
      const data = item._type === 'paper' ? { paperId: item.id } : item._type === 'github_repo' ? { githubRepoId: item.id } : { websiteId: item.id }
      await onLink(data)
      setQuery('')
      setResults([])
      setOpen(false)
    } catch (err) {
      console.error('Mini link failed:', err)
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400/30">
        <Icon name="search" className="text-[13px] text-slate-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={handleQueryChange}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); setResults([]) } }}
          placeholder="Search papers, websites, and repos..."
          className="text-xs text-slate-700 bg-transparent focus:outline-none w-44"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto min-w-[260px]">
          {results.map(item => {
            const alreadyLinked = item._type === 'paper' ? existingPaperIds.has(item.id) : item._type === 'github_repo' ? existingRepoIds.has(item.id) : existingWebsiteIds.has(item.id)
            const title = item.title || 'Untitled'
            const authors = Array.isArray(item.authors) ? item.authors.slice(0, 2).join(', ') : ''
            const typeLabel = item._type === 'paper' ? 'Paper' : item._type === 'github_repo' ? 'GitHub' : 'Website'
            const typeClass = item._type === 'paper' ? 'bg-blue-100 text-blue-700' : item._type === 'github_repo' ? 'bg-violet-100 text-violet-700' : 'bg-purple-100 text-purple-700'
            return (
              <button
                key={`${item._type}-${item.id}`}
                onClick={() => handleSelect(item)}
                disabled={alreadyLinked || linking}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                  alreadyLinked ? 'opacity-40 cursor-default' : 'hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${typeClass}`}>
                  {typeLabel}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-800 truncate">{title}</div>
                  {authors && <div className="text-[10px] text-slate-400 truncate">{authors}</div>}
                </div>
                {alreadyLinked && <Icon name="check" className="text-[13px] text-emerald-500 flex-shrink-0 mt-0.5" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── KV Editor ────────────────────────────────────────────────────────────────

function KVEditor({ data, label, onSave }) {
  // Normalize data to array of {key, value} rows
  const [rows, setRows] = useState(() =>
    Object.entries(data || {}).map(([k, v]) => ({ key: k, value: String(v) }))
  )
  const [editingCell, setEditingCell] = useState(null) // { rowIndex, col: 'key'|'value' }
  const [draft, setDraft] = useState('')

  // Sync when data prop changes (e.g., after refresh)
  useEffect(() => {
    setRows(Object.entries(data || {}).map(([k, v]) => ({ key: k, value: String(v) })))
  }, [data])

  function startEdit(rowIndex, col) {
    setEditingCell({ rowIndex, col })
    setDraft(rows[rowIndex][col])
  }

  async function commitEdit() {
    if (!editingCell) return
    const { rowIndex, col } = editingCell
    const newRows = rows.map((r, i) => i === rowIndex ? { ...r, [col]: draft } : r)
    setRows(newRows)
    setEditingCell(null)
    // Build dict and call onSave
    const dict = {}
    for (const r of newRows) {
      if (r.key.trim()) dict[r.key.trim()] = detectType(r.value)
    }
    await onSave(dict)
  }

  async function addRow() {
    const newRows = [...rows, { key: '', value: '' }]
    setRows(newRows)
    // Start editing the key of the new row
    setEditingCell({ rowIndex: newRows.length - 1, col: 'key' })
    setDraft('')
  }

  async function removeRow(rowIndex) {
    const newRows = rows.filter((_, i) => i !== rowIndex)
    setRows(newRows)
    const dict = {}
    for (const r of newRows) {
      if (r.key.trim()) dict[r.key.trim()] = detectType(r.value)
    }
    await onSave(dict)
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <button
          onClick={addRow}
          className="text-slate-400 hover:text-blue-600 transition-colors"
          title={`Add ${label.toLowerCase()} row`}
        >
          <Icon name="add" className="text-[13px]" />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No {label.toLowerCase()} set</p>
      ) : (
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 group/row hover:bg-slate-50 transition-colors">
                  {/* Key cell */}
                  <td
                    className="px-2 py-1 text-slate-500 font-medium w-1/3 cursor-pointer min-w-0"
                    onClick={() => startEdit(i, 'key')}
                  >
                    {editingCell?.rowIndex === i && editingCell?.col === 'key' ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') { setEditingCell(null) }
                          if (e.key === 'Tab') { e.preventDefault(); commitEdit(); setTimeout(() => startEdit(i, 'value'), 0) }
                        }}
                        className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate block" title={row.key}>{row.key || <span className="text-slate-300">key</span>}</span>
                    )}
                  </td>
                  {/* Value cell */}
                  <td
                    className="px-2 py-1 text-slate-700 cursor-pointer min-w-0"
                    onClick={() => startEdit(i, 'value')}
                  >
                    {editingCell?.rowIndex === i && editingCell?.col === 'value' ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') { setEditingCell(null) }
                        }}
                        className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate block font-mono text-[11px]" title={String(row.value)}>{row.value !== '' ? String(row.value) : <span className="text-slate-300">value</span>}</span>
                    )}
                  </td>
                  {/* Remove button */}
                  <td className="px-1 py-1 w-6 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); removeRow(i) }}
                      className="opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-red-400 transition-colors"
                      title="Remove row"
                    >
                      <Icon name="close" className="text-[12px]" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Experiment Create Modal ──────────────────────────────────────────────────

function ExperimentCreateModal({ projectId, parentId, onCreated, onClose }) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState('planned')
  const [configRows, setConfigRows] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    if (nameRef.current) nameRef.current.focus()
  }, [])

  // Escape key closes modal
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || submitting) return
    setSubmitting(true)
    try {
      const config = {}
      for (const row of configRows) {
        if (row.key.trim()) config[row.key.trim()] = detectType(row.value)
      }
      await experimentsApi.create(projectId, {
        name: trimmedName,
        status,
        config,
        parent_id: parentId || null,
      })
      onCreated()
      onClose()
    } catch (err) {
      console.error('Failed to create experiment:', err)
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {parentId ? 'Add Sub-Experiment' : 'New Experiment'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Experiment name..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <ExperimentStatusDropdown status={status} onChange={setStatus} />
          </div>

          {/* Config rows */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium text-slate-600">Config (optional)</label>
              <button
                type="button"
                onClick={() => setConfigRows(prev => [...prev, { key: '', value: '' }])}
                className="text-slate-400 hover:text-blue-600 transition-colors"
                title="Add config row"
              >
                <Icon name="add" className="text-[13px]" />
              </button>
            </div>
            {configRows.length > 0 && (
              <div className="space-y-1.5">
                {configRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={row.key}
                      onChange={e => setConfigRows(prev => prev.map((r, j) => j === i ? { ...r, key: e.target.value } : r))}
                      placeholder="key"
                      className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400"
                    />
                    <input
                      value={row.value}
                      onChange={e => setConfigRows(prev => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
                      placeholder="value"
                      className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() => setConfigRows(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Icon name="close" className="text-[14px]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── RQ Node (recursive) ──────────────────────────────────────────────────────

function RQNode({ rq, depth, parentId = null, projectId, libraryId, onRefresh, rqPapersMap, onRqPapersChange, rootRqs = [], onReParent, isDragOverlay = false }) {
  const [expanded, setExpanded] = useState(true)
  const [editingQuestion, setEditingQuestion] = useState(false)
  const [questionDraft, setQuestionDraft] = useState(rq.question)
  const [editingHypothesis, setEditingHypothesis] = useState(false)
  const [hypothesisDraft, setHypothesisDraft] = useState(rq.hypothesis || '')
  const [menuOpen, setMenuOpen] = useState(false)
  const [nestPickerOpen, setNestPickerOpen] = useState(false)
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const menuRef = useRef(null)

  // DnD sortable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rq.id })

  useEffect(() => { setQuestionDraft(rq.question) }, [rq.question])
  useEffect(() => { setHypothesisDraft(rq.hypothesis || '') }, [rq.hypothesis])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
        setNestPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  async function saveQuestion() {
    const trimmed = questionDraft.trim()
    if (trimmed && trimmed !== rq.question) {
      try {
        await researchQuestionsApi.update(rq.id, { question: trimmed })
        onRefresh()
      } catch (err) {
        console.error('Failed to update question:', err)
      }
    }
    setEditingQuestion(false)
  }

  async function saveStatus(newStatus) {
    try {
      await researchQuestionsApi.update(rq.id, { status: newStatus })
      onRefresh()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  async function saveHypothesis() {
    const trimmed = hypothesisDraft.trim()
    const newVal = trimmed || null
    if (newVal !== (rq.hypothesis || null)) {
      try {
        await researchQuestionsApi.update(rq.id, { hypothesis: newVal })
        onRefresh()
      } catch (err) {
        console.error('Failed to update hypothesis:', err)
      }
    }
    setEditingHypothesis(false)
  }

  async function handleDelete() {
    setMenuOpen(false)
    const childCount = rq.children?.length || 0
    if (childCount > 0) {
      const confirmed = window.confirm(
        `Delete this question and its ${childCount} sub-question(s)?`
      )
      if (!confirmed) return
    }
    try {
      await researchQuestionsApi.remove(rq.id)
      onRefresh()
    } catch (err) {
      console.error('Failed to delete research question:', err)
    }
  }

  const isSubQuestion = parentId !== null

  async function handleNestUnder(targetParentId) {
    setMenuOpen(false)
    setNestPickerOpen(false)
    if (onReParent) await onReParent(rq.id, targetParentId)
  }

  async function handlePromoteToRoot() {
    setMenuOpen(false)
    if (onReParent) await onReParent(rq.id, null)
  }

  // Candidates for "Nest under" / "Move to": root RQs, excluding self and current parent
  const reparentCandidates = rootRqs.filter(r => r.id !== rq.id && r.id !== parentId)

  // RQ paper linking
  const rqPapers = rqPapersMap?.get(rq.id) || []
  const existingPaperIds = useMemo(() => new Set(rqPapers.filter(p => p.paperId).map(p => p.paperId)), [rqPapers])
  const existingWebsiteIds = useMemo(() => new Set(rqPapers.filter(p => p.websiteId).map(p => p.websiteId)), [rqPapers])
  const hasLinkedPapers = rqPapers.length > 0

  async function handleRqLink(data) {
    await researchQuestionsApi.linkPaper(rq.id, data)
    // Refresh rq papers for this rq
    try {
      const updated = await researchQuestionsApi.listPapers(rq.id)
      onRqPapersChange(rq.id, updated)
    } catch (err) {
      console.error('Failed to refresh rq papers:', err)
    }
    setShowLinkPicker(false)
  }

  async function handleRqUnlink(linkId) {
    try {
      await researchQuestionsApi.unlinkPaper(rq.id, linkId)
      const updated = await researchQuestionsApi.listPapers(rq.id)
      onRqPapersChange(rq.id, updated)
    } catch (err) {
      console.error('Failed to unlink from rq:', err)
    }
  }

  const hasChildren = rq.children && rq.children.length > 0

  const sortableStyle = isDragOverlay ? {} : {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={isDragOverlay ? undefined : setNodeRef} style={{ paddingLeft: depth * 24, ...sortableStyle }}>
      {/* Row */}
      <div className="group relative flex items-start gap-1 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
        {/* Drag handle — listeners go here only, preserving click targets elsewhere */}
        <span
          className="opacity-0 group-hover:opacity-100 text-slate-300 flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing touch-none"
          {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
        >
          <Icon name="drag_indicator" className="text-[16px]" />
        </span>

        {/* Expand/collapse chevron */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
        >
          <Icon
            name={expanded ? 'expand_more' : 'chevron_right'}
            className="text-[16px]"
          />
        </button>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Question line */}
          <div className="flex items-center gap-2 flex-wrap">
            {editingQuestion ? (
              <input
                autoFocus
                value={questionDraft}
                onChange={e => setQuestionDraft(e.target.value)}
                onBlur={saveQuestion}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveQuestion()
                  if (e.key === 'Escape') { setQuestionDraft(rq.question); setEditingQuestion(false) }
                }}
                className="flex-1 text-sm text-slate-800 bg-white border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            ) : (
              <span
                className="flex-1 text-sm text-slate-800 cursor-pointer hover:text-blue-700 min-w-0"
                title="Click to edit"
                onClick={() => setEditingQuestion(true)}
              >
                {rq.question}
              </span>
            )}

            {/* Collapsed sub-question count */}
            {!expanded && hasChildren && (
              <span className="text-xs text-slate-400 flex-shrink-0">
                ({rq.children.length} sub-question{rq.children.length !== 1 ? 's' : ''})
              </span>
            )}

            <RQStatusDropdown status={rq.status} onChange={saveStatus} />

            {/* Gap indicator: no linked papers */}
            {!hasLinkedPapers && (
              <span
                className="text-amber-400 flex-shrink-0"
                title="No supporting literature linked"
              >
                <Icon name="warning_amber" className="text-[14px]" />
              </span>
            )}
          </div>

          {/* Expanded content */}
          {expanded && (
            <div className="mt-1.5 space-y-2">
              {/* Hypothesis */}
              {editingHypothesis ? (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-400 flex-shrink-0 mt-1">Hypothesis:</span>
                  <input
                    autoFocus
                    value={hypothesisDraft}
                    onChange={e => setHypothesisDraft(e.target.value)}
                    onBlur={saveHypothesis}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveHypothesis()
                      if (e.key === 'Escape') { setHypothesisDraft(rq.hypothesis || ''); setEditingHypothesis(false) }
                    }}
                    placeholder="Enter hypothesis..."
                    className="flex-1 text-sm text-slate-700 bg-white border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5">Hypothesis:</span>
                  <span
                    className={`text-sm cursor-pointer hover:text-blue-700 transition-colors ${
                      rq.hypothesis ? 'text-slate-600' : 'text-slate-400 italic'
                    }`}
                    onClick={() => setEditingHypothesis(true)}
                  >
                    {rq.hypothesis || 'Add hypothesis...'}
                  </span>
                </div>
              )}

              {/* Linked papers chips */}
              {rqPapers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-0">
                  {rqPapers.map(link => {
                    const label = link.paperTitle || link.websiteTitle || link.paperId || link.websiteId || 'Unknown'
                    return (
                      <span
                        key={link.id}
                        className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100"
                        title={label}
                      >
                        <span className="truncate max-w-[160px]">{label}</span>
                        <button
                          onClick={() => handleRqUnlink(link.id)}
                          className="text-blue-400 hover:text-blue-700 flex-shrink-0 ml-0.5"
                        >
                          <Icon name="close" className="text-[11px]" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Link paper to RQ */}
              <div className="pl-0">
                {showLinkPicker ? (
                  <div className="flex items-center gap-2">
                    <MiniSearchPicker
                      onLink={handleRqLink}
                      existingPaperIds={existingPaperIds}
                      existingWebsiteIds={existingWebsiteIds}
                      libraryId={libraryId}
                    />
                    <button
                      onClick={() => setShowLinkPicker(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowLinkPicker(true)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Icon name="link" className="text-[13px]" />
                    Link paper
                  </button>
                )}
              </div>

              {/* Children */}
              {hasChildren && (
                <div className="space-y-0">
                  {rq.children.map(child => (
                    <RQNode
                      key={child.id}
                      rq={child}
                      depth={0}
                      parentId={rq.id}
                      projectId={projectId}
                      libraryId={libraryId}
                      onRefresh={onRefresh}
                      rqPapersMap={rqPapersMap}
                      onRqPapersChange={onRqPapersChange}
                      rootRqs={rootRqs}
                      onReParent={onReParent}
                    />
                  ))}
                </div>
              )}

              {/* Add sub-question */}
              <div className="pl-1">
                <AddRQInput
                  projectId={projectId}
                  parentId={rq.id}
                  onCreated={onRefresh}
                />
              </div>
            </div>
          )}
        </div>

        {/* Three-dot menu */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(m => { if (m) setNestPickerOpen(false); return !m }) }}
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded"
          >
            <Icon name="more_vert" className="text-[16px]" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[150px]">
              {!nestPickerOpen ? (
                <>
                  {/* Nesting actions */}
                  {!isSubQuestion && reparentCandidates.length > 0 && (
                    <button
                      onClick={() => setNestPickerOpen(true)}
                      className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                    >
                      <Icon name="subdirectory_arrow_right" className="text-[14px] text-slate-400" />
                      Nest under…
                    </button>
                  )}
                  {isSubQuestion && (
                    <>
                      <button
                        onClick={handlePromoteToRoot}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                      >
                        <Icon name="vertical_align_top" className="text-[14px] text-slate-400" />
                        Promote to root
                      </button>
                      {reparentCandidates.length > 0 && (
                        <button
                          onClick={() => setNestPickerOpen(true)}
                          className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                        >
                          <Icon name="subdirectory_arrow_right" className="text-[14px] text-slate-400" />
                          Move under…
                        </button>
                      )}
                    </>
                  )}
                  {((!isSubQuestion && reparentCandidates.length > 0) || isSubQuestion) && (
                    <div className="border-t border-slate-100 my-1" />
                  )}
                  <button
                    onClick={handleDelete}
                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <div className="px-3 py-1.5 text-xs font-medium text-slate-500 border-b border-slate-100">
                    {isSubQuestion ? 'Move under:' : 'Nest under:'}
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {reparentCandidates.map(candidate => (
                      <button
                        key={candidate.id}
                        onClick={() => handleNestUnder(candidate.id)}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors truncate"
                        title={candidate.question}
                      >
                        {candidate.question}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setNestPickerOpen(false)}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 transition-colors border-t border-slate-100 flex items-center gap-1"
                  >
                    <Icon name="arrow_back" className="text-[12px]" />
                    Back
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Flatten tree helpers for DnD ─────────────────────────────────────────────

function flattenRqTree(nodes, parentId = null) {
  const result = []
  for (const node of nodes) {
    result.push({ ...node, _parentId: parentId })
    if (node.children && node.children.length > 0) {
      result.push(...flattenRqTree(node.children, node.id))
    }
  }
  return result
}

// ─── RQ Section ───────────────────────────────────────────────────────────────

function RQSection({ projectId, libraryId }) {
  const [flatRqs, setFlatRqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [rqPapersMap, setRqPapersMap] = useState(new Map())
  const [activeId, setActiveId] = useState(null)

  const rqTree = useMemo(() => buildRqTree(flatRqs), [flatRqs])
  const flatTree = useMemo(() => flattenRqTree(rqTree), [rqTree])
  // Root-level RQs list passed to RQNode for the nest/move picker
  const rootRqs = useMemo(() => rqTree.map(n => ({ id: n.id, question: n.question })), [rqTree])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const fetchRqPapers = useCallback(async (rqs) => {
    if (!rqs.length) { setRqPapersMap(new Map()); return }
    try {
      const results = await Promise.all(rqs.map(rq => researchQuestionsApi.listPapers(rq.id)))
      const map = new Map()
      rqs.forEach((rq, i) => map.set(rq.id, Array.isArray(results[i]) ? results[i] : []))
      setRqPapersMap(map)
    } catch (err) {
      console.error('Failed to fetch rq papers:', err)
    }
  }, [])

  const fetchRqs = useCallback(async () => {
    try {
      const data = await researchQuestionsApi.list(projectId)
      const rqs = Array.isArray(data) ? data : []
      setFlatRqs(rqs)
      await fetchRqPapers(rqs)
    } catch (err) {
      console.error('Failed to fetch research questions:', err)
      setFlatRqs([])
    } finally {
      setLoading(false)
    }
  }, [projectId, fetchRqPapers])

  useEffect(() => {
    fetchRqs()
  }, [fetchRqs])

  const handleRqPapersChange = useCallback((rqId, papers) => {
    setRqPapersMap(prev => {
      const next = new Map(prev)
      next.set(rqId, papers)
      return next
    })
  }, [])

  // Find the rq node with the given id in flatTree
  function findFlatNode(id) {
    return flatTree.find(n => n.id === id) || null
  }

  // Drag handles sibling reorder only; reparenting is via the context menu
  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const draggedNode = findFlatNode(active.id)
    const targetNode = findFlatNode(over.id)
    if (!draggedNode || !targetNode) return

    const draggedParentId = draggedNode._parentId || null
    const targetParentId = targetNode._parentId || null

    // Different parents — ignore (use context menu to reparent)
    if (draggedParentId !== targetParentId) return

    // Sibling reorder
    const siblings = flatTree
      .filter(n => (n._parentId || null) === draggedParentId)
      .sort((a, b) => a.position - b.position)

    const oldIndex = siblings.findIndex(n => n.id === active.id)
    const newIndex = siblings.findIndex(n => n.id === over.id)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    const reordered = arrayMove(siblings, oldIndex, newIndex)

    // Update positions optimistically
    setFlatRqs(prev => {
      const byId = Object.fromEntries(prev.map(rq => [rq.id, { ...rq }]))
      reordered.forEach((rq, i) => { if (byId[rq.id]) byId[rq.id].position = i })
      return Object.values(byId)
    })

    try {
      const ids = reordered.map(n => n.id)
      await researchQuestionsApi.reorder(reordered[0].id, ids)
      await fetchRqs()
    } catch (err) {
      console.error('Failed to reorder research questions:', err)
      await fetchRqs()
    }
  }

  // Context-menu reparenting: newParentId=null promotes to root
  async function handleReParent(rqId, newParentId) {
    try {
      const siblings = flatTree.filter(n => (n._parentId || null) === newParentId)
      const newPosition = siblings.length
      await researchQuestionsApi.update(rqId, { parent_id: newParentId, position: newPosition })
      await fetchRqs()
    } catch (err) {
      console.error('Failed to reparent research question:', err)
    }
  }

  // Find RQ for active drag overlay
  const activeRq = activeId ? flatTree.find(n => n.id === activeId) : null

  // Collect all IDs for SortableContext (flat list of all nodes)
  const allIds = flatTree.map(n => n.id)

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Research Questions</h3>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-8 bg-slate-100 rounded-lg" />
          <div className="h-8 bg-slate-100 rounded-lg" />
        </div>
      ) : rqTree.length === 0 ? (
        <div>
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center mb-2">
            <p className="text-sm text-slate-400">No research questions yet</p>
          </div>
          <AddRQInput projectId={projectId} parentId={null} onCreated={fetchRqs} />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveId(active.id)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
            <div>
              <div className="space-y-0">
                {rqTree.map(rq => (
                  <RQNode
                    key={rq.id}
                    rq={rq}
                    depth={0}
                    projectId={projectId}
                    libraryId={libraryId}
                    onRefresh={fetchRqs}
                    rqPapersMap={rqPapersMap}
                    onRqPapersChange={handleRqPapersChange}
                    rootRqs={rootRqs}
                    onReParent={handleReParent}
                  />
                ))}
              </div>
              <div className="mt-1 pl-9">
                <AddRQInput projectId={projectId} parentId={null} onCreated={fetchRqs} />
              </div>
            </div>
          </SortableContext>

          <DragOverlay>
            {activeRq ? (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg flex items-center gap-2 max-w-xs">
                <Icon name="drag_indicator" className="text-[16px] text-slate-300 flex-shrink-0" />
                <span className="text-sm text-slate-800 truncate flex-1">{activeRq.question}</span>
                {activeRq.status && (
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    rqStatusConfig[activeRq.status]?.class || rqStatusConfig.open.class
                  }`}>
                    {rqStatusConfig[activeRq.status]?.label || activeRq.status}
                  </span>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

// ─── Experiment Node (recursive) ──────────────────────────────────────────────

function ExperimentNode({ experiment, depth, onRefresh, projectId, isDragOverlay = false }) {
  const [expanded, setExpanded] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(experiment.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const menuRef = useRef(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: experiment.id })

  useEffect(() => { setNameDraft(experiment.name) }, [experiment.name])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  async function saveName() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== experiment.name) {
      try {
        await experimentsApi.update(experiment.id, { name: trimmed })
        onRefresh()
      } catch (err) {
        console.error('Failed to update experiment name:', err)
      }
    }
    setEditingName(false)
  }

  async function saveStatus(newStatus) {
    try {
      await experimentsApi.update(experiment.id, { status: newStatus })
      onRefresh()
    } catch (err) {
      console.error('Failed to update experiment status:', err)
    }
  }

  async function handleDelete() {
    setMenuOpen(false)
    const childCount = experiment.children?.length || 0
    const msg = childCount > 0
      ? `Delete this experiment and its ${childCount} sub-experiment(s)?`
      : `Delete experiment "${experiment.name}"?`
    if (!window.confirm(msg)) return
    try {
      await experimentsApi.remove(experiment.id)
      onRefresh()
    } catch (err) {
      console.error('Failed to delete experiment:', err)
    }
  }

  const hasChildren = experiment.children && experiment.children.length > 0
  const isLeaf = !hasChildren

  const sortableStyle = isDragOverlay ? {} : {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={isDragOverlay ? undefined : setNodeRef} style={{ paddingLeft: depth * 24, ...sortableStyle }}>
      {/* Row */}
      <div className="group relative flex items-start gap-1 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
        {/* Drag handle */}
        <span
          className="opacity-0 group-hover:opacity-100 text-slate-300 flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing touch-none"
          {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
        >
          <Icon name="drag_indicator" className="text-[16px]" />
        </span>

        {/* Expand/collapse chevron */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
        >
          <Icon
            name={hasChildren ? (expanded ? 'expand_more' : 'chevron_right') : 'remove'}
            className="text-[16px]"
          />
        </button>

        {/* Node icon */}
        <span className="flex-shrink-0 mt-0.5 text-slate-400">
          <Icon name={isLeaf ? 'science' : 'account_tree'} className="text-[14px]" />
        </span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Name + status row */}
          <div className="flex items-center gap-2 flex-wrap">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName()
                  if (e.key === 'Escape') { setNameDraft(experiment.name); setEditingName(false) }
                }}
                className="flex-1 text-sm text-slate-800 bg-white border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            ) : (
              <span
                className="flex-1 text-sm text-slate-800 cursor-pointer hover:text-blue-700 min-w-0"
                title="Double-click to edit"
                onDoubleClick={() => setEditingName(true)}
              >
                {experiment.name}
              </span>
            )}

            {/* Collapsed children count */}
            {!expanded && hasChildren && (
              <span className="text-xs text-slate-400 flex-shrink-0">
                ({experiment.children.length} sub-experiment{experiment.children.length !== 1 ? 's' : ''})
              </span>
            )}

            <ExperimentStatusDropdown status={experiment.status} onChange={saveStatus} />
          </div>

          {/* Expanded: config, metrics, children */}
          {expanded && (
            <div className="mt-1.5 space-y-1">
              {/* Config KV editor */}
              <KVEditor
                data={experiment.config || {}}
                label="Config"
                onSave={async (updatedConfig) => {
                  try {
                    await experimentsApi.update(experiment.id, { config: updatedConfig })
                    onRefresh()
                  } catch (err) {
                    console.error('Failed to update config:', err)
                  }
                }}
              />

              {/* Metrics KV editor */}
              <KVEditor
                data={experiment.metrics || {}}
                label="Metrics"
                onSave={async (updatedMetrics) => {
                  try {
                    await experimentsApi.update(experiment.id, { metrics: updatedMetrics })
                    onRefresh()
                  } catch (err) {
                    console.error('Failed to update metrics:', err)
                  }
                }}
              />

              {/* Children */}
              {hasChildren && (
                <div className="space-y-0 mt-1">
                  {experiment.children.map(child => (
                    <ExperimentNode
                      key={child.id}
                      experiment={child}
                      depth={0}
                      onRefresh={onRefresh}
                      projectId={projectId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Three-dot menu */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(m => !m) }}
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded"
          >
            <Icon name="more_vert" className="text-[16px]" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px]">
              <button
                onClick={() => { setMenuOpen(false); setShowCreateModal(true) }}
                className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              >
                <Icon name="add" className="text-[14px] text-slate-400" />
                Add sub-experiment
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create sub-experiment modal */}
      {showCreateModal && (
        <ExperimentCreateModal
          projectId={projectId}
          parentId={experiment.id}
          onCreated={onRefresh}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}

// ─── Experiment Section ────────────────────────────────────────────────────────

function ExperimentSection({ projectId }) {
  const [flatExperiments, setFlatExperiments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeId, setActiveId] = useState(null)

  const expTree = useMemo(() => buildExperimentTree(flatExperiments), [flatExperiments])
  const flatTree = useMemo(() => flattenExperimentTree(expTree), [expTree])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const fetchExperiments = useCallback(async () => {
    try {
      const data = await experimentsApi.list(projectId)
      setFlatExperiments(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      console.error('Failed to fetch experiments:', err)
      setError('Failed to load experiments')
      setFlatExperiments([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchExperiments()
  }, [fetchExperiments])

  function findFlatNode(id) {
    return flatTree.find(n => n.id === id) || null
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const draggedNode = findFlatNode(active.id)
    const targetNode = findFlatNode(over.id)
    if (!draggedNode || !targetNode) return

    const draggedParentId = draggedNode._parentId || null
    const targetParentId = targetNode._parentId || null

    // Different parents — reparenting is context-menu only
    if (draggedParentId !== targetParentId) return

    const siblings = flatTree
      .filter(n => (n._parentId || null) === draggedParentId)
      .sort((a, b) => a.position - b.position)

    const oldIndex = siblings.findIndex(n => n.id === active.id)
    const newIndex = siblings.findIndex(n => n.id === over.id)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    const reordered = arrayMove(siblings, oldIndex, newIndex)

    // Optimistic update
    setFlatExperiments(prev => {
      const byId = Object.fromEntries(prev.map(e => [e.id, { ...e }]))
      reordered.forEach((e, i) => { if (byId[e.id]) byId[e.id].position = i })
      return Object.values(byId)
    })

    try {
      const ids = reordered.map(n => n.id)
      await experimentsApi.reorder(reordered[0].id, ids)
      await fetchExperiments()
    } catch (err) {
      console.error('Failed to reorder experiments:', err)
      await fetchExperiments()
    }
  }

  const activeExp = activeId ? flatTree.find(n => n.id === activeId) : null
  const allIds = flatTree.map(n => n.id)

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Experiments</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Icon name="add" className="text-[16px]" />
          Add Experiment
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-8 bg-slate-100 rounded-lg" />
          <div className="h-8 bg-slate-100 rounded-lg" />
          <div className="h-8 bg-slate-100 rounded-lg" />
        </div>
      ) : error ? (
        <div className="border border-red-100 rounded-lg p-4 text-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : expTree.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
          <Icon name="science" className="text-slate-300 text-[36px] mb-2" />
          <p className="text-sm text-slate-400 mb-3">No experiments yet</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Create your first experiment
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveId(active.id)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-0">
              {expTree.map(exp => (
                <ExperimentNode
                  key={exp.id}
                  experiment={exp}
                  depth={0}
                  onRefresh={fetchExperiments}
                  projectId={projectId}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeExp ? (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg flex items-center gap-2 max-w-xs">
                <Icon name="drag_indicator" className="text-[16px] text-slate-300 flex-shrink-0" />
                <span className="text-sm text-slate-800 truncate flex-1">{activeExp.name}</span>
                {activeExp.status && (
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    experimentStatusConfig[activeExp.status]?.class || experimentStatusConfig.planned.class
                  }`}>
                    {experimentStatusConfig[activeExp.status]?.label || activeExp.status}
                  </span>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Root-level create modal */}
      {showCreateModal && (
        <ExperimentCreateModal
          projectId={projectId}
          parentId={null}
          onCreated={fetchExperiments}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}

// ─── Search Picker (for Literature tab) ───────────────────────────────────────

function SearchPicker({ projectId, libraryId, onLinked, existingPaperIds, existingWebsiteIds, existingRepoIds = new Set() }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const containerRef = useRef(null)
  const debounceRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleQueryChange(e) {
    const q = e.target.value
    setQuery(q)
    if (!q.trim()) { setResults([]); setOpen(false); return }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const libFilter = libraryId ? { search: q, library_id: libraryId } : { search: q }
        const [papers, websites, repos] = await Promise.all([
          papersApi.list(libFilter),
          websitesApi.list(libFilter),
          githubReposApi.list(libFilter),
        ])
        const paperResults = (Array.isArray(papers) ? papers : papers?.items || []).map(p => ({ ...p, _type: 'paper' }))
        const websiteResults = (Array.isArray(websites) ? websites : websites?.items || []).map(w => ({ ...w, _type: 'website' }))
        const repoResults = (Array.isArray(repos) ? repos : repos?.items || []).map(r => ({ ...r, _type: 'github_repo' }))
        setResults([...paperResults.slice(0, 8), ...websiteResults.slice(0, 8), ...repoResults.slice(0, 8)])
        setOpen(true)
      } catch (err) {
        console.error('Search failed:', err)
      }
    }, 300)
  }

  async function handleSelect(item) {
    if (linking) return
    const alreadyLinked = item._type === 'paper' ? existingPaperIds.has(item.id) : item._type === 'github_repo' ? existingRepoIds.has(item.id) : existingWebsiteIds.has(item.id)
    if (alreadyLinked) return
    setLinking(true)
    try {
      const data = item._type === 'paper' ? { paperId: item.id } : item._type === 'github_repo' ? { githubRepoId: item.id } : { websiteId: item.id }
      await projectPapersApi.link(projectId, data)
      onLinked()
      setQuery('')
      setResults([])
      setOpen(false)
    } catch (err) {
      console.error('Link failed:', err)
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="relative mb-4" ref={containerRef}>
      <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20">
        <Icon name="search" className="text-[18px] text-slate-400 flex-shrink-0" />
        <input
          value={query}
          onChange={handleQueryChange}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); setResults([]) } }}
          placeholder="Search papers, websites, and repos..."
          className="flex-1 text-sm text-slate-700 bg-transparent focus:outline-none"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-slate-200 rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
          {results.map(item => {
            const alreadyLinked = item._type === 'paper' ? existingPaperIds.has(item.id) : item._type === 'github_repo' ? existingRepoIds.has(item.id) : existingWebsiteIds.has(item.id)
            const title = item.title || 'Untitled'
            const authors = Array.isArray(item.authors) ? item.authors.slice(0, 2).join(', ') : ''
            const typeLabel = item._type === 'paper' ? 'Paper' : item._type === 'github_repo' ? 'GitHub' : 'Website'
            const typeClass = item._type === 'paper' ? 'bg-blue-100 text-blue-700' : item._type === 'github_repo' ? 'bg-violet-100 text-violet-700' : 'bg-purple-100 text-purple-700'
            return (
              <button
                key={`${item._type}-${item.id}`}
                onClick={() => handleSelect(item)}
                disabled={alreadyLinked || linking}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-slate-50 last:border-0 transition-colors ${
                  alreadyLinked ? 'opacity-50 cursor-default' : 'hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${typeClass}`}>
                  {typeLabel}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 truncate">{title}</div>
                  {authors && <div className="text-xs text-slate-400 truncate">{authors}</div>}
                </div>
                {alreadyLinked && <Icon name="check" className="text-[16px] text-emerald-500 flex-shrink-0 mt-0.5" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Literature Tab ────────────────────────────────────────────────────────────

function LiteratureTab({ projectId, libraryId }) {
  const [links, setLinks] = useState([])
  const [paperLookup, setPaperLookup] = useState({})
  const [websiteLookup, setWebsiteLookup] = useState({})
  const [repoLookup, setRepoLookup] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const libFilter = libraryId ? { library_id: libraryId } : {}
      const [linkRecords, papers, websites, repos] = await Promise.all([
        projectPapersApi.list(projectId),
        papersApi.list(libFilter),
        websitesApi.list(libFilter),
        githubReposApi.list(libFilter),
      ])
      const pLookup = {}
      const wLookup = {}
      const rLookup = {}
      const paperList = Array.isArray(papers) ? papers : papers?.items || []
      const websiteList = Array.isArray(websites) ? websites : websites?.items || []
      const repoList = Array.isArray(repos) ? repos : repos?.items || []
      paperList.forEach(p => { pLookup[p.id] = p })
      websiteList.forEach(w => { wLookup[w.id] = w })
      repoList.forEach(r => { rLookup[r.id] = r })
      setPaperLookup(pLookup)
      setWebsiteLookup(wLookup)
      setRepoLookup(rLookup)
      setLinks(Array.isArray(linkRecords) ? linkRecords : [])
    } catch (err) {
      console.error('Failed to fetch literature:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId, libraryId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function handleUnlink(linkId) {
    try {
      await projectPapersApi.unlink(projectId, linkId)
      setLinks(prev => prev.filter(l => l.id !== linkId))
    } catch (err) {
      console.error('Failed to unlink:', err)
    }
  }

  const existingPaperIds = useMemo(() => new Set(links.filter(l => l.paperId).map(l => l.paperId)), [links])
  const existingWebsiteIds = useMemo(() => new Set(links.filter(l => l.websiteId).map(l => l.websiteId)), [links])
  const existingRepoIds = useMemo(() => new Set(links.filter(l => l.githubRepoId).map(l => l.githubRepoId)), [links])

  function formatDate(iso) {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      const now = new Date()
      const diff = now - d
      if (diff < 60000) return 'just now'
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
      if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
      return d.toLocaleDateString()
    } catch {
      return '—'
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-3 animate-pulse">
        <div className="h-10 bg-slate-100 rounded-lg" />
        <div className="h-12 bg-slate-100 rounded-lg" />
        <div className="h-12 bg-slate-100 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Literature</h2>

      <SearchPicker
        projectId={projectId}
        libraryId={libraryId}
        onLinked={fetchAll}
        existingPaperIds={existingPaperIds}
        existingWebsiteIds={existingWebsiteIds}
        existingRepoIds={existingRepoIds}
      />

      {links.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
          <Icon name="menu_book" className="text-slate-300 text-[36px] mb-2" />
          <p className="text-sm text-slate-400">No literature linked yet. Use the search above to add supporting papers and websites.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5">Title</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 w-24">Type</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 w-28">Added</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {links.map(link => {
                const isPaper = !!link.paperId
                const isRepo = !!link.githubRepoId
                const item = isPaper ? paperLookup[link.paperId] : isRepo ? repoLookup[link.githubRepoId] : websiteLookup[link.websiteId]
                const title = item?.title || link.paperId || link.websiteId || link.githubRepoId || 'Unknown'
                const typeLabel = isPaper ? 'Paper' : isRepo ? 'GitHub' : 'Website'
                const typeClass = isPaper ? 'bg-blue-100 text-blue-700' : isRepo ? 'bg-violet-100 text-violet-700' : 'bg-purple-100 text-purple-700'
                return (
                  <tr key={link.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-800 line-clamp-1">{title}</span>
                      {item?.authors && Array.isArray(item.authors) && item.authors.length > 0 && (
                        <span className="text-xs text-slate-400 block truncate">
                          {item.authors.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeClass}`}>
                        {typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(link.createdAt)}</td>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => handleUnlink(link.id)}
                        title="Unlink"
                        className="text-slate-300 hover:text-red-400 transition-colors p-1 rounded"
                      >
                        <Icon name="link_off" className="text-[16px]" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Left panel nav ───────────────────────────────────────────────────────────

function LeftNav({ projectName, activeTab, onTabChange }) {
  const navItems = [
    { id: 'overview',     icon: 'info',      label: 'Overview' },
    { id: 'literature',   icon: 'menu_book', label: 'Literature' },
    { id: 'experiments',  icon: 'science',   label: 'Experiments' },
    { id: 'notes',        icon: 'edit_note', label: 'Notes' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Project name at top */}
      <div className="px-3 py-3 border-b border-slate-200">
        <p className="text-xs font-semibold text-slate-700 truncate" title={projectName}>
          {projectName || 'Loading...'}
        </p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              activeTab === item.id
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Icon name={item.icon} className="text-[16px] flex-shrink-0" />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ project, onUpdate }) {
  async function handleFieldSave(field, value) {
    try {
      const updated = await projectsApi.update(project.id, { [field]: value })
      onUpdate(updated)
    } catch (err) {
      console.error('Failed to update project:', err)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="space-y-3 mb-8">
        <div className="flex items-center gap-3">
          <EditableName
            value={project.name}
            onSave={v => handleFieldSave('name', v)}
          />
        </div>
        <StatusDropdown
          status={project.status}
          onSave={v => handleFieldSave('status', v)}
        />
        <EditableDescription
          value={project.description}
          onSave={v => handleFieldSave('description', v)}
        />
      </div>

      {/* Research Questions */}
      <RQSection projectId={project.id} libraryId={project.libraryId} />
    </div>
  )
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-1 min-h-0">
      {/* Left panel */}
      <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-white animate-pulse">
        <div className="px-3 py-3 border-b border-slate-200">
          <div className="h-4 bg-slate-200 rounded w-3/4" />
        </div>
        <div className="p-2 space-y-1">
          {[1, 2].map(i => (
            <div key={i} className="h-8 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
      {/* Right panel */}
      <div className="flex-1 p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/2" />
        <div className="h-5 bg-slate-100 rounded w-1/4" />
        <div className="h-4 bg-slate-100 rounded w-full" />
        <div className="h-4 bg-slate-100 rounded w-3/4" />
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      projectsApi.get(id),
      notesApi.listForProject(id),
    ])
      .then(([proj, noteList]) => {
        setProject(proj)
        setNotes(noteList)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
        <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
          <div className="h-4 bg-slate-200 rounded w-24 animate-pulse" />
        </div>
        <LoadingSkeleton />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-50">
        <Icon name="error" className="text-red-400 text-[48px]" />
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-1">Failed to load project</p>
          <p className="text-sm text-slate-500 mb-4">{error || 'Project not found'}</p>
          <Link to="/projects" className="text-sm text-blue-600 hover:underline">
            Back to Projects
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Icon name="arrow_back" className="text-[16px]" />
          Projects
        </button>
        <Icon name="chevron_right" className="text-[16px] text-slate-400" />
        <span className="text-sm text-slate-700 truncate font-medium">{project.name}</span>
      </div>

      {/* Body: split panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
          <LeftNav
            projectName={project.name}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>

        {/* Right panel */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-white">
          {activeTab === 'overview' && (
            <OverviewTab
              project={project}
              onUpdate={updated => setProject(updated)}
            />
          )}
          {activeTab === 'literature' && (
            <LiteratureTab projectId={project.id} libraryId={project.libraryId} />
          )}
          {activeTab === 'experiments' && (
            <ExperimentSection projectId={project.id} />
          )}
          {activeTab === 'notes' && (
            <NotesPanel
              notes={notes}
              setNotes={setNotes}
              createFn={(data) => notesApi.createForProject(id, data)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
