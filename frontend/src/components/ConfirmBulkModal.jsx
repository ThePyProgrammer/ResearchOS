import WindowModal from './WindowModal'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const OP_CONFIG = {
  notes:      { title: 'Generate AI Notes', icon: 'auto_awesome', costPerItem: 0.02, skipLabel: 'notes' },
  tags:       { title: 'Auto-Tag Items',    icon: 'label',        costPerItem: 0.003, skipLabel: 'tags' },
  pdfs:       { title: 'Fetch PDFs',        icon: 'cloud_download', costPerItem: 0, skipLabel: 'PDFs' },
  embeddings: { title: 'Generate Embeddings', icon: 'memory',     costPerItem: 0.001, skipLabel: 'embeddings' },
}

export default function ConfirmBulkModal({ open, onClose, onConfirm, operation, items, skipCount = 0, concurrency, onConcurrencyChange }) {
  if (!open) return null
  const config = OP_CONFIG[operation] || OP_CONFIG.notes
  const processCount = items.length - skipCount
  const costEstimate = (processCount * config.costPerItem).toFixed(2)

  return (
    <WindowModal
      open={open}
      title={config.title}
      onClose={onClose}
      iconName={config.icon}
      iconWrapClassName="bg-purple-100"
      iconClassName="text-[16px] text-purple-600"
      allowMinimize={false}
      allowFullscreen={false}
      normalPanelClassName="w-full max-w-md rounded-2xl"
    >
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-2 text-sm text-slate-700">
          <p className="font-medium">{items.length} items selected</p>
          {skipCount > 0 && (
            <p className="text-slate-500">
              {skipCount} items will be skipped (already have {config.skipLabel})
            </p>
          )}
          <p>{processCount} items will be processed</p>
          {config.costPerItem > 0 && (
            <p className="text-xs text-slate-400">~${costEstimate} estimated OpenAI cost</p>
          )}
        </div>

        {/* Concurrency toggle */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Processing speed</p>
          <div className="flex gap-2">
            <button
              onClick={() => onConcurrencyChange(1)}
              className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                concurrency === 1
                  ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              Careful (1 at a time)
            </button>
            <button
              onClick={() => onConcurrencyChange(5)}
              className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                concurrency === 5
                  ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              Fast (5 concurrent)
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Start
          </button>
        </div>
      </div>
    </WindowModal>
  )
}
