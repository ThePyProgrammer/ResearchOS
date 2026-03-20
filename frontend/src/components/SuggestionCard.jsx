/**
 * SuggestionCard — compact card for a single gap analysis suggestion.
 *
 * Props:
 *   suggestion       — GapSuggestion object from API
 *   onDismiss        — callback(suggestion) when X button is clicked
 *   onClick          — callback() when card body is clicked (opens detail overlay)
 *   isDragging       — boolean, true during DnD drag (Plan 03)
 *   dragHandleProps  — spread onto drag indicator icon (Plan 03)
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

export default function SuggestionCard({ suggestion, onDismiss, onClick, isDragging = false, dragHandleProps = null }) {
  const typeConfig = TYPE_CONFIG[suggestion.gapType] || TYPE_CONFIG[suggestion.gap_type] || {
    label: suggestion.gapType || suggestion.gap_type || 'Unknown',
    class: 'bg-slate-100 text-slate-600',
  }

  // Config preview: show first 2 key-value pairs
  const configEntries = Object.entries(suggestion.suggestedConfig || {}).slice(0, 2)

  // Ablation params (only for ablation_gap type)
  const gapType = suggestion.gapType || suggestion.gap_type
  const ablationParams = suggestion.ablationParams || suggestion.ablation_params || []
  const showAblation = gapType === 'ablation_gap' && ablationParams.length > 0

  // Paper refs: max 2
  const paperRefs = (suggestion.paperRefs || suggestion.paper_refs || []).slice(0, 2)

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer select-none ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle (Plan 03) */}
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            onClick={e => e.stopPropagation()}
            className="mt-0.5 text-slate-300 hover:text-slate-500 flex-shrink-0 cursor-grab active:cursor-grabbing"
          >
            <Icon name="drag_indicator" className="text-[16px]" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          {/* Top row: type badge + dismiss button */}
          <div className="flex items-center justify-between mb-1.5">
            <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${typeConfig.class}`}>
              {typeConfig.label}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onDismiss(suggestion) }}
              className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0 ml-2"
              title="Dismiss suggestion"
            >
              <Icon name="close" className="text-[14px]" />
            </button>
          </div>

          {/* Name */}
          <p className="font-medium text-slate-800 text-sm leading-snug mb-1 truncate">
            {suggestion.name}
          </p>

          {/* Rationale */}
          <p className="text-xs text-slate-500 line-clamp-2 mb-2">
            {suggestion.rationale}
          </p>

          {/* Config preview chips */}
          {configEntries.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {configEntries.map(([key, value]) => (
                <span
                  key={key}
                  className="bg-slate-100 text-slate-600 text-xs rounded px-1.5 py-0.5"
                >
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          )}

          {/* Ablation unvaried params */}
          {showAblation && (
            <p className="text-xs text-blue-600 italic mb-2">
              Unvaried: {ablationParams.join(', ')}
            </p>
          )}

          {/* Paper reference chips */}
          {paperRefs.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {paperRefs.map((ref, i) => (
                <span
                  key={ref.paperId || ref.paper_id || i}
                  className="bg-amber-50 text-amber-700 text-xs rounded px-1.5 py-0.5"
                >
                  {ref.displayLabel || ref.display_label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
