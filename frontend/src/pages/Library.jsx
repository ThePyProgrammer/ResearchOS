import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { papersApi, websitesApi, searchApi, notesApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'
import PaperInfoPanel, { statusConfig, NamedLinks, CollectionsPicker, EditableField, EditableTextArea, AuthorChips } from '../components/PaperInfoPanel'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}


function lastName(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1]
}

function formatAuthors(authors) {
  if (!authors || authors.length === 0) return ''
  if (authors.length === 1) return lastName(authors[0])
  if (authors.length === 2) return `${lastName(authors[0])} & ${lastName(authors[1])}`
  return `${lastName(authors[0])} et al.`
}

function itemYear(item) {
  if (item.publishedDate) return item.publishedDate.slice(0, 4)
  if (item.itemType === 'website') return '—'
  return item.year || '—'
}

function itemVenue(item) {
  if (item.itemType === 'website') {
    try { return new URL(item.url).hostname.replace(/^www\./, '') } catch { return item.url }
  }
  return item.venue || ''
}

function PaperRow({ item, selected, checked, onSelect, onCheck, onItemUpdate }) {
  const status = statusConfig[item.status] || statusConfig['inbox']
  const isWebsite = item.itemType === 'website'
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingYear, setEditingYear] = useState(false)
  const [yearDraft, setYearDraft] = useState('')

  const api = isWebsite ? websitesApi : papersApi

  const saveTitle = () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== item.title) {
      api.update(item.id, { title: trimmed })
        .then(updated => onItemUpdate?.(updated))
        .catch(console.error)
    }
    setEditingTitle(false)
  }

  const saveYear = () => {
    const val = yearDraft.trim()
    const newDate = val || null
    if (newDate !== (item.publishedDate || null)) {
      const updates = { publishedDate: newDate }
      if (!isWebsite && val && val.length >= 4) {
        updates.year = parseInt(val.substring(0, 4), 10) || item.year
      }
      api.update(item.id, updates)
        .then(updated => onItemUpdate?.(updated))
        .catch(console.error)
    }
    setEditingYear(false)
  }

  return (
    <tr
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/researchos-item', JSON.stringify({ id: item.id, itemType: item.itemType || 'paper', collections: item.collections }))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onSelect(item)}
      className={`cursor-pointer transition-colors ${
        selected ? 'bg-blue-50' : checked ? 'bg-blue-50/50' : 'hover:bg-slate-50'
      }`}
    >
      <td className="pl-4 pr-2 py-3 w-8">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-blue-600"
          checked={checked}
          onChange={() => onCheck(item)}
          onClick={e => e.stopPropagation()}
        />
      </td>
      <td className="px-2 py-3">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.class}`}>
          {status.label}
        </span>
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          {editingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              onBlur={saveTitle}
              className="text-sm font-medium text-slate-800 bg-white border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex-1 min-w-0"
            />
          ) : (
            <span
              className="text-sm font-medium text-slate-800 line-clamp-1"
              onDoubleClick={e => { e.stopPropagation(); setTitleDraft(item.title); setEditingTitle(true) }}
              title="Double-click to edit"
            >
              {item.title}
            </span>
          )}
          {isWebsite && (
            <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              Website
            </span>
          )}
          {!isWebsite && item.source === 'agent' && (
            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              Run #{item.agentRun?.runNumber}
            </span>
          )}
          {!isWebsite && (!item.pdfUrl || !item.pdfUrl.includes('/storage/v1/object/public/pdfs/')) && (
            <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-medium flex-shrink-0 flex items-center gap-0.5" title="No PDF in storage">
              <Icon name="picture_as_pdf" className="text-[10px]" />
              No PDF
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-3 text-sm text-slate-500 max-w-[160px]">
        <span className="truncate block">{formatAuthors(item.authors)}</span>
      </td>
      <td className="px-2 py-3 text-sm text-slate-500">
        {editingYear ? (
          <input
            autoFocus
            type="date"
            value={yearDraft}
            onChange={e => setYearDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') saveYear()
              if (e.key === 'Escape') setEditingYear(false)
            }}
            onBlur={saveYear}
            className="w-36 px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        ) : (
          <span
            onDoubleClick={e => {
              e.stopPropagation()
              setYearDraft(item.publishedDate || '')
              setEditingYear(true)
            }}
            title="Double-click to edit"
            className="cursor-default"
          >
            {itemYear(item)}
          </span>
        )}
      </td>
      <td className="px-2 py-3 text-sm text-slate-500 max-w-[140px]">
        <span className="truncate block">{itemVenue(item)}</span>
      </td>
      <td className="px-3 py-3 text-sm text-slate-400">
        {isWebsite ? (
          <Icon name="link" className="text-[16px] text-teal-400" />
        ) : item.source === 'agent' ? (
          <Icon name="smart_toy" className="text-[16px] text-purple-400" />
        ) : (
          <Icon name="person" className="text-[16px] text-slate-300" />
        )}
      </td>
    </tr>
  )
}


function PaperDetail({ paper, onClose, onStatusChange, onPaperUpdate, onDelete }) {
  const [tab, setTab] = useState('info')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generatingNotes, setGeneratingNotes] = useState(false)
  const [notesGenerated, setNotesGenerated] = useState(false)
  const [notesError, setNotesError] = useState(null)
  const [fetchingPdf, setFetchingPdf] = useState(false)
  const [fetchPdfError, setFetchPdfError] = useState(null)
  const { activeLibrary, activeLibraryId } = useLibrary()
  const navigate = useNavigate()

  const hasPdfInStorage = paper.pdfUrl?.includes('/storage/v1/object/public/pdfs/')
  const hasExternalPdf = paper.pdfUrl && !hasPdfInStorage

  const handleFetchPdf = async () => {
    setFetchingPdf(true)
    setFetchPdfError(null)
    try {
      const updated = await papersApi.fetchPdf(paper.id)
      onPaperUpdate(updated)
    } catch (err) {
      setFetchPdfError(err.message || 'Failed to fetch PDF')
    } finally {
      setFetchingPdf(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await papersApi.remove(paper.id)
      onDelete(paper.id)
    } catch (err) {
      console.error('Failed to delete paper:', err)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const statusCfg = statusConfig[paper.status] || statusConfig['inbox']

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusCfg.class}`}>
            {statusCfg.label}
          </span>
          {paper.source === 'agent' && (
            <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <Icon name="smart_toy" className="text-[11px]" />
              Agent
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete paper"
          >
            <Icon name="delete" className="text-[16px]" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-xs font-semibold mb-1">Delete this paper?</p>
          <p className="text-red-600 text-xs mb-3">This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Title + quick actions */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{paper.title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ` +${paper.authors.length - 3} more` : ''}
            {paper.year ? <span className="text-slate-400"> · {paper.year}</span> : null}
          </p>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/library/paper/${paper.id}`)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Icon name="article" className="text-[14px]" />
              Open Paper
            </button>
            {paper.arxivId && (
              <a
                href={`https://arxiv.org/abs/${paper.arxivId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                title={`arXiv:${paper.arxivId}`}
              >
                arXiv
              </a>
            )}
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                title={`DOI: ${paper.doi}`}
              >
                DOI
              </a>
            )}
          </div>

          {/* Fetch PDF to storage */}
          {!hasPdfInStorage && hasExternalPdf && (
            <div className="space-y-1.5">
              <button
                onClick={handleFetchPdf}
                disabled={fetchingPdf}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
              >
                {fetchingPdf ? (
                  <>
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full" />
                    Fetching PDF...
                  </>
                ) : (
                  <>
                    <Icon name="cloud_download" className="text-[14px]" />
                    Fetch PDF to Storage
                  </>
                )}
              </button>
              {fetchPdfError && (
                <p className="text-[11px] text-red-500 text-center">{fetchPdfError}</p>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {['info', 'notes', 'graph'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors capitalize tracking-wide ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <PaperInfoPanel
            paper={paper}
            onStatusChange={onStatusChange}
            onPaperUpdate={onPaperUpdate}
          />
        )}

        {tab === 'notes' && (
          <div className="p-4 space-y-3">
            {activeLibrary?.autoNoteEnabled && (
              <div className="border border-blue-100 bg-blue-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Icon name="auto_awesome" className="text-[14px] text-blue-500" />
                  <p className="text-xs font-semibold text-blue-700">AI Auto-Note-Taker</p>
                </div>
                {notesGenerated ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                      <Icon name="check_circle" className="text-[13px]" />
                      Notes generated successfully
                    </p>
                    <button
                      onClick={() => navigate(`/library/paper/${paper.id}`)}
                      className="w-full py-1.5 text-[11px] font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Open in editor →
                    </button>
                  </div>
                ) : (
                  <>
                    {notesError && (
                      <p className="text-[11px] text-red-600">{notesError}</p>
                    )}
                    <button
                      onClick={async () => {
                        setGeneratingNotes(true)
                        setNotesError(null)
                        try {
                          await notesApi.generate(paper.id, activeLibraryId)
                          setNotesGenerated(true)
                        } catch (err) {
                          setNotesError(err.message)
                        } finally {
                          setGeneratingNotes(false)
                        }
                      }}
                      disabled={generatingNotes}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 text-white text-[11px] font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {generatingNotes ? (
                        <>
                          <span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Icon name="auto_awesome" className="text-[13px]" />
                          Generate AI Notes
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-blue-500/70">
                      Uses your library's custom instructions.
                    </p>
                  </>
                )}
              </div>
            )}
            {!activeLibrary?.autoNoteEnabled && (
              <p className="text-xs text-slate-400 text-center py-6">No notes yet.</p>
            )}
            <button
              onClick={() => navigate(`/library/paper/${paper.id}`)}
              className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              Open note editor →
            </button>
          </div>
        )}

        {tab === 'graph' && (
          <div className="p-4">
            <div className="h-40 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200">
              <p className="text-xs text-slate-400">Citation graph coming soon</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function WebsiteDetail({ item, onClose, onStatusChange, onUpdate, onDelete }) {
  const [tab, setTab] = useState('info')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingGithub, setEditingGithub] = useState(false)
  const [githubDraft, setGithubDraft] = useState('')
  const [generatingNotes, setGeneratingNotes] = useState(false)
  const [notesGenerated, setNotesGenerated] = useState(false)
  const [notesError, setNotesError] = useState(null)
  const { activeLibrary, activeLibraryId } = useLibrary()
  const navigate = useNavigate()

  const domain = (() => { try { return new URL(item.url).hostname.replace(/^www\./, '') } catch { return item.url } })()
  const statusCfg = statusConfig[item.status] || statusConfig['inbox']

  const handleStatusChange = async (newStatus) => {
    try {
      await websitesApi.update(item.id, { status: newStatus })
      onStatusChange(item.id, newStatus)
    } catch (err) { console.error(err) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await websitesApi.remove(item.id)
      onDelete(item.id)
    } catch (err) { console.error(err); setDeleting(false); setConfirmDelete(false) }
  }

  const handleFieldSave = async (field, value) => {
    try {
      const updated = await websitesApi.update(item.id, { [field]: value })
      onUpdate(updated)
    } catch (err) { console.error(err) }
  }

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusCfg.class}`}>
            {statusCfg.label}
          </span>
          <span className="text-[11px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
            <Icon name="link" className="text-[11px]" />
            Website
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
            <Icon name="delete" className="text-[16px]" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-xs font-semibold mb-1">Delete this website?</p>
          <p className="text-red-600 text-xs mb-3">This cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Title + authors + actions */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{item.title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {item.authors.length > 0
              ? <>{item.authors.slice(0, 3).join(', ')}{item.authors.length > 3 ? ` +${item.authors.length - 3} more` : ''}</>
              : <span className="italic">No author</span>
            }
            {item.publishedDate ? <span className="text-slate-400"> · {item.publishedDate.slice(0, 4)}</span> : null}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/library/website/${item.id}`)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Icon name="link" className="text-[14px]" />
              Open Website
            </button>
            {item.githubUrl && (
              <a href={item.githubUrl} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                <Icon name="code" className="text-[14px]" />
                GitHub
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {['info', 'notes'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors capitalize tracking-wide ${
                tab === t ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-400 hover:text-slate-600'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="p-4 space-y-5">
            {/* Authors */}
            <AuthorChips authors={item.authors || []} onSave={v => handleFieldSave('authors', v)} />

            {/* Metadata */}
            <div className="space-y-2">
              <EditableField label="Date" value={item.publishedDate} type="date" placeholder=""
                onSave={v => handleFieldSave('publishedDate', v)} />
              <div className="flex gap-3 text-xs">
                <span className="text-slate-400 w-12 flex-shrink-0 pt-px">Domain</span>
                <a href={item.url} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline truncate">{domain}</a>
              </div>
              <EditableField label="URL" value={item.url} placeholder="https://…" mono
                onSave={v => handleFieldSave('url', v)} />
            </div>

            {/* Status */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Status</p>
              <div className="flex gap-1.5">
                {['inbox', 'to-read', 'read'].map(s => {
                  const cfg = statusConfig[s]
                  return (
                    <button key={s} onClick={() => handleStatusChange(s)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${cfg.class} ${
                        item.status === s ? 'ring-2 ring-offset-1 ring-current' : 'opacity-50 hover:opacity-80'
                      }`}>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Collections */}
            <CollectionsPicker
              item={item}
              onUpdate={onUpdate}
              updateFn={(id, data) => websitesApi.update(id, data)}
            />

            {/* Description */}
            <EditableTextArea
              label="Description"
              value={item.description}
              placeholder="Add description…"
              onSave={v => handleFieldSave('description', v)}
            />

            {/* Links */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Links</p>
              <div className="space-y-2">
                {/* Named links */}
                <NamedLinks
                  links={item.links || []}
                  onSave={links => handleFieldSave('links', links)}
                />
                {/* GitHub link field */}
                {editingGithub ? (
                  <div className="flex gap-1.5 items-center">
                    <Icon name="code" className="text-[15px] text-slate-400 flex-shrink-0" />
                    <input autoFocus type="url" value={githubDraft} onChange={e => setGithubDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { handleFieldSave('github_url', githubDraft.trim() || null); setEditingGithub(false) }
                        if (e.key === 'Escape') setEditingGithub(false)
                      }}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono"
                    />
                    <button onClick={() => { handleFieldSave('github_url', githubDraft.trim() || null); setEditingGithub(false) }}
                      className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 flex-shrink-0">Save</button>
                    <button onClick={() => setEditingGithub(false)}
                      className="px-2 py-1 text-slate-400 text-xs rounded-lg hover:bg-slate-100 flex-shrink-0">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <Icon name="code" className="text-[15px] text-slate-400 flex-shrink-0" />
                    {item.githubUrl ? (
                      <>
                        <a href={item.githubUrl} target="_blank" rel="noreferrer"
                          className="flex-1 text-xs text-blue-600 hover:underline truncate font-mono" title={item.githubUrl}>
                          {item.githubUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')}
                        </a>
                        <button onClick={() => { setGithubDraft(item.githubUrl || ''); setEditingGithub(true) }}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 flex-shrink-0 transition-opacity">
                          <Icon name="edit" className="text-[13px]" />
                        </button>
                        <button onClick={() => handleFieldSave('github_url', null)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 flex-shrink-0 transition-opacity">
                          <Icon name="close" className="text-[13px]" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setGithubDraft(''); setEditingGithub(true) }}
                        className="text-xs text-slate-400 hover:text-blue-600 transition-colors">
                        Add GitHub URL…
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            {item.tags?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map(tag => (
                    <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div className="p-4 space-y-3">
            {activeLibrary?.autoNoteEnabled && (
              <div className="border border-teal-100 bg-teal-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Icon name="auto_awesome" className="text-[14px] text-teal-500" />
                  <p className="text-xs font-semibold text-teal-700">AI Auto-Note-Taker</p>
                </div>
                {notesGenerated ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                      <Icon name="check_circle" className="text-[13px]" />
                      Notes generated successfully
                    </p>
                    <button
                      onClick={() => navigate(`/library/website/${item.id}`)}
                      className="w-full py-1.5 text-[11px] font-medium text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                    >
                      Open in editor →
                    </button>
                  </div>
                ) : (
                  <>
                    {notesError && (
                      <p className="text-[11px] text-red-600">{notesError}</p>
                    )}
                    <button
                      onClick={async () => {
                        setGeneratingNotes(true)
                        setNotesError(null)
                        try {
                          await notesApi.generateForWebsite(item.id, activeLibraryId)
                          setNotesGenerated(true)
                        } catch (err) {
                          setNotesError(err.message)
                        } finally {
                          setGeneratingNotes(false)
                        }
                      }}
                      disabled={generatingNotes}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-teal-600 text-white text-[11px] font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                      {generatingNotes ? (
                        <>
                          <span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Icon name="auto_awesome" className="text-[13px]" />
                          Generate AI Notes
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-teal-500/70">
                      Uses your library's custom instructions.
                    </p>
                  </>
                )}
              </div>
            )}
            {!activeLibrary?.autoNoteEnabled && (
              <p className="text-xs text-slate-400 text-center py-6">No notes yet.</p>
            )}
            <button
              onClick={() => navigate(`/library/website/${item.id}`)}
              className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-teal-300 hover:text-teal-600 transition-colors"
            >
              Open note editor →
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

export default function Library() {
  const { activeLibraryId, collections, refreshCollections } = useLibrary()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedItem, setSelectedItem] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [pdfFilter, setPdfFilter] = useState('all') // 'all' | 'has_pdf' | 'no_pdf'
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveSearch, setMoveSearch] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkMoving, setBulkMoving] = useState(false)
  const [showFetchModal, setShowFetchModal] = useState(false)
  const [fetchStatuses, setFetchStatuses] = useState({}) // { paperId: 'pending' | 'fetching' | 'done' | 'skipped' | error string }

  // Listen for item changes from sidebar drag-drop
  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1)
    window.addEventListener('researchos:items-changed', handler)
    return () => window.removeEventListener('researchos:items-changed', handler)
  }, [])
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [titleFilter, setTitleFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')
  const [tagFilters, setTagFilters] = useState(new Set())
  const [sortKey, setSortKey] = useState(null)   // 'title' | 'date' | 'authors' | null
  const [sortDir, setSortDir] = useState('asc')  // 'asc' | 'desc'
  const location = useLocation()

  // Derive active filters from URL — URL is the single source of truth
  const activeCollection = searchParams.get('col') || 'all'
  const filterTab = searchParams.get('status') || 'all'
  const urlQuery = searchParams.get('q') || ''
  const urlMode = searchParams.get('mode') || 'lexical'
  // Helper: build next params preserving fields we want to keep
  function navParams({ col, status, q, mode } = {}) {
    const p = {}
    const nextCol = col !== undefined ? col : activeCollection
    const nextStatus = status !== undefined ? status : filterTab
    if (nextCol && nextCol !== 'all') p.col = nextCol
    if (nextStatus && nextStatus !== 'all') p.status = nextStatus
    if (q) { p.q = q; p.mode = mode || 'lexical' }
    return p
  }


  // Re-fetch all items whenever search query or active library changes
  useEffect(() => {
    setLoading(true)
    setError(null)

    setSelectedIds(new Set())
    const listParams = activeLibraryId ? { library_id: activeLibraryId } : {}

    if (urlQuery) {
      searchApi.query(urlQuery, { mode: urlMode, limit: 50 })
        .then(data => setItems(data))
        .catch(() => {
          setSearchParams({})
          Promise.all([papersApi.list(listParams), websitesApi.list(listParams)])
            .then(([papers, websites]) => setItems([...papers, ...websites]))
            .catch(err => setError(err.message))
        })
        .finally(() => setLoading(false))
    } else {
      Promise.all([papersApi.list(listParams), websitesApi.list(listParams)])
        .then(([papers, websites]) => setItems([...papers, ...websites]))
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [urlQuery, urlMode, location.key, activeLibraryId, refreshKey])

  const handleStatusChange = (itemId, newStatus) => {
    setItems(prev => prev.map(p => p.id === itemId ? { ...p, status: newStatus } : p))
    if (selectedItem?.id === itemId) setSelectedItem(prev => ({ ...prev, status: newStatus }))
  }

  const handleItemUpdate = (updated) => {
    setItems(prev => prev.map(p => p.id === updated.id ? updated : p))
    if (selectedItem?.id === updated.id) setSelectedItem(updated)
  }

  const handleDelete = (itemId) => {
    setItems(prev => prev.filter(p => p.id !== itemId))
    setSelectedItem(null)
    refreshCollections()
  }

  const toggleCheck = (item) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(item.id) ? next.delete(item.id) : next.add(item.id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)))
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      const toDelete = items.filter(i => selectedIds.has(i.id))
      await Promise.all(toDelete.map(i => {
        const api = i.itemType === 'website' ? websitesApi : papersApi
        return api.remove(i.id)
      }))
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)))
      if (selectedItem && selectedIds.has(selectedItem.id)) setSelectedItem(null)
      setSelectedIds(new Set())
      setShowDeleteModal(false)
      refreshCollections()
    } catch (err) {
      console.error('Bulk delete failed:', err)
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleBulkMove = async (collectionId) => {
    setBulkMoving(true)
    try {
      const toMove = items.filter(i => selectedIds.has(i.id))
      const updated = await Promise.all(toMove.map(i => {
        const api = i.itemType === 'website' ? websitesApi : papersApi
        const newCollections = i.collections.includes(collectionId)
          ? i.collections
          : [...i.collections, collectionId]
        return api.update(i.id, { collections: newCollections })
      }))
      setItems(prev => prev.map(i => {
        const u = updated.find(x => x.id === i.id)
        return u || i
      }))
      if (selectedItem && selectedIds.has(selectedItem.id)) {
        const u = updated.find(x => x.id === selectedItem.id)
        if (u) setSelectedItem(u)
      }
      setSelectedIds(new Set())
      setShowMoveModal(false)
      setMoveSearch('')
      refreshCollections()
    } catch (err) {
      console.error('Bulk move failed:', err)
    } finally {
      setBulkMoving(false)
    }
  }

  const handleBulkFetchPdfs = async () => {
    const selected = items.filter(i => selectedIds.has(i.id) && i.itemType !== 'website')
    // Build initial statuses
    const initial = {}
    for (const item of selected) {
      if (!item.pdfUrl) {
        initial[item.id] = 'no_url'
      } else if (item.pdfUrl.includes('/storage/v1/object/public/pdfs/')) {
        initial[item.id] = 'skipped'
      } else {
        initial[item.id] = 'pending'
      }
    }
    setFetchStatuses(initial)
    setShowFetchModal(true)

    const toFetch = selected.filter(i => initial[i.id] === 'pending')
    for (const item of toFetch) {
      setFetchStatuses(prev => ({ ...prev, [item.id]: 'fetching' }))
      try {
        const updated = await papersApi.fetchPdf(item.id)
        setItems(prev => prev.map(p => p.id === updated.id ? updated : p))
        if (selectedItem?.id === updated.id) setSelectedItem(updated)
        setFetchStatuses(prev => ({ ...prev, [item.id]: 'done' }))
      } catch (err) {
        setFetchStatuses(prev => ({ ...prev, [item.id]: err.message || 'Failed' }))
      }
    }
  }

  const allTags = useMemo(() => [...new Set(items.flatMap(p => p.tags))].sort(), [items])
  const activeFilterCount = (sourceFilter !== 'all' ? 1 : 0)
    + (pdfFilter !== 'all' ? 1 : 0)
    + (yearFrom || yearTo ? 1 : 0)
    + (titleFilter ? 1 : 0)
    + (venueFilter ? 1 : 0)
    + tagFilters.size

  const filtered = useMemo(() => {
    let result = urlQuery ? items : items.filter(p => filterTab === 'all' || p.status === filterTab)
    if (activeCollection === 'inbox') result = result.filter(p => p.status === 'inbox')
    else if (activeCollection === 'unfiled') result = result.filter(p => p.collections.length === 0)
    else if (activeCollection === 'duplicates') {
      const buckets = new Map()
      const addBucket = (key, id) => {
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(id)
      }
      for (const item of items) {
        if (item.doi) addBucket(`doi:${item.doi.trim().toLowerCase()}`, item.id)
        if (item.arxivId) addBucket(`arxiv:${item.arxivId.trim().toLowerCase()}`, item.id)
        if (item.url) {
          try {
            const u = new URL(item.url)
            addBucket(`url:${(u.hostname + u.pathname).replace(/\/$/, '').toLowerCase()}`, item.id)
          } catch {}
        }
        if (item.title) addBucket(`title:${item.title.trim().toLowerCase().replace(/\s+/g, ' ')}`, item.id)
      }
      const dupIds = new Set()
      for (const ids of buckets.values()) {
        if (ids.length >= 2) ids.forEach(id => dupIds.add(id))
      }
      result = result.filter(i => dupIds.has(i.id))
    }
    else if (activeCollection !== 'all') result = result.filter(p => p.collections.includes(activeCollection))
    if (sourceFilter !== 'all') result = result.filter(p => p.source === sourceFilter)
    if (pdfFilter === 'has_pdf') result = result.filter(p => p.pdfUrl?.includes('/storage/v1/object/public/pdfs/'))
    if (pdfFilter === 'no_pdf') result = result.filter(p => !p.pdfUrl || !p.pdfUrl.includes('/storage/v1/object/public/pdfs/'))
    if (titleFilter) result = result.filter(p => p.title.toLowerCase().includes(titleFilter.toLowerCase()))
    if (venueFilter) result = result.filter(p => itemVenue(p).toLowerCase().includes(venueFilter.toLowerCase()))
    if (yearFrom) result = result.filter(p => Number(itemYear(p)) >= Number(yearFrom))
    if (yearTo) result = result.filter(p => Number(itemYear(p)) <= Number(yearTo))
    if (tagFilters.size > 0) result = result.filter(p => [...tagFilters].every(t => p.tags.includes(t)))
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1
      result = [...result].sort((a, b) => {
        if (sortKey === 'title') {
          return dir * a.title.localeCompare(b.title)
        }
        if (sortKey === 'date') {
          const da = a.publishedDate || ''
          const db = b.publishedDate || ''
          if (!da && !db) return 0
          if (!da) return dir
          if (!db) return -dir
          return dir * da.localeCompare(db)
        }
        if (sortKey === 'authors') {
          return dir * formatAuthors(a.authors).localeCompare(formatAuthors(b.authors))
        }
        return 0
      })
    }
    return result
  }, [items, urlQuery, filterTab, activeCollection, sourceFilter, pdfFilter, titleFilter, venueFilter, yearFrom, yearTo, tagFilters, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function clearFilters() {
    setSourceFilter('all')
    setPdfFilter('all')
    setYearFrom('')
    setYearTo('')
    setTitleFilter('')
    setVenueFilter('')
    setTagFilters(new Set())
  }

  function toggleTag(tag) {
    setTagFilters(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          {urlQuery && (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium border ${
                urlMode === 'semantic'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}>
                <Icon name={urlMode === 'semantic' ? 'auto_awesome' : 'search'} className="text-[14px]" />
                <span>"{urlQuery}"</span>
                {urlMode === 'semantic' && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold ml-1">
                    Semantic
                  </span>
                )}
                <button
                  onClick={() => setSearchParams(navParams({ q: undefined }))}
                  className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Clear search"
                >
                  <Icon name="close" className="text-[14px]" />
                </button>
              </div>
              <span className="text-xs text-slate-400">{items.length} result{items.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Filter panel */}
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">

              {/* Status */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Status</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all', label: 'All', count: items.length },
                    { id: 'inbox', label: 'Inbox', count: items.filter(p => p.status === 'inbox').length },
                    { id: 'to-read', label: 'To Read', count: items.filter(p => p.status === 'to-read').length },
                    { id: 'read', label: 'Read', count: items.filter(p => p.status === 'read').length },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSearchParams(navParams({ status: opt.id }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        filterTab === opt.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                      <span className={`text-[10px] font-bold px-1 rounded ${
                        filterTab === opt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>{opt.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Source */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Source</span>
                <div className="flex gap-1.5">
                  {[
                    { id: 'all', label: 'All', count: items.length },
                    { id: 'human', label: 'Human', count: items.filter(p => p.source === 'human').length },
                    { id: 'agent', label: 'Agent', count: items.filter(p => p.source === 'agent').length },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSourceFilter(opt.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        sourceFilter === opt.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                      <span className={`text-[10px] font-bold px-1 rounded ${
                        sourceFilter === opt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>{opt.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* PDF */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">PDF</span>
                <div className="flex gap-1.5">
                  {[
                    { id: 'all', label: 'All', count: items.length },
                    { id: 'has_pdf', label: 'Has PDF', count: items.filter(p => p.pdfUrl?.includes('/storage/v1/object/public/pdfs/')).length },
                    { id: 'no_pdf', label: 'No PDF', count: items.filter(p => !p.pdfUrl || !p.pdfUrl.includes('/storage/v1/object/public/pdfs/')).length },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setPdfFilter(opt.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        pdfFilter === opt.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                      <span className={`text-[10px] font-bold px-1 rounded ${
                        pdfFilter === opt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>{opt.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Title</span>
                <div className="relative flex-1">
                  <Icon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={titleFilter}
                    onChange={e => setTitleFilter(e.target.value)}
                    placeholder="Filter by title…"
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  {titleFilter && (
                    <button onClick={() => setTitleFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <Icon name="close" className="text-[13px]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Venue */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Venue</span>
                <div className="relative flex-1">
                  <Icon name="location_on" className="absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={venueFilter}
                    onChange={e => setVenueFilter(e.target.value)}
                    placeholder="e.g. NeurIPS, arXiv…"
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  {venueFilter && (
                    <button onClick={() => setVenueFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <Icon name="close" className="text-[13px]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Year range */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0">Year</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={yearFrom}
                    onChange={e => setYearFrom(e.target.value)}
                    placeholder="From"
                    min="1900" max="2100"
                    className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <span className="text-slate-300 text-sm">—</span>
                  <input
                    type="number"
                    value={yearTo}
                    onChange={e => setYearTo(e.target.value)}
                    placeholder="To"
                    min="1900" max="2100"
                    className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
              </div>

              {/* Tags */}
              {allTags.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14 flex-shrink-0 pt-1">Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          tagFilters.has(tag)
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="mt-3 text-xs text-slate-400 hover:text-red-500 transition-colors">
                Clear all filters
              </button>
            )}
          </div>

        {error && (
          <div className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b border-red-100">
            Failed to load papers: {error}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200">
            <span className="text-xs font-semibold text-blue-700">
              {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setShowMoveModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Icon name="library_add" className="text-[14px]" />
                Add to Collection...
              </button>
              <button
                onClick={handleBulkFetchPdfs}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Icon name="cloud_download" className="text-[14px]" />
                Fetch PDFs
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                <Icon name="delete" className="text-[14px]" />
                Delete All
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                title="Clear selection"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="animate-pulse p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 bg-slate-100 rounded" />
              ))}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="pl-4 pr-2 py-2.5 w-8">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 transition-colors" onClick={() => toggleSort('title')}>
                    <span className="flex items-center gap-1">
                      Title
                      {sortKey === 'title' && <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-600" />}
                    </span>
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 transition-colors" onClick={() => toggleSort('authors')}>
                    <span className="flex items-center gap-1">
                      Authors
                      {sortKey === 'authors' && <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-600" />}
                    </span>
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 transition-colors" onClick={() => toggleSort('date')}>
                    <span className="flex items-center gap-1">
                      Date
                      {sortKey === 'date' && <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="text-[12px] text-blue-600" />}
                    </span>
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Venue</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(item => (
                  <PaperRow
                    key={item.id}
                    item={item}
                    selected={selectedItem?.id === item.id}
                    checked={selectedIds.has(item.id)}
                    onSelect={i => setSelectedItem(selectedItem?.id === i.id ? null : i)}
                    onCheck={toggleCheck}
                    onItemUpdate={updated => {
                      setItems(prev => prev.map(it => it.id === updated.id ? { ...it, ...updated } : it))
                      if (selectedItem?.id === updated.id) setSelectedItem(s => ({ ...s, ...updated }))
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Icon name="search_off" className="text-[48px] mb-3" />
              <p className="text-sm">No papers match the current filter.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-white text-sm text-slate-500">
          <span>
            {urlQuery
              ? `${items.length} search result${items.length !== 1 ? 's' : ''} for "${urlQuery}"`
              : `Showing ${filtered.length} of ${items.length} item${items.length !== 1 ? 's' : ''}`}
          </span>
          <div className="flex items-center gap-1">
            <button className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40" disabled>
              <Icon name="chevron_left" className="text-[18px]" />
            </button>
            <span className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium">1</span>
            <button className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40" disabled>
              <Icon name="chevron_right" className="text-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {selectedItem && selectedItem.itemType === 'website' && (
        <WebsiteDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStatusChange={handleStatusChange}
          onUpdate={handleItemUpdate}
          onDelete={handleDelete}
        />
      )}
      {selectedItem && selectedItem.itemType !== 'website' && (
        <PaperDetail
          paper={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStatusChange={handleStatusChange}
          onPaperUpdate={handleItemUpdate}
          onDelete={handleDelete}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !bulkDeleting && setShowDeleteModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[400px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Icon name="delete" className="text-[20px] text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Delete {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''}?</h3>
                <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone. All selected papers and websites will be permanently removed.</p>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto mb-4 border border-slate-100 rounded-lg">
              {items.filter(i => selectedIds.has(i.id)).map(i => (
                <div key={i.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 border-b border-slate-50 last:border-0">
                  <Icon name={i.itemType === 'website' ? 'link' : 'description'} className="text-[14px] text-slate-400 flex-shrink-0" />
                  <span className="truncate">{i.title}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={bulkDeleting}
                className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to collection modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { if (!bulkMoving) { setShowMoveModal(false); setMoveSearch('') } }}>
          <div className="bg-white rounded-xl shadow-xl w-[360px]" onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">
                Add {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} to collection
              </p>
              <div className="relative">
                <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={moveSearch}
                  onChange={e => setMoveSearch(e.target.value)}
                  placeholder="Search collections..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white"
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setShowMoveModal(false); setMoveSearch('') }
                  }}
                />
              </div>
            </div>
            {bulkMoving ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full mr-2" />
                <span className="text-sm">Moving...</span>
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto border-t border-slate-100">
                {(() => {
                  const matches = collections.filter(c =>
                    c.name.toLowerCase().includes(moveSearch.toLowerCase())
                  )
                  if (matches.length === 0) {
                    return (
                      <div className="px-4 py-6 text-center text-xs text-slate-400">
                        {collections.length === 0 ? 'No collections yet.' : 'No matching collections.'}
                      </div>
                    )
                  }
                  return matches.map(col => (
                    <button
                      key={col.id}
                      onClick={() => handleBulkMove(col.id)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-blue-50 transition-colors group"
                    >
                      <Icon name="folder" className="text-[16px] text-slate-400 group-hover:text-blue-500" />
                      <span className="text-sm text-slate-700 group-hover:text-blue-700 truncate flex-1">{col.name}</span>
                      {col.paperCount != null && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">{col.paperCount}</span>
                      )}
                    </button>
                  ))
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fetch PDFs modal */}
      {showFetchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => {}}>
          <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Fetching PDFs</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {(() => {
                    const vals = Object.values(fetchStatuses)
                    const done = vals.filter(s => s === 'done').length
                    const failed = vals.filter(s => s !== 'done' && s !== 'pending' && s !== 'fetching' && s !== 'skipped' && s !== 'no_url').length
                    const total = vals.filter(s => s !== 'skipped' && s !== 'no_url').length
                    const inProgress = vals.some(s => s === 'fetching' || s === 'pending')
                    if (!inProgress) return `Complete — ${done} succeeded, ${failed} failed`
                    return `${done + failed} of ${total} processed...`
                  })()}
                </p>
              </div>
              {!Object.values(fetchStatuses).some(s => s === 'fetching' || s === 'pending') && (
                <button
                  onClick={() => { setShowFetchModal(false); setFetchStatuses({}) }}
                  className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              )}
            </div>

            {/* Progress bar */}
            {(() => {
              const vals = Object.values(fetchStatuses)
              const total = vals.filter(s => s !== 'skipped' && s !== 'no_url').length
              const completed = vals.filter(s => s !== 'pending' && s !== 'fetching' && s !== 'skipped' && s !== 'no_url').length
              const pct = total > 0 ? (completed / total) * 100 : 0
              return (
                <div className="mx-5 mb-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )
            })()}

            <div className="flex-1 overflow-y-auto border-t border-slate-100 divide-y divide-slate-50">
              {items.filter(i => i.id in fetchStatuses).map(item => {
                const status = fetchStatuses[item.id]
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {status === 'pending' && <Icon name="schedule" className="text-[16px] text-slate-300" />}
                      {status === 'fetching' && <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full" />}
                      {status === 'done' && <Icon name="check_circle" className="text-[16px] text-emerald-500" />}
                      {status === 'skipped' && <Icon name="skip_next" className="text-[16px] text-slate-300" />}
                      {status === 'no_url' && <Icon name="link_off" className="text-[16px] text-slate-300" />}
                      {status !== 'pending' && status !== 'fetching' && status !== 'done' && status !== 'skipped' && status !== 'no_url' && (
                        <Icon name="error" className="text-[16px] text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {status === 'pending' && 'Waiting...'}
                        {status === 'fetching' && 'Downloading PDF...'}
                        {status === 'done' && 'Uploaded to storage'}
                        {status === 'skipped' && 'Already in storage'}
                        {status === 'no_url' && 'No PDF URL available'}
                        {status !== 'pending' && status !== 'fetching' && status !== 'done' && status !== 'skipped' && status !== 'no_url' && status}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-5 py-3 border-t border-slate-100">
              <button
                onClick={() => { setShowFetchModal(false); setFetchStatuses({}) }}
                disabled={Object.values(fetchStatuses).some(s => s === 'fetching' || s === 'pending')}
                className="w-full py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {Object.values(fetchStatuses).some(s => s === 'fetching' || s === 'pending') ? 'Processing...' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
