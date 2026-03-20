import { useState, useCallback } from 'react'
import { gapAnalysisApi } from '../services/api'
import SuggestionCard from './SuggestionCard'
import SuggestionDetailOverlay from './SuggestionDetailOverlay'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

/**
 * GapAnalysisTab — AI-powered planning board for discovering experiment gaps.
 *
 * Props:
 *   projectId            — project UUID
 *   flatExperiments      — flat array of experiments from parent (for context)
 *   onRefreshExperiments — callback to refresh experiment list after promoting
 */
export default function GapAnalysisTab({ projectId, flatExperiments, onRefreshExperiments }) {
  const [allSuggestions, setAllSuggestions] = useState([])
  const [visibleCount, setVisibleCount] = useState(0)
  const [dismissedIds, setDismissedIds] = useState([]) // stored as array, used as Set for lookup
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState(null)
  const [undoItem, setUndoItem] = useState(null) // { suggestion, timeoutId }

  const dismissedSet = new Set(dismissedIds)

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true)
    setVisibleCount(0)
    setError(null)

    try {
      const result = await gapAnalysisApi.analyze(projectId, { dismissedIds })
      setAllSuggestions(result)
      // Stagger card appearance
      result.forEach((_, i) => {
        setTimeout(() => setVisibleCount(i + 1), i * 150)
      })
    } catch (err) {
      setError(err.message || 'Gap analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }, [projectId, dismissedIds])

  const handleDismiss = useCallback((suggestion) => {
    // Clear existing undo timeout if any
    if (undoItem?.timeoutId) clearTimeout(undoItem.timeoutId)

    setDismissedIds(prev => [...prev, suggestion.id])

    const timeoutId = setTimeout(() => {
      setUndoItem(null)
    }, 4000)

    setUndoItem({ suggestion, timeoutId })
  }, [undoItem])

  const handleUndo = useCallback(() => {
    if (!undoItem) return
    clearTimeout(undoItem.timeoutId)
    setDismissedIds(prev => prev.filter(id => id !== undoItem.suggestion.id))
    setUndoItem(null)
  }, [undoItem])

  const handleSaveSuggestion = useCallback((updatedSuggestion) => {
    setAllSuggestions(prev =>
      prev.map(s => s.id === updatedSuggestion.id ? updatedSuggestion : s)
    )
    // Also update selectedSuggestion so overlay reflects saved state
    setSelectedSuggestion(updatedSuggestion)
  }, [])

  // Compute visible suggestions: not dismissed, sliced to stagger count
  const visibleSuggestions = allSuggestions
    .filter(s => !dismissedSet.has(s.id))
    .slice(0, visibleCount)

  const hasResults = allSuggestions.length > 0
  const showEmpty = !analyzing && !hasResults && !error

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header row */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          <Icon name="psychology" className="text-[18px] text-purple-600" />
          <h3 className="text-sm font-semibold text-slate-800">Gap Analysis</h3>
          {hasResults && (
            <span className="text-xs text-slate-400">
              {allSuggestions.length - dismissedIds.filter(id => allSuggestions.some(s => s.id === id)).length} suggestion{allSuggestions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {analyzing ? (
            <>
              <svg className="animate-spin text-[16px] w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Analyzing...
            </>
          ) : (
            <>
              <Icon name="psychology" className="text-[16px]" />
              {hasResults ? 'Re-run Analysis' : 'Analyze Gaps'}
            </>
          )}
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {error && (
          <div className="border border-red-100 rounded-lg p-4 text-center mb-4">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={handleAnalyze}
              className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium underline"
            >
              Try again
            </button>
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Icon name="psychology" className="text-slate-300 text-[48px] mb-3" />
            <p className="text-sm font-medium text-slate-500 mb-1">Discover missing experiments</p>
            <p className="text-xs text-slate-400 mb-4 max-w-xs">
              AI will analyze your existing experiments and suggest missing baselines, ablations, sweeps, and replications.
            </p>
            <button
              onClick={handleAnalyze}
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Icon name="psychology" className="text-[16px]" />
              Analyze Gaps
            </button>
          </div>
        )}

        {analyzing && !hasResults && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-slate-100 rounded-lg h-24" />
            ))}
          </div>
        )}

        {visibleSuggestions.length > 0 && (
          <div className="space-y-3">
            {visibleSuggestions.map((suggestion, index) => (
              <div
                key={suggestion.id}
                className="transition-all duration-300 ease-out"
                style={{
                  opacity: index < visibleCount ? 1 : 0,
                  transform: index < visibleCount ? 'translateY(0)' : 'translateY(8px)',
                }}
              >
                <SuggestionCard
                  suggestion={suggestion}
                  onDismiss={handleDismiss}
                  onClick={() => setSelectedSuggestion(suggestion)}
                />
              </div>
            ))}
          </div>
        )}

        {hasResults && !analyzing && allSuggestions.every(s => dismissedSet.has(s.id)) && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Icon name="check_circle" className="text-emerald-400 text-[36px] mb-2" />
            <p className="text-sm text-slate-500">All suggestions reviewed</p>
            <button
              onClick={handleAnalyze}
              className="mt-3 text-xs text-purple-600 hover:text-purple-700 font-medium"
            >
              Run fresh analysis
            </button>
          </div>
        )}
      </div>

      {/* Undo toast */}
      {undoItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          <span>Suggestion dismissed</span>
          <button
            onClick={handleUndo}
            className="font-medium text-purple-300 hover:text-purple-200 transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {/* Detail overlay */}
      {selectedSuggestion && (
        <SuggestionDetailOverlay
          suggestion={selectedSuggestion}
          onClose={() => setSelectedSuggestion(null)}
          onSave={handleSaveSuggestion}
          onPromote={(updatedSuggestion) => {
            // Plan 03 will wire this to DnD promote; for now just close
            setSelectedSuggestion(null)
          }}
        />
      )}
    </div>
  )
}
