import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import PaperChipPopover from './PaperChipPopover'

/**
 * SuggestionCard — compact card for a single gap analysis suggestion.
 *
 * Props:
 *   suggestion       — GapSuggestion object from API
 *   onDismiss        — callback(suggestion) when X button is clicked
 *   onClick          — callback() when card body is clicked (opens detail overlay)
 *   isDragging       — boolean, true when used as DragOverlay ghost (Plan 03)
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

export default function SuggestionCard({ suggestion, onDismiss, onClick, isDragging = false }) {
  // DnD: each card is draggable. The PointerSensor's distance:5 constraint
  // distinguishes a click (<5px) from a drag (>=5px).
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging: dndDragging,
  } = useDraggable({
    id: suggestion.id,
    data: { suggestion },
    // When used as a DragOverlay ghost, suggestion.id may be undefined — guard:
    disabled: !suggestion?.id,
  })

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

  const [activePopover, setActivePopover] = useState(null) // { paperId, rect }

  const isCurrentlyDragging = isDragging || dndDragging

  return (
    <>
    <div
      ref={setNodeRef}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={`bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer select-none ${isCurrentlyDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Top row: type badge + dismiss button */}
          <div className="flex items-center justify-between mb-1.5">
            <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${typeConfig.class}`}>
              {typeConfig.label}
            </span>
            {onDismiss && (
              <button
                onClick={e => { e.stopPropagation(); onDismiss(suggestion) }}
                className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0 ml-2"
                title="Dismiss suggestion"
              >
                <Icon name="close" className="text-[14px]" />
              </button>
            )}
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

          {/* Paper reference chips — clickable with popover */}
          {paperRefs.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {paperRefs.map((ref, i) => {
                const pid = ref.paperId || ref.paper_id
                return (
                  <button
                    key={pid || i}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setActivePopover(prev => prev?.paperId === pid ? null : { paperId: pid, rect })
                    }}
                    className="bg-amber-50 text-amber-700 text-xs rounded px-1.5 py-0.5 hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    {ref.displayLabel || ref.display_label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    {activePopover && (
      <PaperChipPopover
        paperId={activePopover.paperId}
        displayLabel=""
        anchorRect={activePopover.rect}
        onClose={() => setActivePopover(null)}
      />
    )}
    </>
  )
}
