import WindowModal from './WindowModal'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const STATUS_ICON = {
  pending:    { icon: 'schedule',      class: 'text-slate-400' },
  processing: { icon: 'progress_activity', class: 'text-blue-500 animate-spin' },
  done:       { icon: 'check_circle',  class: 'text-emerald-500' },
  skipped:    { icon: 'skip_next',     class: 'text-slate-400' },
  cancelled:  { icon: 'block',         class: 'text-slate-400' },
}

function getStatusDisplay(status) {
  if (!status || status === 'pending') return STATUS_ICON.pending
  if (status === 'processing') return STATUS_ICON.processing
  if (status === 'done') return STATUS_ICON.done
  if (status === 'skipped') return STATUS_ICON.skipped
  if (status === 'cancelled') return STATUS_ICON.cancelled
  // Any other string is an error message
  return { icon: 'error', class: 'text-red-500', errorMsg: status }
}

export default function BulkProgressModal({
  open, onClose, title, iconName,
  items, statuses,
  isRunning, isPaused,
  onPause, onResume, onCancel, onRetryFailed,
  failedCount = 0,
}) {
  if (!open) return null

  const total = items.length
  const doneCount = items.filter(i => statuses[i.id] === 'done').length
  const skippedCount = items.filter(i => statuses[i.id] === 'skipped').length
  const errorCount = items.filter(i => {
    const s = statuses[i.id]
    return s && s !== 'pending' && s !== 'processing' && s !== 'done' && s !== 'skipped' && s !== 'cancelled'
  }).length
  const processedCount = doneCount + errorCount + skippedCount
  const progressPct = total > 0 ? Math.round((processedCount / total) * 100) : 0
  const isDone = !isRunning && processedCount > 0

  const summaryText = isRunning
    ? `${processedCount} of ${total} processed...`
    : `Complete — ${doneCount} succeeded${errorCount > 0 ? `, ${errorCount} failed` : ''}${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`

  return (
    <WindowModal
      open={open}
      title={title || 'Batch Processing'}
      onClose={onClose}
      iconName={iconName || 'pending_actions'}
      iconWrapClassName="bg-purple-100"
      iconClassName="text-[16px] text-purple-600"
      disableClose={false}
      closeOnBackdrop={false}
      allowMinimize={false}
      allowFullscreen={false}
      normalPanelClassName="w-full max-w-lg rounded-2xl"
    >
      <div className="px-5 py-4 space-y-3">
        {/* Summary */}
        <p className="text-sm text-slate-700 font-medium">{summaryText}</p>

        {/* Progress bar */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${errorCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Per-item list */}
        <div className="max-h-64 overflow-y-auto space-y-1 border border-slate-100 rounded-lg p-2">
          {items.map(item => {
            const display = getStatusDisplay(statuses[item.id])
            return (
              <div key={item.id} className="flex items-center gap-2 py-1 px-1">
                <Icon name={display.icon} className={`text-[16px] flex-shrink-0 ${display.class}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 truncate">{item.title || item.name || item.id}</p>
                  {display.errorMsg && (
                    <p className="text-[10px] text-red-500 truncate">{display.errorMsg}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          {isRunning && !isPaused && (
            <>
              <button
                onClick={onPause}
                className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
              >
                Pause
              </button>
              <button
                onClick={onCancel}
                className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          {isRunning && isPaused && (
            <>
              <button
                onClick={onResume}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Resume
              </button>
              <button
                onClick={onCancel}
                className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          {isDone && failedCount > 0 && (
            <button
              onClick={onRetryFailed}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Retry {failedCount} Failed
            </button>
          )}
          {(isDone || (!isRunning && processedCount === 0)) && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </WindowModal>
  )
}
