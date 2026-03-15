import { useState } from 'react'
import { createPortal } from 'react-dom'
import { projectsApi } from '../services/api'
import WindowModal from './WindowModal'

export default function CreateProjectModal({ libraryId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const project = await projectsApi.create({
        name: name.trim(),
        description: description.trim() || null,
        library_id: libraryId,
      })
      onCreated(project)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return createPortal(
    <WindowModal
      open
      onClose={onClose}
      title="New Project"
      iconName="science"
      iconWrapClassName="bg-blue-100"
      iconClassName="text-[16px] text-blue-600"
      normalPanelClassName="w-full max-w-md rounded-xl"
      fullscreenPanelClassName="w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] rounded-xl"
    >
      <form onSubmit={handleSubmit} className="px-5 pb-5 pt-4 space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Project name *</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Attention Mechanisms Study"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What are you researching? (optional)"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </WindowModal>,
    document.body
  )
}
