import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { projectsApi, notesApi, researchQuestionsApi, projectPapersApi, papersApi, websitesApi, githubReposApi, experimentsApi } from '../services/api'
import GapAnalysisTab from '../components/GapAnalysisTab'
import NotesPanel from '../components/NotesPanel'
import WindowModal from '../components/WindowModal'
import { statusConfig } from '../components/PaperInfoPanel'
import CSVImportModal from './CSVImportModal'
import { PaperDetail, WebsiteDetail, GitHubRepoDetail } from './Library'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { detectType } from '../utils/detectType'
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
  horizontalListSortingStrategy,
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

// Recursively walk all descendants (leaves only) to collect status counts and metric ranges
function aggregateDescendants(node) {
  const counts = { planned: 0, running: 0, completed: 0, failed: 0 }
  const metricAccum = {}  // key -> { min, max }

  function walk(n) {
    if (!n.children || n.children.length === 0) {
      // Leaf node — count status
      if (n.status) counts[n.status] = (counts[n.status] || 0) + 1
      // Accumulate numeric metrics
      Object.entries(n.metrics || {}).forEach(([k, v]) => {
        if (typeof v === 'number') {
          if (!metricAccum[k]) metricAccum[k] = { min: v, max: v }
          else {
            metricAccum[k].min = Math.min(metricAccum[k].min, v)
            metricAccum[k].max = Math.max(metricAccum[k].max, v)
          }
        }
      })
    } else {
      n.children.forEach(walk)
    }
  }

  node.children.forEach(walk)
  return { counts, metricAccum }
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

function ExperimentCreateModal({ projectId, parentId, onCreated, onClose, initialName = '', initialConfig = {} }) {
  const [name, setName] = useState(initialName)
  const [status, setStatus] = useState('planned')
  const [configRows, setConfigRows] = useState(
    Object.entries(initialConfig).map(([k, v]) => ({ key: k, value: String(v) }))
  )
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
            {initialName ? 'Duplicate Experiment' : parentId ? 'Add Sub-Experiment' : 'New Experiment'}
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

function ExperimentNode({ experiment, depth, onRefresh, projectId, libraryId, isDragOverlay = false, expPapersMap, onExpPapersChange, rqList = [], parentId = null, selectedLeafIds = new Set(), onToggle, expandCollapseKey = null }) {
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (expandCollapseKey) setExpanded(expandCollapseKey.expand)
  }, [expandCollapseKey])
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(experiment.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [expNotes, setExpNotes] = useState([])
  const [showLinkPicker, setShowLinkPicker] = useState(false)
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

  // Fetch notes when notes panel is opened
  useEffect(() => {
    if (!notesOpen) return
    notesApi.listForExperiment(experiment.id)
      .then(data => setExpNotes(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to fetch experiment notes:', err))
  }, [notesOpen, experiment.id])

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

  function handleDuplicate() {
    // Leaf: open pre-filled create modal so user can tweak before saving
    setMenuOpen(false)
    setShowDuplicateModal(true)
  }

  async function handleDuplicateDeep() {
    // Parent with children: deep-clone entire subtree directly via API
    setMenuOpen(false)
    setDuplicating(true)
    try {
      await experimentsApi.duplicate(experiment.id, { deep: true })
      onRefresh()
    } catch (err) {
      console.error('Failed to duplicate experiment with children:', err)
    } finally {
      setDuplicating(false)
    }
  }

  async function handleExpLink(data) {
    await experimentsApi.linkPaper(experiment.id, data)
    try {
      const updated = await experimentsApi.listPapers(experiment.id)
      if (onExpPapersChange) onExpPapersChange(experiment.id, updated)
    } catch (err) {
      console.error('Failed to refresh experiment papers:', err)
    }
    setShowLinkPicker(false)
  }

  async function handleExpUnlink(linkId) {
    try {
      await experimentsApi.unlinkPaper(experiment.id, linkId)
      const updated = await experimentsApi.listPapers(experiment.id)
      if (onExpPapersChange) onExpPapersChange(experiment.id, updated)
    } catch (err) {
      console.error('Failed to unlink from experiment:', err)
    }
  }

  const hasChildren = experiment.children && experiment.children.length > 0
  const isLeaf = !hasChildren

  // Parent aggregation: computed when node has children
  const aggregated = hasChildren ? aggregateDescendants(experiment) : null

  // Experiment linked papers from map
  const expPapers = expPapersMap?.get(experiment.id) || []
  const existingPaperIds = useMemo(() => new Set(expPapers.filter(p => p.paperId).map(p => p.paperId)), [expPapers])
  const existingWebsiteIds = useMemo(() => new Set(expPapers.filter(p => p.websiteId).map(p => p.websiteId)), [expPapers])

  // RQ badge: find the RQ this experiment is linked to
  const linkedRq = rqList.find(rq => rq.id === experiment.rqId)

  // Status pill colors for aggregation display
  const statusPillConfig = {
    planned:   'bg-blue-100 text-blue-700',
    running:   'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed:    'bg-red-100 text-red-700',
  }

  const sortableStyle = isDragOverlay ? {} : {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // Checkbox state computation — any node (leaf or parent) can be individually selected
  const isSelected = selectedLeafIds.has(experiment.id)
  const anySelected = selectedLeafIds.size > 0

  const checkboxIconName = isSelected ? 'check_box' : 'check_box_outline_blank'
  const checkboxColorClass = isSelected ? 'text-blue-600' : 'text-slate-400'
  const checkboxVisibility = 'opacity-100'

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

        {/* Checkbox */}
        {onToggle && (
          <button
            onClick={e => { e.stopPropagation(); onToggle(experiment) }}
            className={`flex-shrink-0 mt-0.5 transition-opacity ${checkboxVisibility} ${checkboxColorClass}`}
            title={isSelected ? 'Deselect' : 'Select for comparison'}
          >
            <span className="material-symbols-outlined text-[16px]">{checkboxIconName}</span>
          </button>
        )}

        {/* Expand/collapse chevron */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
        >
          <Icon
            name={hasChildren ? (expanded ? 'expand_more' : 'chevron_right') : (expanded ? 'remove' : 'add')}
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

            {/* RQ link badge */}
            {linkedRq && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0 truncate max-w-[120px]"
                title={`RQ: ${linkedRq.question}`}
              >
                RQ: {linkedRq.question.length > 20 ? linkedRq.question.slice(0, 20) + '…' : linkedRq.question}
              </span>
            )}
          </div>

          {/* Parent aggregation summary (only when node has children) */}
          {hasChildren && aggregated && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {/* Status count pills */}
              {Object.entries(aggregated.counts)
                .filter(([, count]) => count > 0)
                .map(([status, count]) => (
                  <span
                    key={status}
                    className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusPillConfig[status] || 'bg-slate-100 text-slate-600'}`}
                    title={`${count} ${status}`}
                  >
                    {count} {experimentStatusConfig[status]?.label || status}
                  </span>
                ))
              }
              {/* Metric range chips (top 3 alphabetically) */}
              {Object.keys(aggregated.metricAccum).length > 0 && (
                <span className="text-[10px] text-slate-400 flex-shrink-0">
                  {Object.entries(aggregated.metricAccum)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .slice(0, 3)
                    .map(([key, { min, max }]) => {
                      const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(2)
                      return min === max ? `${key}: ${fmt(min)}` : `${key}: ${fmt(min)}-${fmt(max)}`
                    })
                    .join(' | ')
                  }
                </span>
              )}
            </div>
          )}

          {/* Expanded: config, metrics, linked papers, children */}
          {expanded && (
            <div className="mt-1.5 space-y-1">
              {/* Config & Metrics side by side */}
              <div className="grid grid-cols-2 gap-2">
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
              </div>

              {/* Linked papers list */}
              {expPapers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {expPapers.map(link => {
                    const label = link.paperTitle || link.websiteTitle || link.paperId || link.websiteId || 'Unknown'
                    const isWebsite = !!link.websiteId
                    return (
                      <span
                        key={link.id}
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border flex-shrink-0 ${isWebsite ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}
                        title={label}
                      >
                        <span className="truncate max-w-[140px]">{label}</span>
                        <button
                          onClick={() => handleExpUnlink(link.id)}
                          className={`flex-shrink-0 ml-0.5 ${isWebsite ? 'text-purple-400 hover:text-purple-700' : 'text-blue-400 hover:text-blue-700'}`}
                        >
                          <Icon name="close" className="text-[11px]" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Link paper picker */}
              <div>
                {showLinkPicker ? (
                  <div className="flex items-center gap-2">
                    <MiniSearchPicker
                      onLink={handleExpLink}
                      existingPaperIds={existingPaperIds}
                      existingWebsiteIds={existingWebsiteIds}
                      libraryId={libraryId}
                    />
                    <button
                      onClick={() => setShowLinkPicker(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 flex-shrink-0"
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
                <div className="space-y-0 mt-1">
                  {experiment.children.map(child => (
                    <ExperimentNode
                      key={child.id}
                      experiment={child}
                      depth={0}
                      onRefresh={onRefresh}
                      projectId={projectId}
                      libraryId={libraryId}
                      expPapersMap={expPapersMap}
                      onExpPapersChange={onExpPapersChange}
                      rqList={rqList}
                      parentId={experiment.id}
                      selectedLeafIds={selectedLeafIds}
                      onToggle={onToggle}
                      expandCollapseKey={expandCollapseKey}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Experiment notes panel (expandable inline) */}
          {notesOpen && (
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
              <NotesPanel
                notes={expNotes}
                setNotes={setExpNotes}
                createFn={(data) => notesApi.createForExperiment(experiment.id, data)}
              />
            </div>
          )}
        </div>

        {/* Action buttons: notes toggle + three-dot menu */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Notes toggle button */}
          <button
            onClick={e => { e.stopPropagation(); setNotesOpen(o => !o) }}
            className={`transition-colors p-0.5 rounded ${notesOpen ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="Toggle notes"
          >
            <Icon name="edit_note" className="text-[16px]" />
          </button>

          {/* Three-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(m => !m) }}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded"
            >
              <Icon name="more_vert" className="text-[16px]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px]">
                <button
                  onClick={() => { setMenuOpen(false); setShowCreateModal(true) }}
                  className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                >
                  <Icon name="add" className="text-[14px] text-slate-400" />
                  Add sub-experiment
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={() => { setMenuOpen(false); handleDuplicate() }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded"
                >
                  <span className="material-symbols-outlined text-[14px] text-slate-400">content_copy</span>
                  Duplicate
                </button>
                {hasChildren && (
                  <button
                    onClick={handleDuplicateDeep}
                    disabled={duplicating}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px] text-slate-400">account_tree</span>
                    {duplicating ? 'Duplicating...' : 'Duplicate with children'}
                  </button>
                )}
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

      {/* Duplicate modal (pre-filled, creates a sibling) */}
      {showDuplicateModal && (
        <ExperimentCreateModal
          projectId={projectId}
          parentId={parentId}
          initialName={experiment.name + ' (copy)'}
          initialConfig={experiment.config || {}}
          onCreated={onRefresh}
          onClose={() => setShowDuplicateModal(false)}
        />
      )}
    </div>
  )
}

// ─── Compare Modal helpers ─────────────────────────────────────────────────────

function collectLeafIds(node) {
  if (!node.children || node.children.length === 0) return [node.id]
  return node.children.flatMap(collectLeafIds)
}

// Build a map of experiment id → parent experiment id from the flat tree
function buildParentMap(flatTree) {
  const map = {}
  for (const node of flatTree) {
    map[node.id] = node._parentId || null
  }
  return map
}

// Compute effective config by walking up the ancestry chain
// Child config overrides parent config (child values take precedence)
function getEffectiveConfig(expId, flatTree, parentMap) {
  const chain = []
  let currentId = expId
  const byId = Object.fromEntries(flatTree.map(e => [e.id, e]))
  while (currentId) {
    const node = byId[currentId]
    if (node) chain.unshift(node.config || {})
    currentId = parentMap[currentId] || null
  }
  // Merge from root down — later entries (children) override earlier (parents)
  return Object.assign({}, ...chain)
}

function unionKeys(objects) {
  const keySet = new Set()
  for (const obj of objects) {
    for (const k of Object.keys(obj ?? {})) {
      keySet.add(k)
    }
  }
  return Array.from(keySet).sort()
}

// ─── Table view helpers (exported for tests) ──────────────────────────────────

function buildColumns(flatTree) {
  const fixedColumns = [
    { id: 'type_icon', label: '', type: 'fixed', field: 'type_icon', width: 40, sortable: false },
    { id: 'name', label: 'Name', type: 'fixed', field: 'name', width: 220, sortable: true },
    { id: 'status', label: 'Status', type: 'fixed', field: 'status', width: 110, sortable: true },
    { id: 'parent', label: 'Group', type: 'fixed', field: 'parent', width: 140, sortable: true },
  ]
  const configKeys = unionKeys(flatTree.map(e => e.config || {}))
  const metricKeys = unionKeys(flatTree.map(e => e.metrics || {}))
  const configColumns = configKeys.map(key => ({
    id: `config::${key}`,
    label: key,
    type: 'config',
    field: 'config',
    key,
    width: 120,
    sortable: true,
  }))
  const metricColumns = metricKeys.map(key => ({
    id: `metric::${key}`,
    label: key,
    type: 'metric',
    field: 'metrics',
    key,
    width: 120,
    sortable: true,
  }))
  return [...fixedColumns, ...configColumns, ...metricColumns]
}

function getCellValue(columnId, exp, parentMap) {
  if (columnId === 'name') return exp.name ?? null
  if (columnId === 'status') return exp.status ?? null
  if (columnId === 'created_at') return exp.created_at ?? null
  if (columnId === 'type_icon') return exp.children?.length > 0 ? 'folder' : 'science'
  if (columnId === 'parent') {
    if (!parentMap) return exp._parentId ?? null
    if (parentMap instanceof Map) return parentMap.get(exp._parentId) ?? null
    return exp._parentId ?? null
  }
  if (columnId.startsWith('config::')) {
    const key = columnId.slice('config::'.length)
    return exp.config?.[key] ?? null
  }
  if (columnId.startsWith('metric::')) {
    const key = columnId.slice('metric::'.length)
    return exp.metrics?.[key] ?? null
  }
  return null
}

function applyFilter(exp, filter) {
  const { column: columnId, operator, value } = filter
  let cellVal
  if (columnId === 'name') cellVal = exp.name
  else if (columnId === 'status') cellVal = exp.status
  else if (columnId === 'parent') cellVal = exp._parentId ?? exp.parent_id
  else if (columnId === 'created_at') cellVal = exp.created_at
  else if (columnId.startsWith('config::')) {
    const key = columnId.slice('config::'.length)
    cellVal = exp.config?.[key]
  } else if (columnId.startsWith('metric::')) {
    const key = columnId.slice('metric::'.length)
    cellVal = exp.metrics?.[key]
  }

  if (operator === 'empty') return cellVal === undefined || cellVal === null || cellVal === ''
  if (operator === 'notempty') return cellVal !== undefined && cellVal !== null && cellVal !== ''

  const numericCell = typeof cellVal === 'number' ? cellVal : Number(cellVal)

  if (operator === 'eq') return String(cellVal) === String(value)
  if (operator === 'neq') return String(cellVal) !== String(value)
  if (operator === 'gt') return numericCell > Number(value)
  if (operator === 'lt') return numericCell < Number(value)
  if (operator === 'between') {
    const [low, high] = Array.isArray(value) ? value : [value[0], value[1]]
    return numericCell >= Number(low) && numericCell <= Number(high)
  }
  if (operator === 'is') return Array.isArray(value) && value.includes(cellVal)
  if (operator === 'isnot') return Array.isArray(value) && !value.includes(cellVal)
  if (operator === 'contains') return String(cellVal ?? '').includes(String(value))

  return true
}

function sortRows(rows, sort) {
  if (!sort) return rows
  const { columnId, direction } = sort
  const sorted = [...rows]
  sorted.sort((a, b) => {
    const aVal = getCellValue(columnId, a, null)
    const bVal = getCellValue(columnId, b, null)
    // Nulls sort last regardless of direction
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    // Numeric comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal
    }
    // String comparison
    const cmp = String(aVal).localeCompare(String(bVal))
    return direction === 'asc' ? cmp : -cmp
  })
  return sorted
}

export { buildColumns, applyFilter, sortRows, getCellValue }

function metricCellClass(key, value, bestValue, highlightBest) {
  if (!highlightBest || typeof value !== 'number' || bestValue === null || bestValue === undefined) return ''
  return value === bestValue ? 'font-bold text-emerald-700 bg-emerald-50' : ''
}

function configCellClass(key, expValue, allValues) {
  if (expValue === undefined || expValue === null) return 'text-slate-300 italic'
  const definedVals = allValues.filter(v => v !== undefined && v !== null)
  const allSame = definedVals.length > 0 && definedVals.every(v => String(v) === String(definedVals[0]))
  if (allSame) return ''
  const presentCount = definedVals.length
  if (presentCount < allValues.length) return 'bg-emerald-50 text-emerald-800'
  return 'bg-amber-50 text-amber-800'
}

function getBestValue(key, experiments, lowerIsBetter) {
  const values = experiments.map(e => e.metrics?.[key]).filter(v => typeof v === 'number')
  if (values.length === 0) return null
  return lowerIsBetter[key] ? Math.min(...values) : Math.max(...values)
}

// ─── CompareModal ──────────────────────────────────────────────────────────────

function CompareModal({ experiments, open, onClose, flatTree }) {
  const [activeTab, setActiveTab] = useState('metrics')
  const [highlightBest, setHighlightBest] = useState(true)
  const [lowerIsBetter, setLowerIsBetter] = useState({})
  const [changedOnly, setChangedOnly] = useState(false)

  // Compute effective configs (inheriting parent config values)
  const parentMap = useMemo(() => buildParentMap(flatTree || []), [flatTree])
  const effectiveConfigs = useMemo(() => {
    const map = {}
    for (const exp of experiments) {
      map[exp.id] = flatTree ? getEffectiveConfig(exp.id, flatTree, parentMap) : (exp.config || {})
    }
    return map
  }, [experiments, flatTree, parentMap])

  const metricKeys = useMemo(
    () => unionKeys(experiments.map(e => e.metrics || {})),
    [experiments]
  )
  const configKeys = useMemo(
    () => unionKeys(experiments.map(e => effectiveConfigs[e.id] || {})),
    [experiments, effectiveConfigs]
  )

  const visibleConfigKeys = useMemo(() => {
    if (!changedOnly) return configKeys
    return configKeys.filter(key => {
      const vals = experiments.map(e => effectiveConfigs[e.id]?.[key])
      const definedVals = vals.filter(v => v !== undefined && v !== null)
      if (definedVals.length !== vals.length) return true // some missing = changed
      return !definedVals.every(v => String(v) === String(definedVals[0]))
    })
  }, [configKeys, experiments, effectiveConfigs, changedOnly])

  function toggleLowerIsBetter(key) {
    setLowerIsBetter(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <WindowModal
      open={open}
      onClose={onClose}
      title={`Compare ${experiments.length} Experiments`}
      iconName="compare_arrows"
      iconWrapClassName="bg-blue-100"
      iconClassName="text-[16px] text-blue-600"
      normalPanelClassName="w-full max-w-4xl rounded-2xl"
      fullscreenPanelClassName="w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] rounded-xl"
    >
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 pb-2 border-b border-slate-100">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'metrics' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
        >
          Metrics
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'config' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
        >
          Config
        </button>
      </div>

      {/* Tab content */}
      <div className="px-6 py-4 overflow-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
        {activeTab === 'metrics' && (
          <>
            {/* Controls */}
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={highlightBest}
                  onChange={e => setHighlightBest(e.target.checked)}
                  className="rounded"
                />
                Highlight best
              </label>
            </div>

            {metricKeys.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No metrics recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left px-3 py-2 text-slate-500 font-medium sticky left-0 bg-white" style={{ minWidth: 160 }}>
                        Metric
                      </th>
                      {experiments.map(exp => (
                        <th key={exp.id} className="text-left px-3 py-2 text-slate-700 font-medium" style={{ minWidth: 120 }}>
                          <div className="truncate max-w-[140px]" title={exp.name}>{exp.name}</div>
                          {exp.status && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${experimentStatusConfig[exp.status]?.class || 'bg-slate-100 text-slate-600'}`}>
                              {experimentStatusConfig[exp.status]?.label || exp.status}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metricKeys.map(key => {
                      const bestValue = highlightBest ? getBestValue(key, experiments, lowerIsBetter) : null
                      return (
                        <tr key={key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-600 sticky left-0 bg-white" style={{ minWidth: 160 }}>
                            <div className="flex items-center gap-1">
                              <span className="truncate">{key}</span>
                              <button
                                onClick={() => toggleLowerIsBetter(key)}
                                className="flex-shrink-0 text-slate-400 hover:text-blue-600 transition-colors"
                                title={lowerIsBetter[key] ? 'Lower is better (click to toggle)' : 'Higher is better (click to toggle)'}
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  {lowerIsBetter[key] ? 'arrow_downward' : 'arrow_upward'}
                                </span>
                              </button>
                            </div>
                          </td>
                          {experiments.map(exp => {
                            const value = exp.metrics?.[key]
                            const cls = metricCellClass(key, value, bestValue, highlightBest)
                            return (
                              <td key={exp.id} className={`px-3 py-2 ${cls}`} style={{ minWidth: 120 }}>
                                {value !== undefined && value !== null
                                  ? String(value)
                                  : <span className="text-slate-300 italic">---</span>
                                }
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === 'config' && (
          <>
            {/* Controls */}
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={changedOnly}
                  onChange={e => setChangedOnly(e.target.checked)}
                  className="rounded"
                />
                Changed only
              </label>
            </div>

            {configKeys.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No config recorded yet.</p>
            ) : visibleConfigKeys.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No changed config keys. Toggle off "Changed only" to see all.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left px-3 py-2 text-slate-500 font-medium sticky left-0 bg-white" style={{ minWidth: 160 }}>
                        Config Key
                      </th>
                      {experiments.map(exp => (
                        <th key={exp.id} className="text-left px-3 py-2 text-slate-700 font-medium" style={{ minWidth: 120 }}>
                          <div className="truncate max-w-[140px]" title={exp.name}>{exp.name}</div>
                          {exp.status && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${experimentStatusConfig[exp.status]?.class || 'bg-slate-100 text-slate-600'}`}>
                              {experimentStatusConfig[exp.status]?.label || exp.status}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleConfigKeys.map(key => {
                      const allValues = experiments.map(e => effectiveConfigs[e.id]?.[key])
                      return (
                        <tr key={key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-600 sticky left-0 bg-white" style={{ minWidth: 160 }}>
                            <span className="truncate block">{key}</span>
                          </td>
                          {experiments.map((exp, idx) => {
                            const value = effectiveConfigs[exp.id]?.[key]
                            const cls = configCellClass(key, value, allValues)
                            return (
                              <td key={exp.id} className={`px-3 py-2 ${cls}`} style={{ minWidth: 120 }}>
                                {value !== undefined && value !== null
                                  ? <span className="font-mono">{String(value)}</span>
                                  : <span className="text-slate-300 italic">---</span>
                                }
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </WindowModal>
  )
}

// ─── ColumnPicker ──────────────────────────────────────────────────────────────

function ColumnPicker({ allColumns, colState, setColState }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggleHidden(colId) {
    setColState(prev => {
      const hidden = prev.hidden.includes(colId)
        ? prev.hidden.filter(id => id !== colId)
        : [...prev.hidden, colId]
      return { ...prev, hidden }
    })
  }

  function resetColumns() {
    setColState({ order: [], hidden: [], widths: {}, customColumns: [] })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2 py-1 bg-white transition-colors"
      >
        <Icon name="view_column" className="text-[14px]" /> Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-56 max-h-64 overflow-y-auto p-2">
          {allColumns.filter(c => c.id !== 'type_icon').map(col => (
            <label key={col.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={!colState.hidden.includes(col.id)}
                onChange={() => toggleHidden(col.id)}
              />
              <span className={col.type === 'config' ? 'text-blue-600' : col.type === 'metric' ? 'text-emerald-600' : 'text-slate-700'}>
                {col.label || col.id}
              </span>
            </label>
          ))}
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              onClick={resetColumns}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 w-full text-left transition-colors"
            >
              Reset columns
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SortableColumnHeader ──────────────────────────────────────────────────────

function SortableColumnHeader({ col, sort, onSort, onResizeStart, headerBgClass, highlightBest, lowerIsBetter, onToggleLowerIsBetter, isGroupStart }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    width: col.width,
    minWidth: col.width,
    position: 'relative',
  }

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`sticky top-0 z-20 border-b border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${headerBgClass(col.type)}${isGroupStart ? ' border-l-2 border-l-slate-300' : ''}`}
      onClick={() => col.sortable && onSort(col.id)}
    >
      <div className={`flex items-center gap-1 ${col.sortable ? 'cursor-pointer select-none' : ''}`}>
        {/* Drag grip — only this triggers DnD, not the label */}
        <span
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 flex-shrink-0"
          title="Drag to reorder"
        >
          <Icon name="drag_indicator" className="text-[10px]" />
        </span>
        {col.label}
        {sort?.columnId === col.id && (
          <Icon
            name={sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
            className="text-[12px] text-blue-500"
          />
        )}
        {highlightBest && col.type === 'metric' && (
          <button
            onClick={e => { e.stopPropagation(); onToggleLowerIsBetter?.(col.key) }}
            className={`ml-0.5 text-[9px] px-1 py-0.5 rounded transition-colors leading-none ${
              lowerIsBetter?.[col.key]
                ? 'bg-emerald-200 text-emerald-700'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
            title={lowerIsBetter?.[col.key] ? 'Lower is better (click to toggle)' : 'Higher is better (click to toggle)'}
          >
            {lowerIsBetter?.[col.key] ? '↓' : '↑'}
          </button>
        )}
      </div>
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors"
        onMouseDown={e => { e.stopPropagation(); onResizeStart(e, col.id, col.width) }}
        onClick={e => e.stopPropagation()}
      />
    </th>
  )
}

// ─── EditableCell ──────────────────────────────────────────────────────────────

function EditableCell({ value, onSave, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function activate() {
    setEditing(true)
    setDraft(String(value ?? ''))
  }

  async function commit() {
    setEditing(false)
    const parsed = detectType(draft)
    if (parsed !== value) {
      try {
        await onSave(parsed)
      } catch (err) {
        console.error('EditableCell save failed:', err)
      }
    }
  }

  function cancel() {
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
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') cancel()
        }}
        className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
        onClick={e => e.stopPropagation()}
      />
    )
  }

  return (
    <span
      onDoubleClick={e => { e.stopPropagation(); activate() }}
      className={`block w-full cursor-text min-h-[1.25rem] ${className}`}
    >
      {value != null && value !== ''
        ? String(value)
        : <span className="text-slate-300 italic">--</span>
      }
    </span>
  )
}

// ─── Filter helpers ────────────────────────────────────────────────────────────

function formatFilterValue(filter) {
  if (!filter.value && filter.value !== 0) return ''
  if (['empty', 'notempty'].includes(filter.operator)) return ''
  if (Array.isArray(filter.value)) {
    if (filter.operator === 'between') {
      return `${filter.value[0] ?? ''} – ${filter.value[1] ?? ''}`
    }
    return filter.value.join(', ')
  }
  return String(filter.value)
}

// ─── FilterChip ────────────────────────────────────────────────────────────────

function FilterChip({ filter, allColumns, isEditing, onEdit, onUpdate, onRemove, onClose }) {
  const col = allColumns.find(c => c.id === filter.column)
  const ref = useRef(null)

  const isStatusFilter = filter.column === 'status'
  const isNumeric = col?.type === 'metric'

  const operators = isStatusFilter
    ? [{ id: 'is', label: 'is' }, { id: 'isnot', label: 'is not' }]
    : isNumeric
    ? [
        { id: 'eq', label: '=' }, { id: 'neq', label: '!=' },
        { id: 'gt', label: '>' }, { id: 'lt', label: '<' },
        { id: 'between', label: 'between' },
        { id: 'empty', label: 'is empty' }, { id: 'notempty', label: 'is not empty' },
      ]
    : [
        { id: 'eq', label: '=' }, { id: 'neq', label: '!=' },
        { id: 'contains', label: 'contains' },
        { id: 'empty', label: 'is empty' }, { id: 'notempty', label: 'is not empty' },
      ]

  // Close on outside click
  useEffect(() => {
    if (!isEditing) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isEditing, onClose])

  const displayValue = formatFilterValue(filter)
  const opLabel = operators.find(o => o.id === filter.operator)?.label || filter.operator

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onEdit}
        className="flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 hover:bg-slate-200 group"
      >
        <span className="text-slate-500">{col?.label || filter.column}</span>
        <span className="text-slate-400 mx-0.5">{opLabel}</span>
        {displayValue && <span className="text-slate-700 font-medium">{displayValue}</span>}
        <span
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="text-slate-300 hover:text-red-400 ml-0.5 cursor-pointer leading-none"
        >&times;</span>
      </button>
      {isEditing && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-64 p-3 space-y-2">
          <select
            value={filter.operator}
            onChange={e => {
              const newOp = e.target.value
              // Reset value when switching between compound/simple operators
              let newVal = filter.value
              if (newOp === 'between' && !Array.isArray(newVal)) newVal = [0, 0]
              if (newOp !== 'between' && Array.isArray(newVal) && !isStatusFilter) newVal = ''
              onUpdate({ operator: newOp, value: newVal })
            }}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
          >
            {operators.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          {isStatusFilter ? (
            <div className="space-y-1">
              {['planned', 'running', 'completed', 'failed'].map(s => (
                <label key={s} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(filter.value || []).includes(s)}
                    onChange={() => {
                      const cur = filter.value || []
                      const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]
                      onUpdate({ value: next })
                    }}
                  />
                  {experimentStatusConfig[s]?.label || s}
                </label>
              ))}
            </div>
          ) : filter.operator === 'between' ? (
            <div className="flex gap-2">
              <input
                type="number"
                value={filter.value?.[0] ?? ''}
                onChange={e => onUpdate({ value: [Number(e.target.value), filter.value?.[1] ?? 0] })}
                className="w-1/2 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
                placeholder="min"
              />
              <input
                type="number"
                value={filter.value?.[1] ?? ''}
                onChange={e => onUpdate({ value: [filter.value?.[0] ?? 0, Number(e.target.value)] })}
                className="w-1/2 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
                placeholder="max"
              />
            </div>
          ) : !['empty', 'notempty'].includes(filter.operator) ? (
            <input
              type={isNumeric ? 'number' : 'text'}
              value={filter.value ?? ''}
              onChange={e => onUpdate({ value: isNumeric ? Number(e.target.value) : e.target.value })}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              placeholder="Value..."
            />
          ) : null}
          <button onClick={onClose} className="text-xs text-blue-600 hover:text-blue-700">Done</button>
        </div>
      )}
    </div>
  )
}

// ─── FilterBar ─────────────────────────────────────────────────────────────────

function FilterBar({ filters, setFilters, allColumns }) {
  const [addingFilter, setAddingFilter] = useState(false)
  const [editingFilterId, setEditingFilterId] = useState(null)
  const addRef = useRef(null)

  // Close add dropdown on outside click
  useEffect(() => {
    if (!addingFilter) return
    function handleClick(e) {
      if (addRef.current && !addRef.current.contains(e.target)) setAddingFilter(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [addingFilter])

  function addFilter(colId) {
    const col = allColumns.find(c => c.id === colId)
    const defaultOp = col?.type === 'metric' ? 'gt' : colId === 'status' ? 'is' : 'eq'
    const defaultVal = colId === 'status' ? ['completed'] : ''
    const newFilter = { id: Date.now().toString(), column: colId, operator: defaultOp, value: defaultVal }
    setFilters(prev => [...prev, newFilter])
    setEditingFilterId(newFilter.id)
    setAddingFilter(false)
  }

  function updateFilter(id, updates) {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  function removeFilter(id) {
    setFilters(prev => prev.filter(f => f.id !== id))
    if (editingFilterId === id) setEditingFilterId(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map(f => (
        <FilterChip
          key={f.id}
          filter={f}
          allColumns={allColumns}
          isEditing={editingFilterId === f.id}
          onEdit={() => setEditingFilterId(f.id)}
          onUpdate={updates => updateFilter(f.id, updates)}
          onRemove={() => removeFilter(f.id)}
          onClose={() => setEditingFilterId(null)}
        />
      ))}
      <div className="relative" ref={addRef}>
        <button
          onClick={() => setAddingFilter(o => !o)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 rounded px-2 py-1"
        >
          <Icon name="add" className="text-[12px]" /> Filter
        </button>
        {addingFilter && (
          <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-48 max-h-48 overflow-y-auto p-1">
            {allColumns.filter(c => c.sortable).map(col => (
              <button
                key={col.id}
                onClick={() => addFilter(col.id)}
                className="block w-full text-left px-2 py-1 text-xs hover:bg-slate-50 rounded"
              >
                <span className={col.type === 'config' ? 'text-blue-600' : col.type === 'metric' ? 'text-emerald-600' : 'text-slate-700'}>
                  {col.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {filters.length > 0 && (
        <button
          onClick={() => setFilters([])}
          className="text-xs text-slate-400 hover:text-red-500 ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

// ─── ExperimentDetailPanel ─────────────────────────────────────────────────────

function ExperimentDetailPanel({ experiment, flatTree, onClose, onRefresh, libraryId, expPapersMap, onExpPapersChange, rqList }) {
  const [expNotes, setExpNotes] = useState([])
  const [notesOpen, setNotesOpen] = useState(false)
  const [showLinkPicker, setShowLinkPicker] = useState(false)

  const linkedPapers = expPapersMap?.get(experiment.id) || []

  useEffect(() => {
    if (!notesOpen) return
    notesApi.listForExperiment(experiment.id)
      .then(data => setExpNotes(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to fetch experiment notes:', err))
  }, [notesOpen, experiment.id])

  // Refresh notes when experiment changes
  useEffect(() => {
    setNotesOpen(false)
    setExpNotes([])
  }, [experiment.id])

  async function handleExpLink(data) {
    await experimentsApi.linkPaper(experiment.id, data)
    try {
      const updated = await experimentsApi.listPapers(experiment.id)
      onExpPapersChange?.(experiment.id, Array.isArray(updated) ? updated : [])
    } catch (err) {
      console.error('Failed to refresh experiment papers:', err)
    }
  }

  async function handleUnlink(linkId) {
    await experimentsApi.unlinkPaper(experiment.id, linkId)
    try {
      const updated = await experimentsApi.listPapers(experiment.id)
      onExpPapersChange?.(experiment.id, Array.isArray(updated) ? updated : [])
    } catch (err) {
      console.error('Failed to refresh experiment papers after unlink:', err)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            name={experiment.children?.length > 0 ? 'folder' : 'science'}
            className="text-[18px] text-slate-400 flex-shrink-0"
          />
          <h3 className="text-sm font-semibold text-slate-800 truncate">{experiment.name}</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0 ml-2">
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">Status</label>
          <ExperimentStatusDropdown
            status={experiment.status}
            onChange={async newStatus => {
              await experimentsApi.update(experiment.id, { status: newStatus })
              onRefresh()
            }}
          />
        </div>

        {/* Parent group */}
        {experiment._parentId && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">Group</label>
            <span className="text-xs text-slate-600">
              {flatTree.find(e => e.id === experiment._parentId)?.name || '—'}
            </span>
          </div>
        )}

        {/* Created date */}
        {experiment.created_at && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 block">Created</label>
            <span className="text-xs text-slate-600">
              {new Date(experiment.created_at).toLocaleDateString()}
            </span>
          </div>
        )}

        {/* Config */}
        <div>
          <KVEditor
            data={experiment.config || {}}
            label="Configuration"
            onSave={async updated => {
              await experimentsApi.update(experiment.id, { config: updated })
              await onRefresh()
            }}
          />
        </div>

        {/* Metrics */}
        <div>
          <KVEditor
            data={experiment.metrics || {}}
            label="Metrics"
            onSave={async updated => {
              await experimentsApi.update(experiment.id, { metrics: updated })
              await onRefresh()
            }}
          />
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Notes</span>
            <button
              onClick={() => setNotesOpen(o => !o)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${notesOpen ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {notesOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          {notesOpen && (
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <NotesPanel
                notes={expNotes}
                setNotes={setExpNotes}
                createFn={data => notesApi.createForExperiment(experiment.id, data)}
              />
            </div>
          )}
        </div>

        {/* Literature */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Literature</span>
            <button
              onClick={() => setShowLinkPicker(o => !o)}
              className="text-slate-400 hover:text-blue-600 transition-colors"
              title="Link paper"
            >
              <Icon name="add" className="text-[13px]" />
            </button>
          </div>
          {showLinkPicker && libraryId && (
            <MiniSearchPicker
              libraryId={libraryId}
              rqList={rqList || []}
              onLink={async data => {
                await handleExpLink(data)
                setShowLinkPicker(false)
              }}
              onClose={() => setShowLinkPicker(false)}
            />
          )}
          {linkedPapers.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No linked papers</p>
          ) : (
            <div className="space-y-1">
              {linkedPapers.map(lp => {
                const isPaper = !!lp.paper_id
                const item = isPaper ? lp.paper : lp.website
                if (!item) return null
                return (
                  <div key={lp.paper_id || lp.website_id} className="flex items-start gap-1 group/lit">
                    <Icon
                      name={isPaper ? 'description' : 'link'}
                      className="text-[13px] text-slate-300 flex-shrink-0 mt-0.5"
                    />
                    <span className="text-xs text-slate-600 flex-1 leading-snug line-clamp-2">
                      {item.title || item.url || '—'}
                    </span>
                    <button
                      onClick={() => handleUnlink(lp.id)}
                      className="opacity-0 group-hover/lit:opacity-100 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Icon name="close" className="text-[13px]" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ExperimentTableView ───────────────────────────────────────────────────────

function ExperimentTableView({ flatTree, selectedLeafIds, onToggle, fetchExperiments, projectId, libraryId, expPapersMap, onExpPapersChange, rqList, onCompare, onBulkSetStatus, onBulkDuplicate, onBulkDelete, onClearSelection }) {
  const [sort, setSort] = useState(null) // { columnId, direction }
  const [newRowName, setNewRowName] = useState('')
  const [newRowError, setNewRowError] = useState(false)

  // Measure available height from container top to viewport bottom
  const containerRef = useRef(null)
  const [availableHeight, setAvailableHeight] = useState(null)
  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setAvailableHeight(window.innerHeight - rect.top)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Filter state persisted to localStorage per project
  const [filters, setFilters] = useLocalStorage(`researchos.exp.table.filters.${projectId}`, [])

  // Detail panel state
  const [detailExpId, setDetailExpId] = useState(null)

  // Best-metric highlight state
  const [highlightBest, setHighlightBest] = useState(false)
  const [lowerIsBetter, setLowerIsBetter] = useState({}) // { [metricKey]: boolean }

  // Effective config per experiment (inherits parent config values)
  const effectiveConfigMap = useMemo(() => {
    const pm = buildParentMap(flatTree)
    const map = {}
    for (const exp of flatTree) {
      map[exp.id] = getEffectiveConfig(exp.id, flatTree, pm)
    }
    return map
  }, [flatTree])

  // Column state persisted to localStorage per project
  const [colState, setColState] = useLocalStorage(
    `researchos.exp.table.cols.${projectId}`,
    { order: [], hidden: [], widths: {}, customColumns: [] }
  )

  // Add-column popover state
  const [addColOpen, setAddColOpen] = useState(false)
  const [addColType, setAddColType] = useState(null) // 'config' | 'metric'
  const [addColKey, setAddColKey] = useState('')
  const addColRef = useRef(null)

  // DnD sensors for column reordering (separate from tree DnD)
  const colDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Close add-column popover on outside click
  useEffect(() => {
    if (!addColOpen) return
    function handleClick(e) {
      if (addColRef.current && !addColRef.current.contains(e.target)) {
        setAddColOpen(false)
        setAddColType(null)
        setAddColKey('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [addColOpen])

  const allDataColumns = useMemo(() => buildColumns(flatTree), [flatTree])

  // Merge custom columns from colState into allColumns
  const allColumns = useMemo(() => {
    const dataColIds = new Set(allDataColumns.map(c => c.id))
    const extras = (colState.customColumns || []).filter(c => !dataColIds.has(c.id))
    return [...allDataColumns, ...extras]
  }, [allDataColumns, colState.customColumns])

  // Drop stale filters (columns that no longer exist)
  useEffect(() => {
    const validColIds = new Set(allColumns.map(c => c.id))
    setFilters(prev => {
      const valid = prev.filter(f => validColIds.has(f.column))
      return valid.length === prev.length ? prev : valid
    })
  }, [allColumns]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive visible columns applying hidden, order, widths
  const visibleColumns = useMemo(() => {
    const hidden = new Set(colState.hidden)
    let cols = allColumns.filter(c => !hidden.has(c.id))
    if (colState.order.length > 0) {
      const orderMap = Object.fromEntries(colState.order.map((id, i) => [id, i]))
      const fixedFirst = cols.filter(c => c.id === 'type_icon' || c.id === 'name')
      const reorderable = cols.filter(c => c.id !== 'type_icon' && c.id !== 'name')
      reorderable.sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999))
      cols = [...fixedFirst, ...reorderable]
    }
    return cols.map(c => ({ ...c, width: colState.widths[c.id] || c.width }))
  }, [allColumns, colState])

  // Reorderable columns (exclude fixed type_icon and name columns)
  const fixedIdSet = new Set(['type_icon', 'name', 'status', 'parent'])
  const reorderableColIds = useMemo(
    () => visibleColumns.filter(c => !fixedIdSet.has(c.id)).map(c => c.id),
    [visibleColumns]
  )

  // Build a map of parentId -> parent name for the Group column
  const parentNameMap = useMemo(() => {
    const map = new Map()
    const byId = Object.fromEntries(flatTree.map(e => [e.id, e]))
    for (const exp of flatTree) {
      if (exp._parentId && byId[exp._parentId]) {
        map.set(exp._parentId, byId[exp._parentId].name)
      }
    }
    return map
  }, [flatTree])

  function handleSort(colId) {
    setSort(prev => {
      if (!prev || prev.columnId !== colId) return { columnId: colId, direction: 'asc' }
      if (prev.direction === 'asc') return { columnId: colId, direction: 'desc' }
      return null
    })
  }

  // Column resize
  function handleResizeStart(e, colId, startWidth) {
    e.preventDefault()
    const startX = e.clientX

    function onMouseMove(moveEvent) {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(60, startWidth + delta)
      setColState(prev => ({
        ...prev,
        widths: { ...prev.widths, [colId]: newWidth },
      }))
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // Column DnD reorder
  function handleColDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = reorderableColIds.indexOf(active.id)
    const newIndex = reorderableColIds.indexOf(over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Enforce group boundaries: configs stay with configs, metrics with metrics
    const draggedCol = reorderableCols.find(c => c.id === active.id)
    const targetCol = reorderableCols.find(c => c.id === over.id)
    if (draggedCol && targetCol && draggedCol.type !== 'fixed' && targetCol.type !== 'fixed' && draggedCol.type !== targetCol.type) {
      // Dragged across group boundary — clamp to the edge of its own group
      const sameGroupIds = reorderableColIds.filter(id => {
        const c = reorderableCols.find(col => col.id === id)
        return c && c.type === draggedCol.type
      })
      const clampIndex = newIndex < oldIndex
        ? reorderableColIds.indexOf(sameGroupIds[0])  // moving left → first in group
        : reorderableColIds.indexOf(sameGroupIds[sameGroupIds.length - 1]) // moving right → last in group
      if (clampIndex === oldIndex) return // already at edge
      const newOrder = arrayMove(reorderableColIds, oldIndex, clampIndex)
      setColState(prev => ({ ...prev, order: newOrder }))
      return
    }

    const newOrder = arrayMove(reorderableColIds, oldIndex, newIndex)
    setColState(prev => ({ ...prev, order: newOrder }))
  }

  // Add new column
  function handleAddColSubmit() {
    const key = addColKey.trim()
    if (!key || !addColType) return
    const id = `${addColType}::${key}`
    const newCol = {
      id,
      label: key,
      type: addColType,
      field: addColType === 'config' ? 'config' : 'metrics',
      key,
      width: 120,
      sortable: true,
    }
    setColState(prev => ({
      ...prev,
      customColumns: [...(prev.customColumns || []).filter(c => c.id !== id), newCol],
    }))
    setAddColOpen(false)
    setAddColType(null)
    setAddColKey('')
  }

  const filteredRows = useMemo(() => {
    const sorted = sortRows(flatTree, sort)
    if (filters.length === 0) return sorted
    return sorted.filter(exp => filters.every(f => applyFilter(exp, f)))
  }, [flatTree, sort, filters])

  // Derive detail experiment from flatTree (keeps up-to-date after refresh)
  const detailExp = detailExpId ? flatTree.find(e => e.id === detailExpId) : null

  function headerBgClass(colType) {
    return 'bg-slate-50'
  }

  function renderCellValue(col, exp) {
    if (col.id === 'type_icon') {
      const isGroup = exp.children && exp.children.length > 0
      return <Icon name={isGroup ? 'folder' : 'science'} className="text-[16px] text-slate-400" />
    }
    if (col.id === 'name') {
      return (
        <EditableCell
          value={exp.name}
          onSave={async v => {
            if (v && String(v).trim()) {
              await experimentsApi.update(exp.id, { name: String(v).trim() })
              await fetchExperiments()
            }
          }}
        />
      )
    }
    if (col.id === 'status') {
      return (
        <ExperimentStatusDropdown
          status={exp.status}
          onChange={async newStatus => {
            await experimentsApi.update(exp.id, { status: newStatus })
            await fetchExperiments()
          }}
        />
      )
    }
    if (col.id === 'parent') {
      const parentName = exp._parentId ? (parentNameMap.get(exp._parentId) ?? '—') : '—'
      return <span className="text-slate-500">{parentName}</span>
    }
    if (col.id === 'created_at') {
      if (!exp.created_at) return '—'
      try {
        return new Date(exp.created_at).toLocaleDateString()
      } catch {
        return '—'
      }
    }
    if (col.type === 'config') {
      const effectiveVal = effectiveConfigMap[exp.id]?.[col.key]
      const isInherited = exp.config?.[col.key] === undefined && effectiveVal !== undefined
      return (
        <EditableCell
          value={effectiveVal}
          className={isInherited ? 'text-slate-400 italic' : ''}
          onSave={async v => {
            await experimentsApi.update(exp.id, { config: { ...(exp.config || {}), [col.key]: v } })
            await fetchExperiments()
          }}
        />
      )
    }
    if (col.type === 'metric') {
      return (
        <EditableCell
          value={exp.metrics?.[col.key]}
          onSave={async v => {
            await experimentsApi.update(exp.id, { metrics: { ...(exp.metrics || {}), [col.key]: v } })
            await fetchExperiments()
          }}
        />
      )
    }
    return '—'
  }

  // Select-all logic
  const allSelected = filteredRows.length > 0 && filteredRows.every(r => selectedLeafIds.has(r.id))
  const someSelected = !allSelected && filteredRows.some(r => selectedLeafIds.has(r.id))

  function handleSelectAllChange() {
    if (allSelected) {
      filteredRows.forEach(r => {
        if (selectedLeafIds.has(r.id)) onToggle(r)
      })
    } else {
      filteredRows.forEach(r => {
        if (!selectedLeafIds.has(r.id)) onToggle(r)
      })
    }
  }

  const selectAllRef = useRef(null)
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  if (flatTree.length === 0) {
    return (
      <div className="border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-400">
        No experiments yet
      </div>
    )
  }

  // Fixed headers (type_icon and name are always rendered outside the sortable context)
  const fixedIds = ['type_icon', 'name', 'status', 'parent']
  const fixedTypeIconCol = visibleColumns.find(c => c.id === 'type_icon')
  const fixedNameCol = visibleColumns.find(c => c.id === 'name')
  const fixedStatusCol = visibleColumns.find(c => c.id === 'status')
  const fixedParentCol = visibleColumns.find(c => c.id === 'parent')
  const reorderableCols = visibleColumns.filter(c => !fixedIds.includes(c.id))

  // Metric columns in visible set (for lower-is-better toggles in header)
  const metricColumnsVisible = visibleColumns.filter(c => c.type === 'metric')

  return (
    <div ref={containerRef} className="flex gap-0" style={availableHeight ? { height: availableHeight } : {}}>
      {/* Table area */}
      <div className="flex-1 min-w-0 flex flex-col">
      {/* Unified toolbar: filters + highlight + columns — fixed top */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-white">
        <FilterBar filters={filters} setFilters={setFilters} allColumns={allColumns} />
        {filters.length > 0 && (
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {filteredRows.length}/{flatTree.length}
          </span>
        )}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={highlightBest}
            onChange={e => setHighlightBest(e.target.checked)}
            className="rounded"
          />
          Highlight best
        </label>
        <ColumnPicker allColumns={allColumns} colState={colState} setColState={setColState} />
      </div>

      {/* Bulk action bar — below toolbar */}
      {selectedLeafIds.size >= 1 && (
        <BulkActionBar
          selectedLeafIds={selectedLeafIds}
          onCompare={onCompare}
          onSetStatus={onBulkSetStatus}
          onDuplicate={onBulkDuplicate}
          onDelete={onBulkDelete}
          onClear={onClearSelection}
          className="flex-shrink-0"
        />
      )}

      {/* Scrollable table area */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-sm w-full" style={{ tableLayout: 'auto' }}>
          <thead className="sticky top-0 z-10">
            <DndContext
              id="column-dnd"
              sensors={colDndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColDragEnd}
            >
              <SortableContext items={reorderableColIds} strategy={horizontalListSortingStrategy}>
                <tr>
                  {/* Select-all checkbox — sticky top+left */}
                  <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-2 py-2 text-center" style={{ width: 40, minWidth: 40 }}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAllChange}
                      className="cursor-pointer"
                    />
                  </th>

                  {/* Fixed: type_icon */}
                  {fixedTypeIconCol && (
                    <th
                      className={`sticky top-0 z-20 border-b border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${headerBgClass('fixed')}`}
                      style={{ width: fixedTypeIconCol.width, minWidth: fixedTypeIconCol.width, position: 'relative' }}
                    >
                      <div style={{ width: fixedTypeIconCol.width - 24 }} />
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors"
                        onMouseDown={e => handleResizeStart(e, fixedTypeIconCol.id, fixedTypeIconCol.width)}
                      />
                    </th>
                  )}

                  {/* Fixed: name — sticky */}
                  {fixedNameCol && (
                    <th
                      className={`border-b border-r border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap relative ${headerBgClass('fixed')}`}
                      style={{ width: fixedNameCol.width, minWidth: fixedNameCol.width, maxWidth: fixedNameCol.width }}
                      onClick={() => fixedNameCol.sortable && handleSort(fixedNameCol.id)}
                    >
                      <div className={`flex items-center gap-1 ${fixedNameCol.sortable ? 'cursor-pointer select-none' : ''}`}>
                        {fixedNameCol.label}
                        {sort?.columnId === fixedNameCol.id && (
                          <Icon name={sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-500" />
                        )}
                      </div>
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors"
                        onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, fixedNameCol.id, fixedNameCol.width) }}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                  )}

                  {/* Fixed: status */}
                  {fixedStatusCol && (
                    <th
                      className={`border-b border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap relative ${headerBgClass('fixed')}`}
                      style={{ width: fixedStatusCol.width, minWidth: fixedStatusCol.width }}
                      onClick={() => fixedStatusCol.sortable && handleSort(fixedStatusCol.id)}
                    >
                      <div className={`flex items-center gap-1 ${fixedStatusCol.sortable ? 'cursor-pointer select-none' : ''}`}>
                        {fixedStatusCol.label}
                        {sort?.columnId === fixedStatusCol.id && (
                          <Icon name={sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-500" />
                        )}
                      </div>
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors"
                        onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, fixedStatusCol.id, fixedStatusCol.width) }}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                  )}

                  {/* Fixed: parent */}
                  {fixedParentCol && (
                    <th
                      className={`border-b border-r border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap relative ${headerBgClass('fixed')}`}
                      style={{ width: fixedParentCol.width, minWidth: fixedParentCol.width }}
                      onClick={() => fixedParentCol.sortable && handleSort(fixedParentCol.id)}
                    >
                      <div className={`flex items-center gap-1 ${fixedParentCol.sortable ? 'cursor-pointer select-none' : ''}`}>
                        {fixedParentCol.label}
                        {sort?.columnId === fixedParentCol.id && (
                          <Icon name={sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-500" />
                        )}
                      </div>
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors"
                        onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, fixedParentCol.id, fixedParentCol.width) }}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                  )}

                  {/* Reorderable columns */}
                  {reorderableCols.map((col, idx) => {
                    const prevType = idx > 0 ? reorderableCols[idx - 1].type : null
                    const isGroupStart = col.type !== 'fixed' && col.type !== prevType
                    return (
                      <SortableColumnHeader
                        key={col.id}
                        col={col}
                        sort={sort}
                        onSort={handleSort}
                        onResizeStart={handleResizeStart}
                        headerBgClass={headerBgClass}
                        highlightBest={highlightBest}
                        lowerIsBetter={lowerIsBetter}
                        onToggleLowerIsBetter={key => setLowerIsBetter(prev => ({ ...prev, [key]: !prev[key] }))}
                        isGroupStart={isGroupStart}
                      />
                    )
                  })}

                  {/* '+' button to add new column */}
                  <th
                    className="sticky top-0 z-20 border-b border-slate-200 px-2 py-2 bg-slate-50"
                    style={{ width: 36, minWidth: 36 }}
                  >
                    <div className="relative" ref={addColRef}>
                      <button
                        onClick={() => setAddColOpen(o => !o)}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="Add column"
                      >
                        <Icon name="add" className="text-[16px]" />
                      </button>
                      {addColOpen && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-52 p-2">
                          {!addColType ? (
                            <>
                              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                Column type
                              </div>
                              <button
                                onClick={() => setAddColType('config')}
                                className="w-full text-left px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                Config key
                              </button>
                              <button
                                onClick={() => setAddColType('metric')}
                                className="w-full text-left px-2 py-1.5 text-xs text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              >
                                Metric key
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                {addColType === 'config' ? 'Config' : 'Metric'} key name
                              </div>
                              <input
                                autoFocus
                                value={addColKey}
                                onChange={e => setAddColKey(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleAddColSubmit()
                                  if (e.key === 'Escape') { setAddColOpen(false); setAddColType(null); setAddColKey('') }
                                }}
                                placeholder="Key name..."
                                className="w-full text-xs border border-slate-200 rounded px-2 py-1 mb-2 focus:outline-none focus:border-blue-400"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={handleAddColSubmit}
                                  disabled={!addColKey.trim()}
                                  className="flex-1 text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700 transition-colors"
                                >
                                  Add
                                </button>
                                <button
                                  onClick={() => { setAddColType(null); setAddColKey('') }}
                                  className="text-xs text-slate-400 hover:text-slate-600"
                                >
                                  Back
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                </tr>
              </SortableContext>
            </DndContext>
          </thead>
          <tbody>
            {filteredRows.map(exp => (
              <tr
                key={exp.id}
                className={`hover:bg-slate-50/50 border-b border-slate-100 cursor-pointer ${
                  detailExpId === exp.id ? 'bg-blue-50/40' : ''
                }`}
                onClick={() => setDetailExpId(prev => prev === exp.id ? null : exp.id)}
              >
                {/* Checkbox — sticky left */}
                <td
                  className="sticky left-0 z-10 bg-white border-r border-slate-100 px-2 py-2 text-center"
                  style={{ width: 40, minWidth: 40 }}
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedLeafIds.has(exp.id)}
                    onChange={() => onToggle(exp)}
                    className="cursor-pointer"
                  />
                </td>
                {/* Fixed cells: type_icon, name, status, parent */}
                {fixedTypeIconCol && (
                  <td key="type_icon" className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap" style={{ width: fixedTypeIconCol.width, minWidth: fixedTypeIconCol.width }}>
                    {renderCellValue(fixedTypeIconCol, exp)}
                  </td>
                )}
                {fixedNameCol && (
                  <td key="name" className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap font-medium" style={{ width: fixedNameCol.width, minWidth: fixedNameCol.width }}>
                    {renderCellValue(fixedNameCol, exp)}
                  </td>
                )}
                {fixedStatusCol && (
                  <td key="status" className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap" style={{ width: fixedStatusCol.width, minWidth: fixedStatusCol.width }} onClick={e => e.stopPropagation()}>
                    {renderCellValue(fixedStatusCol, exp)}
                  </td>
                )}
                {fixedParentCol && (
                  <td key="parent" className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap border-r border-slate-200" style={{ width: fixedParentCol.width, minWidth: fixedParentCol.width }}>
                    {renderCellValue(fixedParentCol, exp)}
                  </td>
                )}
                {/* Reorderable cells: config + metric columns */}
                {reorderableCols.map((col, colIdx) => {
                  const isHighlighted = highlightBest && col.type === 'metric'
                  const cellValue = isHighlighted ? exp.metrics?.[col.key] : undefined
                  const bestValue = isHighlighted ? getBestValue(col.key, filteredRows, lowerIsBetter[col.key] || false) : undefined
                  const highlightCls = isHighlighted ? metricCellClass(col.key, cellValue, bestValue, true) : ''
                  const prevType = colIdx > 0 ? reorderableCols[colIdx - 1].type : null
                  const isGroupStart = col.type !== prevType
                  return (
                    <td
                      key={col.id}
                      className={`px-3 py-2 text-xs text-slate-700 whitespace-nowrap${highlightCls ? ` ${highlightCls}` : ''}${isGroupStart ? ' border-l-2 border-l-slate-300' : ''}`}
                      style={{ width: col.width, minWidth: col.width }}
                    >
                      {renderCellValue(col, exp)}
                    </td>
                  )
                })}
                {/* Empty cell for the '+' column */}
                <td style={{ width: 36, minWidth: 36 }} />
              </tr>
            ))}

          </tbody>
        </table>
      </div>

      {/* New experiment bar — fixed bottom */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-slate-50 border-t border-slate-200">
        <Icon name="add" className="text-[16px] text-slate-400" />
        <input
          value={newRowName}
          onChange={e => { setNewRowName(e.target.value); setNewRowError(false) }}
          onKeyDown={async e => {
            if (e.key === 'Enter') {
              const trimmed = newRowName.trim()
              if (!trimmed) { setNewRowError(true); return }
              try {
                await experimentsApi.create(projectId, { name: trimmed, status: 'planned' })
                setNewRowName('')
                setNewRowError(false)
                await fetchExperiments()
              } catch (err) {
                console.error('Failed to create experiment:', err)
                setNewRowError(true)
              }
            }
            if (e.key === 'Escape') { setNewRowName(''); setNewRowError(false) }
          }}
          placeholder="New experiment..."
          className={`flex-1 text-sm bg-transparent border-none focus:outline-none placeholder:text-slate-400 ${
            newRowError ? 'text-red-500' : 'text-slate-700'
          }`}
        />
      </div>
      </div>{/* end table area */}

      {/* Right: detail panel — flex sibling */}
      {detailExp && (
        <div className="w-[280px] flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
          <ExperimentDetailPanel
            experiment={detailExp}
            flatTree={flatTree}
            onClose={() => setDetailExpId(null)}
            onRefresh={fetchExperiments}
            libraryId={libraryId}
            expPapersMap={expPapersMap}
            onExpPapersChange={onExpPapersChange}
            rqList={rqList}
          />
        </div>
      )}
    </div>
  )
}

// ─── BulkActionBar ────────────────────────────────────────────────────────────

function BulkActionBar({ selectedLeafIds, onCompare, onSetStatus, onDuplicate, onDelete, onClear, className = '' }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-blue-50 border-t border-blue-200 z-20 ${className}`}>
      <span className="text-xs font-semibold text-blue-700">
        {selectedLeafIds.size} selected
      </span>

      {selectedLeafIds.size >= 2 && (
        <button
          onClick={onCompare}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Icon name="compare_arrows" className="text-[14px]" />
          Compare
        </button>
      )}

      <BulkStatusDropdown selectedIds={selectedLeafIds} onApply={onSetStatus} />

      <button
        onClick={onDuplicate}
        className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
      >
        <Icon name="content_copy" className="text-[14px]" />
        Duplicate
      </button>

      <button
        onClick={onDelete}
        className="flex items-center gap-1 px-2.5 py-1 bg-white border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
      >
        <Icon name="delete" className="text-[14px]" />
        Delete
      </button>

      <button
        onClick={onClear}
        className="text-xs text-slate-500 hover:text-slate-700 ml-auto"
      >
        Clear
      </button>
    </div>
  )
}

// ─── BulkStatusDropdown ───────────────────────────────────────────────────────

function BulkStatusDropdown({ selectedIds, onApply }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
      >
        <Icon name="swap_horiz" className="text-[14px]" />
        Set Status
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-36 p-1">
          {Object.entries(experimentStatusConfig).map(([key, cfg]) => (
            <button
              key={key}
              onClick={async () => {
                setOpen(false)
                await onApply(key)
              }}
              className="block w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 rounded flex items-center gap-2"
            >
              <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.class}`}>{cfg.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Experiment Section ────────────────────────────────────────────────────────

function ExperimentSection({ projectId, libraryId }) {
  const [flatExperiments, setFlatExperiments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [expPapersMap, setExpPapersMap] = useState(new Map())
  const [rqList, setRqList] = useState([])
  const [selectedLeafIds, setSelectedLeafIds] = useState(new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [viewMode, setViewMode] = useLocalStorage(`researchos.exp.view.${projectId}`, 'tree')
  const [gapActive, setGapActive] = useState(false)
  const [treeFilters, setTreeFilters] = useState([])
  const [treeSort, setTreeSort] = useState(null) // null | 'name-asc' | 'name-desc' | 'status-asc' | 'status-desc'
  const [expandCollapseKey, setExpandCollapseKey] = useState(null) // { key, expand }
  const [allCollapsed, setAllCollapsed] = useState(false)

  const expTree = useMemo(() => buildExperimentTree(flatExperiments), [flatExperiments])
  const flatTree = useMemo(() => flattenExperimentTree(expTree), [expTree])
  const treeFilterColumns = useMemo(() => buildColumns(flatTree), [flatTree])

  /** Sort a tree recursively at each level. */
  function sortTree(nodes, sortKey) {
    if (!sortKey) return nodes
    const [field, dir] = sortKey.split('-') // 'name-asc' → ['name', 'asc']
    const statusOrder = { planned: 0, running: 1, completed: 2, failed: 3 }
    const sorted = [...nodes].sort((a, b) => {
      let cmp
      if (field === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '')
      } else if (field === 'status') {
        cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
      } else {
        cmp = 0
      }
      return dir === 'desc' ? -cmp : cmp
    })
    return sorted.map(n => n.children?.length > 0 ? { ...n, children: sortTree(n.children, sortKey) } : n)
  }

  /** Filter a tree recursively — keep a node if it matches or any descendant matches. */
  const filteredExpTree = useMemo(() => {
    const base = treeSort ? sortTree(expTree, treeSort) : expTree
    if (treeFilters.length === 0) return base
    function filterNode(node) {
      const selfMatches = treeFilters.every(f => applyFilter(node, f))
      if (node.children?.length > 0) {
        const filteredChildren = node.children.map(filterNode).filter(Boolean)
        if (filteredChildren.length > 0) return { ...node, children: filteredChildren }
        if (selfMatches) return { ...node, children: [] }
        return null
      }
      return selfMatches ? node : null
    }
    return base.map(filterNode).filter(Boolean)
  }, [expTree, treeFilters, treeSort])

  function handleToggleNode(exp) {
    setSelectedLeafIds(prev => {
      const next = new Set(prev)
      if (next.has(exp.id)) {
        next.delete(exp.id)
      } else {
        next.add(exp.id)
      }
      return next
    })
  }

  const allLeafIds = useMemo(() => {
    return new Set(flatTree.filter(e => !e.children || e.children.length === 0).map(e => e.id))
  }, [flatTree])

  const allSelected = allLeafIds.size > 0 && allLeafIds.size === selectedLeafIds.size && [...allLeafIds].every(id => selectedLeafIds.has(id))

  const compareExperiments = useMemo(() => {
    return flatTree.filter(e => selectedLeafIds.has(e.id))
  }, [flatTree, selectedLeafIds])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const fetchExpPapers = useCallback(async (exps) => {
    if (!exps.length) { setExpPapersMap(new Map()); return }
    try {
      const results = await Promise.all(exps.map(e => experimentsApi.listPapers(e.id)))
      const map = new Map()
      exps.forEach((e, i) => map.set(e.id, Array.isArray(results[i]) ? results[i] : []))
      setExpPapersMap(map)
    } catch (err) {
      console.error('Failed to fetch experiment papers:', err)
    }
  }, [])

  const fetchExperiments = useCallback(async () => {
    try {
      const [data, rqs] = await Promise.all([
        experimentsApi.list(projectId),
        researchQuestionsApi.list(projectId).catch(() => []),
      ])
      const exps = Array.isArray(data) ? data : []
      setFlatExperiments(exps)
      setRqList(Array.isArray(rqs) ? rqs : [])
      setError(null)
      await fetchExpPapers(exps)
    } catch (err) {
      console.error('Failed to fetch experiments:', err)
      setError('Failed to load experiments')
      setFlatExperiments([])
    } finally {
      setLoading(false)
    }
  }, [projectId, fetchExpPapers])

  const handleExpPapersChange = useCallback((expId, papers) => {
    setExpPapersMap(prev => {
      const next = new Map(prev)
      next.set(expId, papers)
      return next
    })
  }, [])

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
  const filteredFlat = useMemo(() => flattenExperimentTree(filteredExpTree), [filteredExpTree])
  const allIds = filteredFlat.map(n => n.id)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-800">Experiments</h2>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-0 border border-slate-200 rounded-lg overflow-hidden h-[34px]">
            <button
              onClick={() => { setViewMode('tree'); setGapActive(false) }}
              title="Tree view"
              className={`flex items-center justify-center px-2 h-full transition-colors ${!gapActive && viewMode === 'tree' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icon name="account_tree" className="text-[16px] leading-none" />
            </button>
            <button
              onClick={() => { setViewMode('table'); setGapActive(false) }}
              title="Table view"
              className={`flex items-center justify-center px-2 h-full transition-colors ${!gapActive && viewMode === 'table' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icon name="table_chart" className="text-[16px] leading-none" />
            </button>
          </div>
          {/* Gap Analysis tab button — separate from icon toggle to avoid localStorage pitfall */}
          <button
            onClick={() => setGapActive(true)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${gapActive ? 'bg-purple-50 text-purple-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Icon name="psychology" className="text-[16px]" />
            Gap Analysis
          </button>
          <button
            onClick={() => setShowCsvModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Icon name="upload_file" className="text-[16px]" />
            Import Data
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Icon name="add" className="text-[16px]" />
            Add Experiment
          </button>
        </div>
      </div>

      {/* Filter bar — tree view only */}
      {!gapActive && viewMode !== 'table' && expTree.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-white">
          <div className="flex-1 min-w-0">
            <FilterBar filters={treeFilters} setFilters={setTreeFilters} allColumns={treeFilterColumns} />
          </div>
          <select
            value={treeSort || ''}
            onChange={e => setTreeSort(e.target.value || null)}
            className="flex-shrink-0 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:border-blue-400 cursor-pointer"
          >
            <option value="">Position order</option>
            <option value="name-asc">Name A→Z</option>
            <option value="name-desc">Name Z→A</option>
            <option value="status-asc">Status: Planned→Failed</option>
            <option value="status-desc">Status: Failed→Planned</option>
          </select>
          <button
            onClick={() => {
              if (allSelected) {
                setSelectedLeafIds(new Set())
              } else {
                setSelectedLeafIds(new Set(allLeafIds))
              }
            }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded px-2 py-1 flex-shrink-0"
          >
            <Icon name={allSelected ? 'deselect' : 'select_all'} className="text-[14px]" />
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={() => {
              const expand = allCollapsed
              setExpandCollapseKey({ key: Date.now(), expand })
              setAllCollapsed(!allCollapsed)
            }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded px-2 py-1 flex-shrink-0"
          >
            <Icon name={allCollapsed ? 'unfold_more' : 'unfold_less'} className="text-[14px]" />
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        </div>
      )}

      {/* Bulk action bar — below filter bar, tree view only */}
      {!gapActive && viewMode !== 'table' && selectedLeafIds.size >= 1 && (
        <BulkActionBar
          selectedLeafIds={selectedLeafIds}
          onCompare={() => setCompareOpen(true)}
          onSetStatus={async (status) => {
            await Promise.all([...selectedLeafIds].map(id => experimentsApi.update(id, { status })))
            await fetchExperiments()
          }}
          onDuplicate={async () => {
            await Promise.all([...selectedLeafIds].map(id => experimentsApi.duplicate(id)))
            await fetchExperiments()
            setSelectedLeafIds(new Set())
          }}
          onDelete={() => setBulkDeleteConfirm(true)}
          onClear={() => setSelectedLeafIds(new Set())}
          className="flex-shrink-0"
        />
      )}

      {/* GapAnalysisTab: always mounted to preserve state, hidden via CSS when not active */}
      <div className={gapActive ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
        <GapAnalysisTab
          projectId={projectId}
          flatExperiments={flatExperiments}
          onRefreshExperiments={fetchExperiments}
        />
      </div>
      {gapActive ? null : loading ? (
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
      ) : viewMode === 'table' ? (
        <ExperimentTableView
          flatTree={flatTree}
          selectedLeafIds={selectedLeafIds}
          onToggle={handleToggleNode}
          fetchExperiments={fetchExperiments}
          projectId={projectId}
          libraryId={libraryId}
          expPapersMap={expPapersMap}
          onExpPapersChange={handleExpPapersChange}
          rqList={rqList}
          onCompare={() => setCompareOpen(true)}
          onBulkSetStatus={async (status) => {
            await Promise.all([...selectedLeafIds].map(id => experimentsApi.update(id, { status })))
            await fetchExperiments()
          }}
          onBulkDuplicate={async () => {
            await Promise.all([...selectedLeafIds].map(id => experimentsApi.duplicate(id)))
            await fetchExperiments()
            setSelectedLeafIds(new Set())
          }}
          onBulkDelete={() => setBulkDeleteConfirm(true)}
          onClearSelection={() => setSelectedLeafIds(new Set())}
        />
      ) : (
        <div className="pb-4 flex-1 min-h-0 overflow-y-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveId(active.id)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                {filteredExpTree.map(exp => (
                  <ExperimentNode
                    key={exp.id}
                    experiment={exp}
                    depth={0}
                    onRefresh={fetchExperiments}
                    projectId={projectId}
                    libraryId={libraryId}
                    expPapersMap={expPapersMap}
                    onExpPapersChange={handleExpPapersChange}
                    rqList={rqList}
                    parentId={null}
                    selectedLeafIds={selectedLeafIds}
                    onToggle={handleToggleNode}
                    expandCollapseKey={expandCollapseKey}
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
        </div>
      )}

      {/* Bulk delete confirmation */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete {selectedLeafIds.size} experiment{selectedLeafIds.size !== 1 ? 's' : ''}?</h3>
            <p className="text-sm text-slate-500 mb-4">
              This will permanently delete the selected experiments and all their children. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await Promise.all([...selectedLeafIds].map(id => experimentsApi.remove(id)))
                  setSelectedLeafIds(new Set())
                  setBulkDeleteConfirm(false)
                  await fetchExperiments()
                }}
                className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
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

      {/* CSV import modal */}
      {showCsvModal && (
        <CSVImportModal
          projectId={projectId}
          existingExperiments={flatExperiments}
          onImported={fetchExperiments}
          onClose={() => setShowCsvModal(false)}
        />
      )}

      {/* Compare modal */}
      {compareOpen && (
        <CompareModal
          experiments={compareExperiments}
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          flatTree={flatTree}
        />
      )}
    </div>
  )
}

// ─── Search Picker (for Literature tab) ───────────────────────────────────────

function SearchPicker({ projectId, libraryId, onLinked, existingPaperIds, existingWebsiteIds, existingRepoIds = new Set(), renderTrigger = false }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const containerRef = useRef(null)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        if (renderTrigger) setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [renderTrigger])

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

  const searchInput = (
    <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20">
      <Icon name="search" className="text-[18px] text-slate-400 flex-shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={handleQueryChange}
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); setResults([]); if (renderTrigger) setShowPicker(false) } }}
        placeholder="Search papers, websites, and repos..."
        className="flex-1 text-sm text-slate-700 bg-transparent focus:outline-none"
      />
    </div>
  )

  const resultsList = open && results.length > 0 && (
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
  )

  if (renderTrigger) {
    return (
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => { setShowPicker(p => !p); setTimeout(() => inputRef.current?.focus(), 50) }}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Icon name="add_link" className="text-[16px]" />
          Link Literature
        </button>
        {showPicker && (
          <div className="absolute right-0 top-full mt-2 w-96 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-3">
            <div className="relative">
              {searchInput}
              {resultsList}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative mb-4" ref={containerRef}>
      {searchInput}
      {resultsList}
    </div>
  )
}

// ─── Literature Tab helpers ────────────────────────────────────────────────────

function litLastName(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1]
}

function litFormatAuthors(authors) {
  if (!authors || authors.length === 0) return ''
  if (authors.length === 1) return litLastName(authors[0])
  if (authors.length === 2) return `${litLastName(authors[0])} & ${litLastName(authors[1])}`
  return `${litLastName(authors[0])} et al.`
}

function litItemYear(item) {
  if (item.publishedDate) return item.publishedDate.slice(0, 4)
  if (item.itemType === 'website') return '-'
  if (item.itemType === 'github_repo') return '-'
  return item.year || '-'
}

function litItemVenue(item) {
  if (item.itemType === 'website') {
    try { return new URL(item.url).hostname.replace(/^www\./, '') } catch { return item.url || '' }
  }
  if (item.itemType === 'github_repo') {
    return `${item.owner || ''}/${item.repoName || ''}`
  }
  return item.venue || ''
}

// ─── Lit Detail Panel ─────────────────────────────────────────────────────────

function LitDetailPanel({ item, onClose, onUnlink }) {
  const navigate = useNavigate()
  if (!item) return null
  const status = statusConfig[item.status] || statusConfig['inbox']
  const isWebsite = item.itemType === 'website'
  const isRepo = item.itemType === 'github_repo'

  function openInLibrary() {
    if (isWebsite) navigate(`/library/website/${item.id}`)
    else if (isRepo) navigate(`/library/github-repo/${item.id}`)
    else navigate(`/library/paper/${item.id}`)
  }

  return (
    <div className="w-80 flex-shrink-0 flex flex-col border-l border-slate-200 bg-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="text-sm font-semibold text-slate-800 line-clamp-2">{item.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {/* Status */}
        {item.status && (
          <div>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.class}`}>
              {status.label}
            </span>
          </div>
        )}

        {/* Type badge */}
        {(isWebsite || isRepo) && (
          <div>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isRepo ? 'bg-violet-100 text-violet-700' : 'bg-purple-100 text-purple-700'}`}>
              {isRepo ? 'GitHub' : 'Website'}
            </span>
          </div>
        )}

        {/* Authors */}
        {item.authors && item.authors.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Authors</p>
            <p className="text-sm text-slate-700">{item.authors.slice(0, 5).join(', ')}{item.authors.length > 5 ? ' …' : ''}</p>
          </div>
        )}

        {/* Date / Venue */}
        <div className="flex gap-4">
          {litItemYear(item) !== '-' && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Year</p>
              <p className="text-sm text-slate-700">{litItemYear(item)}</p>
            </div>
          )}
          {litItemVenue(item) && (
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Venue</p>
              <p className="text-sm text-slate-700 truncate">{litItemVenue(item)}</p>
            </div>
          )}
        </div>

        {/* Abstract */}
        {item.abstract && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Abstract</p>
            <p className="text-xs text-slate-600 line-clamp-6">{item.abstract}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-slate-200 space-y-2">
        <button
          onClick={openInLibrary}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <Icon name="open_in_new" className="text-[16px]" />
          Open in Library
        </button>
        <button
          onClick={() => onUnlink(item._linkId)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
        >
          <Icon name="link_off" className="text-[16px]" />
          Unlink
        </button>
      </div>
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

  // Table state
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('asc')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectedItem, setSelectedItem] = useState(null)
  const [searchFilter, setSearchFilter] = useState('')

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
      setSelectedItem(prev => prev?._linkId === linkId ? null : prev)
    } catch (err) {
      console.error('Failed to unlink:', err)
    }
  }

  async function handleBulkUnlink() {
    const toUnlink = items.filter(i => selectedIds.has(i.id)).map(i => i._linkId)
    for (const linkId of toUnlink) {
      try {
        await projectPapersApi.unlink(projectId, linkId)
      } catch (err) {
        console.error('Failed to unlink:', err)
      }
    }
    setLinks(prev => prev.filter(l => !toUnlink.includes(l.id)))
    setSelectedIds(new Set())
    setSelectedItem(null)
  }

  function toggleSort(key) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const toggleCheck = (item) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(item.id) ? next.delete(item.id) : next.add(item.id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(i => i.id)))
  }

  // Build flat items array from links
  const items = useMemo(() => links.map(link => {
    if (link.paperId && paperLookup[link.paperId]) return { ...paperLookup[link.paperId], itemType: 'paper', _linkId: link.id }
    if (link.githubRepoId && repoLookup[link.githubRepoId]) return { ...repoLookup[link.githubRepoId], itemType: 'github_repo', _linkId: link.id }
    if (link.websiteId && websiteLookup[link.websiteId]) return { ...websiteLookup[link.websiteId], itemType: 'website', _linkId: link.id }
    return null
  }).filter(Boolean), [links, paperLookup, websiteLookup, repoLookup])

  // Filtered + sorted items
  const filtered = useMemo(() => {
    let result = items
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase()
      result = result.filter(i => (i.title || '').toLowerCase().includes(q))
    }
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1
      result = [...result].sort((a, b) => {
        if (sortKey === 'title') return dir * (a.title || '').localeCompare(b.title || '')
        if (sortKey === 'date') {
          const da = a.publishedDate || ''
          const db = b.publishedDate || ''
          if (!da && !db) return 0
          if (!da) return dir
          if (!db) return -dir
          return dir * da.localeCompare(db)
        }
        if (sortKey === 'authors') return dir * litFormatAuthors(a.authors).localeCompare(litFormatAuthors(b.authors))
        if (sortKey === 'status') {
          const order = ['inbox', 'to-read', 'read']
          return dir * (order.indexOf(a.status) - order.indexOf(b.status))
        }
        return 0
      })
    }
    return result
  }, [items, searchFilter, sortKey, sortDir])

  const existingPaperIds = useMemo(() => new Set(links.filter(l => l.paperId).map(l => l.paperId)), [links])
  const existingWebsiteIds = useMemo(() => new Set(links.filter(l => l.websiteId).map(l => l.websiteId)), [links])
  const existingRepoIds = useMemo(() => new Set(links.filter(l => l.githubRepoId).map(l => l.githubRepoId)), [links])

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
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top toolbar */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          {/* Search filter */}
          <div className="relative flex-1">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
            <input
              type="text"
              placeholder="Filter literature..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
          {/* Link literature button with inline search picker */}
          <div className="relative flex-shrink-0">
            <SearchPicker
              projectId={projectId}
              libraryId={libraryId}
              onLinked={fetchAll}
              existingPaperIds={existingPaperIds}
              existingWebsiteIds={existingWebsiteIds}
              existingRepoIds={existingRepoIds}
              renderTrigger
            />
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-100">
            <span className="text-sm font-medium text-blue-700">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkUnlink}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
            >
              <Icon name="link_off" className="text-[14px]" />
              Unlink Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        )}

        {/* Table */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Icon name="menu_book" className="text-slate-300 text-[36px] mb-2" />
            <p className="text-sm text-slate-400">No literature linked yet. Use the search above to add supporting papers and websites.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="pl-4 pr-2 py-2.5 w-8">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-20">
                    Type
                  </th>
                  <th
                    className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 transition-colors"
                    onClick={() => toggleSort('title')}
                  >
                    <span className="flex items-center gap-1">
                      Title
                      {sortKey === 'title' && <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-600" />}
                    </span>
                  </th>
                  <th
                    className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 transition-colors"
                    onClick={() => toggleSort('authors')}
                  >
                    <span className="flex items-center gap-1">
                      Authors
                      {sortKey === 'authors' && <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-600" />}
                    </span>
                  </th>
                  <th
                    className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 transition-colors"
                    onClick={() => toggleSort('date')}
                  >
                    <span className="flex items-center gap-1">
                      Date
                      {sortKey === 'date' && <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-600" />}
                    </span>
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Venue</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(item => {
                  const isSelected = selectedItem?.id === item.id
                  const isChecked = selectedIds.has(item.id)
                  const isWebsite = item.itemType === 'website'
                  const isRepo = item.itemType === 'github_repo'
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(isSelected ? null : item)}
                      className={`group cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50' : isChecked ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="pl-4 pr-2 py-3 w-8">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-blue-600"
                          checked={isChecked}
                          onClick={e => e.stopPropagation()}
                          onChange={() => toggleCheck(item)}
                        />
                      </td>
                      {/* Type */}
                      <td className="px-2 py-3 w-20">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                          isRepo ? 'bg-violet-100 text-violet-700' : isWebsite ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {isRepo ? 'GitHub' : isWebsite ? 'Website' : 'Paper'}
                        </span>
                      </td>
                      {/* Title */}
                      <td className="px-2 py-3 max-w-xs">
                        <span className="text-sm text-slate-800 line-clamp-1 block">{item.title}</span>
                      </td>
                      {/* Authors */}
                      <td className="px-2 py-3 text-sm text-slate-500 w-32">
                        {litFormatAuthors(item.authors)}
                      </td>
                      {/* Date */}
                      <td className="px-2 py-3 text-sm text-slate-500 w-16">
                        {litItemYear(item)}
                      </td>
                      {/* Venue */}
                      <td className="px-2 py-3 text-sm text-slate-500 max-w-[140px]">
                        <span className="line-clamp-1 block">{litItemVenue(item)}</span>
                      </td>
                      {/* Unlink */}
                      <td className="px-2 py-3 w-10">
                        <button
                          onClick={e => { e.stopPropagation(); handleUnlink(item._linkId) }}
                          title="Unlink"
                          className="text-slate-300 hover:text-red-400 transition-all p-1 rounded"
                        >
                          <Icon name="link_off" className="text-[16px]" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && items.length > 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Icon name="search_off" className="text-[36px] mb-2" />
                <p className="text-sm">No items match your filter.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail panel — reuse Library.jsx components */}
      {selectedItem && selectedItem.itemType === 'website' && (
        <WebsiteDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStatusChange={(id, status) => {
            websitesApi.update(id, { status }).then(fetchAll)
          }}
          onUpdate={(updated) => {
            setSelectedItem(prev => prev?.id === updated.id ? { ...prev, ...updated, itemType: 'website', _linkId: prev._linkId } : prev)
            fetchAll()
          }}
          onDelete={() => { setSelectedItem(null); fetchAll() }}
          width={320}
        />
      )}
      {selectedItem && selectedItem.itemType === 'github_repo' && (
        <GitHubRepoDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStatusChange={(id, status) => {
            githubReposApi.update(id, { status }).then(fetchAll)
          }}
          onUpdate={(updated) => {
            setSelectedItem(prev => prev?.id === updated.id ? { ...prev, ...updated, itemType: 'github_repo', _linkId: prev._linkId } : prev)
            fetchAll()
          }}
          onDelete={() => { setSelectedItem(null); fetchAll() }}
          width={320}
        />
      )}
      {selectedItem && selectedItem.itemType !== 'website' && selectedItem.itemType !== 'github_repo' && (
        <PaperDetail
          paper={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStatusChange={(id, status) => {
            papersApi.update(id, { status }).then(fetchAll)
          }}
          onPaperUpdate={(updated) => {
            setSelectedItem(prev => prev?.id === updated.id ? { ...prev, ...updated, _linkId: prev._linkId } : prev)
            fetchAll()
          }}
          onDelete={() => { setSelectedItem(null); fetchAll() }}
          width={320}
        />
      )}
    </div>
  )
}

// ─── Left panel nav ───────────────────────────────────────────────────────────

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
    <div className="p-6">
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
  const location = useLocation()
  const [project, setProject] = useState(null)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
      <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
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
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Breadcrumb header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Icon name="arrow_back" className="text-[16px]" />
          Projects
        </button>
        <Icon name="chevron_right" className="text-[16px] text-slate-400" />
        <Link to={`/projects/${id}`} className="text-sm text-slate-500 hover:text-slate-700 truncate font-medium transition-colors">{project.name}</Link>
        {(() => {
          const segment = location.pathname.split('/').pop()
          const sectionLabels = { literature: 'Literature', experiments: 'Experiments', tasks: 'Tasks', notes: 'Notes' }
          const label = sectionLabels[segment]
          if (!label) return null
          return (
            <>
              <Icon name="chevron_right" className="text-[16px] text-slate-400" />
              <span className="text-sm text-slate-700 font-medium">{label}</span>
            </>
          )
        })()}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 bg-white overflow-y-auto">
        <Outlet context={{ project, setProject: (updated) => setProject(updated), notes, setNotes, id }} />
      </div>
    </div>
  )
}

// ─── Route-based tab wrappers ─────────────────────────────────────────────────

export function ProjectOverview() {
  const { project, setProject } = useOutletContext()
  return (
    <div className="h-full overflow-auto">
      <OverviewTab project={project} onUpdate={updated => setProject(updated)} />
    </div>
  )
}

export function ProjectLiterature() {
  const { project } = useOutletContext()
  return (
    <div className="h-full overflow-hidden">
      <LiteratureTab projectId={project.id} libraryId={project.libraryId} />
    </div>
  )
}

export function ProjectExperiments() {
  const { project } = useOutletContext()
  return <ExperimentSection projectId={project.id} libraryId={project.libraryId} />
}

export function ProjectNotes() {
  const { notes: projectNotes, setNotes: setProjectNotes, id } = useOutletContext()

  // Experiments list loaded on mount
  const [experiments, setExperiments] = useState([])
  // Map of expId -> note array (lazy-loaded)
  const [expNotesMap, setExpNotesMap] = useState({})
  // Set of experiment IDs whose notes have been fetched
  const loadedExpsRef = useRef(new Set())

  useEffect(() => {
    experimentsApi.list(id).then(setExperiments).catch(err => console.error('Failed to load experiments:', err))
  }, [id])

  // Build a Map of noteId -> expId for routing setNotes updates
  const noteToExpMap = useMemo(() => {
    const map = new Map()
    for (const [expId, notes] of Object.entries(expNotesMap)) {
      for (const note of notes) {
        map.set(note.id, expId)
      }
    }
    return map
  }, [expNotesMap])

  // Build combined notes array: project notes + virtual exp folders + reparented exp notes
  const combinedNotes = useMemo(() => {
    const result = [...projectNotes]

    for (const exp of experiments) {
      const virtualId = `exp_${exp.id}`
      // Virtual folder node representing this experiment
      result.push({
        id: virtualId,
        name: `Experiment: ${exp.name}`,
        type: 'folder',
        parentId: null,
        _isVirtualExpFolder: true,
        _expId: exp.id,
      })

      // Reparent experiment notes under the virtual folder
      const expNotes = expNotesMap[exp.id] || []
      for (const note of expNotes) {
        result.push({
          ...note,
          // Top-level notes in the experiment get reparented under the virtual folder
          parentId: note.parentId == null ? virtualId : note.parentId,
        })
      }
    }

    return result
  }, [projectNotes, experiments, expNotesMap])

  // Lazy-load experiment notes when a virtual folder is toggled open
  // NotesPanel calls handleToggle which expands folders — we intercept via setNotes
  // But we can't intercept toggle. Instead, wrap createFn to trigger loading when needed.
  // The cleanest approach: load notes for all experiments eagerly on mount once experiments are loaded.
  // Actually, use a useEffect to lazy-load when expNotesMap doesn't have an experiment yet.
  // We'll detect toggle via a wrapper — but NotesPanel doesn't expose toggle.
  // PRAGMATIC: load all experiment notes eagerly when experiments list changes.
  useEffect(() => {
    for (const exp of experiments) {
      if (!loadedExpsRef.current.has(exp.id)) {
        loadedExpsRef.current.add(exp.id)
        notesApi.listForExperiment(exp.id)
          .then(notes => setExpNotesMap(prev => ({ ...prev, [exp.id]: notes })))
          .catch(err => console.error(`Failed to load notes for experiment ${exp.id}:`, err))
      }
    }
  }, [experiments])

  // combinedSetNotes: intercept setNotes calls and route to correct bucket
  const combinedSetNotes = useCallback((updater) => {
    const newCombined = typeof updater === 'function' ? updater(combinedNotes) : updater

    // Partition: virtual folders are discarded, experiment notes routed to expNotesMap, rest to projectNotes
    const newProjectNotes = []
    // Map of expId -> new notes for that experiment
    const newExpNotesBuckets = {}

    for (const exp of experiments) {
      newExpNotesBuckets[exp.id] = []
    }

    for (const note of newCombined) {
      if (note._isVirtualExpFolder) continue // discard virtual folder nodes

      if (noteToExpMap.has(note.id)) {
        // This note belongs to an experiment — restore original parentId (un-reparent)
        const expId = noteToExpMap.get(note.id)
        const virtualId = `exp_${expId}`
        newExpNotesBuckets[expId] = newExpNotesBuckets[expId] || []
        newExpNotesBuckets[expId].push({
          ...note,
          parentId: note.parentId === virtualId ? null : note.parentId,
        })
      } else {
        newProjectNotes.push(note)
      }
    }

    setProjectNotes(newProjectNotes)
    setExpNotesMap(prev => {
      const updated = { ...prev }
      for (const [expId, notes] of Object.entries(newExpNotesBuckets)) {
        // Only update buckets that have been loaded (avoid overwriting with empty arrays for unloaded exps)
        if (loadedExpsRef.current.has(expId)) {
          updated[expId] = notes
        }
      }
      return updated
    })
  }, [combinedNotes, experiments, noteToExpMap, setProjectNotes])

  // combinedCreateFn: route note creation to correct API based on parentId
  const combinedCreateFn = useCallback(async (data) => {
    const { parentId } = data

    if (parentId && typeof parentId === 'string' && parentId.startsWith('exp_')) {
      // Creating directly under a virtual experiment folder
      const expId = parentId.slice(4) // remove 'exp_' prefix
      const note = await notesApi.createForExperiment(expId, { ...data, parentId: null })
      // Store in expNotesMap and return a reparented version for the combined array
      setExpNotesMap(prev => ({ ...prev, [expId]: [...(prev[expId] || []), note] }))
      return { ...note, parentId: `exp_${expId}` }
    }

    if (parentId && noteToExpMap.has(parentId)) {
      // Creating under an experiment note (nested)
      const expId = noteToExpMap.get(parentId)
      const note = await notesApi.createForExperiment(expId, data)
      setExpNotesMap(prev => ({ ...prev, [expId]: [...(prev[expId] || []), note] }))
      return note
    }

    // Default: create under project
    return notesApi.createForProject(id, data)
  }, [id, noteToExpMap])

  return (
    <NotesPanel
      notes={combinedNotes}
      setNotes={combinedSetNotes}
      createFn={combinedCreateFn}
    />
  )
}
