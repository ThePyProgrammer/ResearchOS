import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { librariesApi, settingsApi } from '../services/api'

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

function ModelSelector({ role, description, current, chatModels, embeddingModels, onChange }) {
  const isEmbedding = role === 'embedding'
  const models = isEmbedding ? embeddingModels : chatModels

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <div className="min-w-0 flex-1 mr-4">
        <p className="text-sm font-medium text-slate-700">{description}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{role}</p>
      </div>
      <select
        value={current}
        onChange={e => onChange(role, e.target.value)}
        className="w-56 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
      >
        {models.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
        {/* show current if not in list (e.g. search-preview model) */}
        {!models.some(m => m.id === current) && (
          <option value={current}>{current}</option>
        )}
      </select>
    </div>
  )
}

export default function LibrarySettings() {
  const navigate = useNavigate()
  const { activeLibrary, updateLibrary, deleteLibrary } = useLibrary()

  const [name, setName] = useState(activeLibrary?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // AI Auto-Note-Taker settings
  const [autoNoteEnabled, setAutoNoteEnabled] = useState(activeLibrary?.autoNoteEnabled ?? false)
  const [autoNotePrompt, setAutoNotePrompt] = useState(activeLibrary?.autoNotePrompt ?? '')
  const [savingNoteSettings, setSavingNoteSettings] = useState(false)
  const [noteSettingsSaved, setNoteSettingsSaved] = useState(false)

  // Model settings
  const [modelConfig, setModelConfig] = useState(null)
  const [modelCurrent, setModelCurrent] = useState({})
  const [savingModels, setSavingModels] = useState(false)
  const [modelsSaved, setModelsSaved] = useState(false)
  const [modelsError, setModelsError] = useState(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  function loadModels(refresh = false) {
    setModelsError(null)
    settingsApi.getModels({ refresh }).then(data => {
      setModelConfig(data)
      setModelCurrent(prev => {
        // Preserve any user edits, only reset if loading for the first time
        if (!prev || Object.keys(prev).length === 0) return data.current
        return prev
      })
    }).catch(err => setModelsError(err.message))
  }

  useEffect(() => { loadModels() }, [])

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

  async function handleSaveNoteSettings(e) {
    e.preventDefault()
    setSavingNoteSettings(true)
    setNoteSettingsSaved(false)
    try {
      await updateLibrary(activeLibrary.id, {
        auto_note_enabled: autoNoteEnabled,
        auto_note_prompt: autoNotePrompt.trim() || null,
      })
      setNoteSettingsSaved(true)
      setTimeout(() => setNoteSettingsSaved(false), 2500)
    } finally {
      setSavingNoteSettings(false)
    }
  }

  function handleModelChange(role, modelId) {
    setModelCurrent(prev => ({ ...prev, [role]: modelId }))
    setModelsSaved(false)
  }

  async function handleSaveModels(e) {
    e.preventDefault()
    setSavingModels(true)
    setModelsSaved(false)
    setModelsError(null)
    try {
      const result = await settingsApi.updateModels(modelCurrent)
      setModelCurrent(result.current)
      setModelsSaved(true)
      setTimeout(() => setModelsSaved(false), 2500)
    } catch (err) {
      setModelsError(err.message)
    } finally {
      setSavingModels(false)
    }
  }

  function handleResetModels() {
    if (modelConfig?.defaults) {
      setModelCurrent(modelConfig.defaults)
      setModelsSaved(false)
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
                {saving ? 'Saving...' : 'Save changes'}
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

        {/* AI Auto-Note-Taker */}
        <SettingsSection
          title="AI Auto-Note-Taker"
          description="When enabled, you can generate an AI-written overview note for any paper with one click."
        >
          <form onSubmit={handleSaveNoteSettings} className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={autoNoteEnabled}
                  onChange={e => setAutoNoteEnabled(e.target.checked)}
                />
                <div className="w-9 h-5 bg-slate-200 rounded-full peer-checked:bg-blue-600 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                  Enable AI Auto-Note-Taker
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Adds a "Generate AI Notes" button to every paper's Notes tab.
                </p>
              </div>
            </label>

            <div className={autoNoteEnabled ? '' : 'opacity-50 pointer-events-none'}>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Custom instructions <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={4}
                value={autoNotePrompt}
                onChange={e => { setAutoNotePrompt(e.target.value); setNoteSettingsSaved(false) }}
                placeholder={`e.g. "Focus on methodology and experimental results. Highlight limitations. Format with a TL;DR at the top."`}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-slate-300"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                This prompt is appended to the base note-taking instructions for every generated note in this library.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingNoteSettings}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {savingNoteSettings ? 'Saving...' : 'Save settings'}
              </button>
              {noteSettingsSaved && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <Icon name="check_circle" className="text-[15px]" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </SettingsSection>

        {/* AI Model Configuration */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">AI Model Configuration</h2>
              <p className="text-xs text-slate-500 mt-0.5">Choose which OpenAI model powers each AI feature. Changes apply globally across all libraries.</p>
            </div>
            <button
              type="button"
              onClick={() => loadModels(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              title="Refresh model list from OpenAI API"
            >
              <Icon name="refresh" className="text-[14px]" />
              Refresh
            </button>
          </div>
          <div className="px-6 py-5">
            {modelsError && !modelConfig && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Failed to load model settings: {modelsError}
              </div>
            )}
            {!modelConfig && !modelsError && (
              <div className="text-sm text-slate-400 animate-pulse">Loading model settings...</div>
            )}
            {modelConfig && (
              <form onSubmit={handleSaveModels} className="space-y-2">
                <p className="text-[11px] text-slate-400 mb-3">
                  {modelConfig.available_chat_models.length} chat models and {modelConfig.available_embedding_models.length} embedding models available from your OpenAI account.
                </p>

                {Object.entries(modelConfig.descriptions).map(([role, desc]) => (
                  <ModelSelector
                    key={role}
                    role={role}
                    description={desc}
                    current={modelCurrent[role] || modelConfig.defaults[role]}
                    chatModels={modelConfig.available_chat_models}
                    embeddingModels={modelConfig.available_embedding_models}
                    onChange={handleModelChange}
                  />
                ))}

                {modelsError && (
                  <p className="text-xs text-red-500 mt-2">{modelsError}</p>
                )}

                <div className="flex items-center gap-3 pt-3">
                  <button
                    type="submit"
                    disabled={savingModels}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {savingModels ? 'Saving...' : 'Save model settings'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetModels}
                    className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Reset to defaults
                  </button>
                  {modelsSaved && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <Icon name="check_circle" className="text-[15px]" />
                      Saved
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

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
                    {deleting ? 'Deleting...' : 'Delete permanently'}
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
