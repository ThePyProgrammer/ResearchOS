import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { projectsApi, notesApi, researchQuestionsApi } from '../services/api'
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

// ─── RQ Node (recursive) ──────────────────────────────────────────────────────

function RQNode({ rq, depth, projectId, onRefresh }) {
  const [expanded, setExpanded] = useState(true)
  const [editingQuestion, setEditingQuestion] = useState(false)
  const [questionDraft, setQuestionDraft] = useState(rq.question)
  const [editingHypothesis, setEditingHypothesis] = useState(false)
  const [hypothesisDraft, setHypothesisDraft] = useState(rq.hypothesis || '')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => { setQuestionDraft(rq.question) }, [rq.question])
  useEffect(() => { setHypothesisDraft(rq.hypothesis || '') }, [rq.hypothesis])

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

  const hasChildren = rq.children && rq.children.length > 0

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      {/* Row */}
      <div className="group relative flex items-start gap-1 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
        {/* Drag handle (visual affordance, not yet functional) */}
        <span className="opacity-0 group-hover:opacity-100 text-slate-300 flex-shrink-0 mt-0.5 cursor-grab">
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

              {/* Children */}
              {hasChildren && (
                <div className="space-y-0">
                  {rq.children.map(child => (
                    <RQNode
                      key={child.id}
                      rq={child}
                      depth={0}
                      projectId={projectId}
                      onRefresh={onRefresh}
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
            onClick={e => { e.stopPropagation(); setMenuOpen(m => !m) }}
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded"
          >
            <Icon name="more_vert" className="text-[16px]" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[110px]">
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
  )
}

// ─── RQ Section ───────────────────────────────────────────────────────────────

function RQSection({ projectId }) {
  const [flatRqs, setFlatRqs] = useState([])
  const [loading, setLoading] = useState(true)

  const rqTree = useMemo(() => buildRqTree(flatRqs), [flatRqs])

  const fetchRqs = useCallback(async () => {
    try {
      const data = await researchQuestionsApi.list(projectId)
      setFlatRqs(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch research questions:', err)
      setFlatRqs([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchRqs()
  }, [fetchRqs])

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
        <div>
          <div className="space-y-0">
            {rqTree.map(rq => (
              <RQNode
                key={rq.id}
                rq={rq}
                depth={0}
                projectId={projectId}
                onRefresh={fetchRqs}
              />
            ))}
          </div>
          <div className="mt-1 pl-9">
            <AddRQInput projectId={projectId} parentId={null} onCreated={fetchRqs} />
          </div>
        </div>
      )}
    </div>
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

      {/* Research Questions */}
      <RQSection projectId={project.id} />

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
