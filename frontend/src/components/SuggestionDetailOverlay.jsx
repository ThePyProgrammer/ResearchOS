import { useState, useEffect } from 'react'
import PaperChipPopover from './PaperChipPopover'

/**
 * SuggestionDetailOverlay — right-side panel for viewing and editing a gap suggestion.
 *
 * Props:
 *   suggestion — GapSuggestion object
 *   onClose    — callback() to close the overlay
 *   onSave     — callback(updatedSuggestion) with merged edits
 *   onPromote  — callback(updatedSuggestion) to promote to experiment (Plan 03)
 */

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const TYPE_CONFIG = {
  missing_baseline: { label: 'Baseline',    class: 'bg-orange-100 text-orange-700' },
  ablation_gap:     { label: 'Ablation',    class: 'bg-blue-100 text-blue-700' },
  config_sweep:     { label: 'Sweep',       class: 'bg-green-100 text-green-700' },
  replication:      { label: 'Replication', class: 'bg-purple-100 text-purple-700' },
}

export default function SuggestionDetailOverlay({ suggestion, onClose, onSave, onPromote }) {
  const gapType = suggestion.gapType || suggestion.gap_type
  const typeConfig = TYPE_CONFIG[gapType] || { label: gapType || 'Unknown', class: 'bg-slate-100 text-slate-600' }

  const [name, setName] = useState(suggestion.name || '')
  const [rationale, setRationale] = useState(suggestion.rationale || '')
  const [configValues, setConfigValues] = useState({ ...(suggestion.suggestedConfig || {}) })

  // Sync state when suggestion prop changes (e.g. after save updates parent state)
  useEffect(() => {
    setName(suggestion.name || '')
    setRationale(suggestion.rationale || '')
    setConfigValues({ ...(suggestion.suggestedConfig || {}) })
  }, [suggestion.id])

  const ablationParams = suggestion.ablationParams || suggestion.ablation_params || []
  const paperRefs = suggestion.paperRefs || suggestion.paper_refs || []
  const [activePopover, setActivePopover] = useState(null)

  function buildUpdated() {
    return {
      ...suggestion,
      name,
      rationale,
      suggestedConfig: configValues,
    }
  }

  function handleSave() {
    onSave(buildUpdated())
  }

  function handlePromote() {
    onPromote(buildUpdated())
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Right panel */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-96 bg-white shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-start gap-3 px-4 py-4 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${typeConfig.class}`}>
                {typeConfig.label}
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-base font-medium text-slate-800 bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none pb-0.5 transition-colors"
              placeholder="Suggestion name"
            />
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
          {/* Rationale */}
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
              Rationale
            </label>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              rows={6}
              className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-y transition-colors leading-relaxed"
              placeholder="Why this experiment is needed..."
            />
          </div>

          {/* Config editor */}
          {Object.keys(configValues).length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                Suggested Config
              </label>
              <div className="space-y-2">
                {Object.entries(configValues).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono w-32 flex-shrink-0 truncate" title={key}>
                      {key}
                    </span>
                    <input
                      type="text"
                      value={String(value)}
                      onChange={e => {
                        const raw = e.target.value
                        // Preserve numeric/boolean types
                        let parsed = raw
                        if (raw === 'true') parsed = true
                        else if (raw === 'false') parsed = false
                        else if (raw !== '' && !isNaN(Number(raw))) parsed = Number(raw)
                        setConfigValues(prev => ({ ...prev, [key]: parsed }))
                      }}
                      className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 font-mono transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ablation params (read-only) */}
          {gapType === 'ablation_gap' && ablationParams.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                Unvaried Parameters
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ablationParams.map(param => (
                  <span
                    key={param}
                    className="bg-blue-50 text-blue-700 text-xs font-mono rounded px-2 py-0.5"
                  >
                    {param}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Paper references */}
          {paperRefs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                Supporting Papers
              </label>
              <div className="space-y-2">
                {paperRefs.map((ref, i) => {
                  const pid = ref.paperId || ref.paper_id
                  return (
                    <div key={pid || i} className="flex flex-col gap-0.5">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          setActivePopover(prev => prev?.paperId === pid ? null : { paperId: pid, rect })
                        }}
                        className="inline-flex self-start bg-amber-50 text-amber-700 text-xs rounded px-2 py-0.5 hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        {ref.displayLabel || ref.display_label}
                      </button>
                      {(ref.relevanceNote || ref.relevance_note) && (
                        <p className="text-xs text-slate-400 italic pl-1">
                          {ref.relevanceNote || ref.relevance_note}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              {activePopover && (
                <PaperChipPopover
                  paperId={activePopover.paperId}
                  displayLabel=""
                  anchorRect={activePopover.rect}
                  onClose={() => setActivePopover(null)}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="text-sm font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Changes
            </button>
            <button
              onClick={handlePromote}
              className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Icon name="add_circle" className="text-[15px]" />
              Promote
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
