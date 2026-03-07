import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function SettingsSection({ title, description, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

export default function LibrarySettings() {
  const navigate = useNavigate()
  const { activeLibrary, updateLibrary, deleteLibrary } = useLibrary()

  const [name, setName] = useState(activeLibrary?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (!activeLibrary) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No library selected.
      </div>
    )
  }

  async function handleSaveName(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === activeLibrary.name || saving) return
    setSaving(true)
    setSaveSuccess(false)
    try {
      await updateLibrary(activeLibrary.id, { name: trimmed })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (deleteConfirmText !== activeLibrary.name || deleting) return
    setDeleting(true)
    try {
      await deleteLibrary(activeLibrary.id)
      navigate('/library')
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <button
          onClick={() => navigate('/library')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-3"
        >
          <Icon name="arrow_back" className="text-[14px]" />
          Back to Library
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
            <Icon name="library_books" className="text-[20px] text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">{activeLibrary.name}</h1>
            <p className="text-xs text-slate-400">Library Settings</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">

        {/* General */}
        <SettingsSection
          title="General"
          description="Basic information about this library."
        >
          <form onSubmit={handleSaveName} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Library name</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setSaveSuccess(false) }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                placeholder="My Research Library"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={!name.trim() || name.trim() === activeLibrary.name || saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <Icon name="check_circle" className="text-[15px]" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </SettingsSection>

        {/* Danger zone */}
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100">
            <h2 className="text-sm font-semibold text-red-700">Danger Zone</h2>
            <p className="text-xs text-slate-500 mt-0.5">Irreversible actions. Proceed with caution.</p>
          </div>
          <div className="px-6 py-5">
            {!confirmDelete ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Delete this library</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Permanently removes the library and all its papers and collections.
                  </p>
                </div>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 ml-4"
                >
                  Delete library
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-700">
                  To confirm, type <span className="font-semibold text-slate-900">"{activeLibrary.name}"</span> below.
                </p>
                <input
                  autoFocus
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={activeLibrary.name}
                  className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleteConfirmText !== activeLibrary.name || deleting}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                  >
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); setDeleteConfirmText('') }}
                    className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
