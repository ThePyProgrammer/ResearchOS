import { useState } from 'react'
import { createPortal } from 'react-dom'
import { papersApi } from '../services/api'
import WindowModal from './WindowModal'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export function parseBibtexEntries(text) {
  const entries = []
  const re = /@(\w+)\{([^,]+),\s*([\s\S]*?)\n\}/g
  let m
  while ((m = re.exec(text)) !== null) {
    const type = m[1]
    const key = m[2].trim()
    const body = m[3]
    const fields = []
    const fieldRe = /\s*(\w+)\s*=\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g
    let fm
    while ((fm = fieldRe.exec(body)) !== null) {
      fields.push({ key: fm[1], value: fm[2] })
    }
    entries.push({ type, key, fields, collapsed: false })
  }
  return entries
}

export function serializeBibtexEntries(entries) {
  return entries.map(entry => {
    const fields = entry.fields
      .filter(f => f.key.trim() && f.value.trim())
      .map(f => `  ${f.key}={${f.value}}`)
      .join(',\n')
    return `@${entry.type}{${entry.key},\n${fields}\n}`
  }).join('\n\n') + '\n'
}

const BIBTEX_FIELD_SUGGESTIONS = [
  'title', 'author', 'year', 'journal', 'booktitle', 'doi', 'eprint',
  'abstract', 'url', 'volume', 'number', 'pages', 'publisher', 'month',
  'note', 'keywords', 'issn', 'isbn',
]

/**
 * BibtexExportModal — reusable export modal.
 *
 * Props:
 *   open           {boolean}
 *   onClose        {() => void}
 *   fetchParams    {object}  — passed directly to papersApi.exportBibtex
 *                              e.g. { collectionId } or { ids }
 */
export default function BibtexExportModal({ open, onClose, fetchParams }) {
  const [exportEntries, setExportEntries] = useState([])
  const [exportLoading, setExportLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  // Fetch when opened
  if (open && !fetched && !exportLoading) {
    setExportLoading(true)
    setFetched(true)
    papersApi.exportBibtex(fetchParams)
      .then(text => setExportEntries(parseBibtexEntries(text)))
      .catch(() => setExportEntries([]))
      .finally(() => setExportLoading(false))
  }

  function handleClose() {
    setExportEntries([])
    setFetched(false)
    onClose()
  }

  if (!open) return null

  return createPortal(
    <WindowModal
      open={open}
      onClose={handleClose}
      title="Export BibTeX"
      iconName="download"
      iconWrapClassName="bg-green-100"
      iconClassName="text-[16px] text-green-600"
      normalPanelClassName="w-full max-w-2xl max-h-[80vh] rounded-xl"
      bodyClassName="flex flex-col min-h-0"
    >
      <div className="flex flex-col min-h-0 flex-1">
        {exportLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg className="animate-spin w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm text-slate-500">Generating BibTeX...</span>
          </div>
        ) : (
          <>
            {/* Header with count + actions */}
            <div className="px-5 pt-3 pb-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {exportEntries.length} {exportEntries.length === 1 ? 'entry' : 'entries'}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setExportEntries(prev => prev.map(e => ({ ...e, collapsed: true })))}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Icon name="unfold_less" className="text-[13px]" />
                  Collapse all
                </button>
                <button
                  onClick={() => setExportEntries(prev => prev.map(e => ({ ...e, collapsed: false })))}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Icon name="unfold_more" className="text-[13px]" />
                  Expand all
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(serializeBibtexEntries(exportEntries))}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Icon name="content_copy" className="text-[13px]" />
                  Copy all
                </button>
              </div>
            </div>

            {/* Tree view */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-2">
              {exportEntries.map((entry, ei) => (
                <div key={ei} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {/* Entry header - collapsible */}
                  <button
                    onClick={() => setExportEntries(prev => prev.map((e, i) => i === ei ? { ...e, collapsed: !e.collapsed } : e))}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <Icon
                      name={entry.collapsed ? 'chevron_right' : 'expand_more'}
                      className="text-[16px] text-slate-400 flex-shrink-0"
                    />
                    <span className="text-[11px] font-mono text-slate-400 flex-shrink-0">@{entry.type}</span>
                    <input
                      type="text"
                      value={entry.key}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = e.target.value
                        setExportEntries(prev => prev.map((en, i) => i === ei ? { ...en, key: val } : en))
                      }}
                      spellCheck={false}
                      className="text-xs font-mono font-semibold text-slate-700 bg-transparent border-none outline-none flex-1 min-w-0 focus:text-blue-700"
                    />
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {entry.fields.length} field{entry.fields.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setExportEntries(prev => prev.filter((_, i) => i !== ei)) }}
                      className="p-0.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Remove entry"
                    >
                      <Icon name="close" className="text-[14px]" />
                    </button>
                  </button>

                  {/* Fields */}
                  {!entry.collapsed && (
                    <div className="divide-y divide-slate-100">
                      {entry.fields.map((field, fi) => (
                        <div key={fi} className="flex items-start gap-2 px-3 py-1.5 group">
                          <input
                            type="text"
                            value={field.key}
                            onChange={(e) => {
                              const val = e.target.value
                              setExportEntries(prev => prev.map((en, i) =>
                                i === ei ? { ...en, fields: en.fields.map((f, j) => j === fi ? { ...f, key: val } : f) } : en
                              ))
                            }}
                            spellCheck={false}
                            className="w-24 flex-shrink-0 text-[11px] font-mono text-slate-500 bg-transparent border-none outline-none text-right pr-1 focus:text-blue-600"
                          />
                          <span className="text-[11px] text-slate-300 flex-shrink-0 pt-px">=</span>
                          <textarea
                            value={field.value}
                            onChange={(e) => {
                              const val = e.target.value
                              setExportEntries(prev => prev.map((en, i) =>
                                i === ei ? { ...en, fields: en.fields.map((f, j) => j === fi ? { ...f, value: val } : f) } : en
                              ))
                            }}
                            rows={field.value.length > 80 || field.value.includes('\n') ? 3 : 1}
                            spellCheck={false}
                            className="flex-1 text-[11px] font-mono text-slate-700 bg-transparent border-none outline-none resize-none leading-relaxed focus:text-blue-700"
                          />
                          <button
                            onClick={() => {
                              setExportEntries(prev => prev.map((en, i) =>
                                i === ei ? { ...en, fields: en.fields.filter((_, j) => j !== fi) } : en
                              ))
                            }}
                            className="p-0.5 text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                            title="Remove field"
                          >
                            <Icon name="close" className="text-[12px]" />
                          </button>
                        </div>
                      ))}

                      {/* Add field */}
                      <div className="px-3 py-1.5">
                        <button
                          onClick={() => {
                            const usedKeys = new Set(entry.fields.map(f => f.key))
                            const suggestion = BIBTEX_FIELD_SUGGESTIONS.find(k => !usedKeys.has(k)) || 'field'
                            setExportEntries(prev => prev.map((en, i) =>
                              i === ei ? { ...en, fields: [...en.fields, { key: suggestion, value: '' }] } : en
                            ))
                          }}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Icon name="add" className="text-[14px]" />
                          Add field
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
        <button
          onClick={handleClose}
          className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            const text = serializeBibtexEntries(exportEntries)
            const blob = new Blob([text], { type: 'application/x-bibtex' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'researchos-export.bib'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
          }}
          disabled={exportLoading || exportEntries.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Icon name="download" className="text-[16px]" />
          Download .bib
        </button>
      </div>
    </WindowModal>,
    document.body
  )
}
