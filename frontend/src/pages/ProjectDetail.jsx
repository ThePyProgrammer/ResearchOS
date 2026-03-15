import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { projectsApi, notesApi } from '../services/api'
import NotesPanel from '../components/NotesPanel'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const projectStatusConfig = {
  active:    { label: 'Active',    class: 'bg-emerald-100 text-emerald-700' },
  paused:    { label: 'Paused',    class: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', class: 'bg-blue-100 text-blue-700' },
  archived:  { label: 'Archived',  class: 'bg-slate-100 text-slate-600' },
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

// ─── Status dropdown ─────────────────────────────────────────────────────────

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

// ─── Left panel nav ───────────────────────────────────────────────────────────

function LeftNav({ projectName, activeTab, onTabChange }) {
  const navItems = [
    { id: 'overview', icon: 'info', label: 'Overview' },
    { id: 'notes',    icon: 'edit_note', label: 'Notes' },
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

        {/* Phase 2 placeholder */}
        <div className="mt-3">
          <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Coming Soon</p>
          <div
            title="Phase 2 feature"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-300 cursor-default select-none"
          >
            <Icon name="help" className="text-[16px] flex-shrink-0" />
            Research Questions
            <span className="ml-auto text-[10px] text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded font-medium">P2</span>
          </div>
          <div
            title="Phase 3 feature"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-300 cursor-default select-none"
          >
            <Icon name="science" className="text-[16px] flex-shrink-0" />
            Experiments
            <span className="ml-auto text-[10px] text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded font-medium">P3</span>
          </div>
        </div>
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

      {/* Phase 2: Research Questions placeholder */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Research Questions</h3>
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
          <Icon name="help" className="text-slate-300 text-[32px] mb-2" />
          <p className="text-sm text-slate-400">Research questions will appear here in Phase 2</p>
        </div>
      </div>

      {/* Phase 3: Experiments placeholder */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Experiments</h3>
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
          <Icon name="science" className="text-slate-300 text-[32px] mb-2" />
          <p className="text-sm text-slate-400">Experiments will appear here in Phase 3</p>
        </div>
      </div>
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
