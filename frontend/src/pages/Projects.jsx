import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'
import WindowModal from '../components/WindowModal'
import CreateProjectModal from '../components/CreateProjectModal'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const projectStatusConfig = {
  active:    { label: 'Active',    class: 'bg-emerald-100 text-emerald-700' },
  paused:    { label: 'Paused',    class: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', class: 'bg-blue-100 text-blue-700' },
  archived:  { label: 'Archived',  class: 'bg-slate-100 text-slate-600' },
}

function formatRelativeDate(raw) {
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

function ProjectCardMenu({ project, onEdit, onArchive, onDelete, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 z-50 bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-44"
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={() => { onClose(); onEdit() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Icon name="edit" className="text-[18px] text-slate-400" />
        Edit
      </button>
      <button
        onClick={() => { onClose(); onArchive() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Icon name="archive" className="text-[18px] text-slate-400" />
        Archive
      </button>
      <div className="my-1 border-t border-slate-100" />
      <button
        onClick={() => { onClose(); onDelete() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
      >
        <Icon name="delete" className="text-[18px]" />
        Delete
      </button>
    </div>
  )
}

function ProjectCard({ project, onDelete, onArchive }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const statusCfg = projectStatusConfig[project.status] || projectStatusConfig.active

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    setDeleting(true)
    try {
      await projectsApi.remove(project.id)
      onDelete(project.id)
    } catch (err) {
      console.error('Failed to delete project:', err)
      alert(`Failed to delete project: ${err.message}`)
      setDeleting(false)
      setConfirming(false)
    }
  }

  async function handleArchive() {
    try {
      await projectsApi.update(project.id, { status: 'archived' })
      onArchive(project.id, 'archived')
    } catch (err) {
      console.error('Failed to archive project:', err)
    }
  }

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer relative flex flex-col gap-2 hover:border-slate-300 transition-colors"
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        <h3 className="flex-1 font-semibold text-lg text-slate-800 leading-tight">{project.name}</h3>
        <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="More options"
          >
            <Icon name="more_vert" className="text-[18px]" />
          </button>
          {menuOpen && (
            <ProjectCardMenu
              project={project}
              onEdit={() => navigate(`/projects/${project.id}`)}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onClose={() => { setMenuOpen(false); setConfirming(false) }}
            />
          )}
        </div>
      </div>

      {/* Status badge */}
      <div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.class}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-slate-500 line-clamp-2 flex-1">{project.description}</p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 mt-auto pt-1">
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Icon name="science" className="text-[14px]" />
          {project.experimentCount ?? 0}
        </span>
        <span className="text-xs text-slate-400">
          Updated {formatRelativeDate(project.updatedAt) || '\u2014'}
        </span>
      </div>

      {/* Delete confirmation overlay */}
      {confirming && (
        <div
          className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center gap-3 p-4"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-sm font-medium text-slate-800 text-center">Delete "{project.name}"?</p>
          <p className="text-xs text-slate-500 text-center">This action cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow-sm p-4 space-y-3 animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-3/4" />
          <div className="h-4 bg-slate-200 rounded w-1/4" />
          <div className="h-3 bg-slate-200 rounded w-full" />
          <div className="h-3 bg-slate-200 rounded w-2/3" />
          <div className="h-3 bg-slate-100 rounded w-1/3 mt-2" />
        </div>
      ))}
    </div>
  )
}

export default function Projects() {
  const navigate = useNavigate()
  const { activeLibraryId } = useLibrary()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    if (!activeLibraryId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    projectsApi.list({ library_id: activeLibraryId })
      .then(data => { setProjects(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [activeLibraryId])

  function handleDelete(id) {
    setProjects(ps => ps.filter(p => p.id !== id))
    window.dispatchEvent(new CustomEvent('researchos:projects-changed'))
  }

  function handleArchive(id, status) {
    setProjects(ps => ps.map(p => p.id === id ? { ...p, status } : p))
  }

  function handleCreated(project) {
    window.dispatchEvent(new CustomEvent('researchos:projects-changed'))
    navigate(`/projects/${project.id}`)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <h1 className="text-xl font-semibold text-slate-800">Projects</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Icon name="add" className="text-[18px]" />
          New Project
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Failed to load projects: {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : projects.length === 0 ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-6 pt-12">
          <Icon name="science" className="text-slate-300 text-[72px]" />
          <div>
            <h2 className="text-lg font-semibold text-slate-700 mb-1">Start your first research project</h2>
            <p className="text-sm text-slate-500 max-w-xs">
              Create a project to organize your research questions and experiments
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={handleDelete}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateProjectModal
          libraryId={activeLibraryId}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
