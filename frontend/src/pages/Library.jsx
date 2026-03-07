import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { papersApi, websitesApi, searchApi, notesApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'
import PaperInfoPanel, { statusConfig, NamedLinks, CollectionsPicker } from '../components/PaperInfoPanel'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}


function itemYear(item) {
  if (item.itemType === 'website') {
    return item.publishedDate ? item.publishedDate.slice(0, 4) : '—'
  }
  return item.year || '—'
}

function itemVenue(item) {
  if (item.itemType === 'website') {
    try { return new URL(item.url).hostname.replace(/^www\./, '') } catch { return item.url }
  }
  return item.venue || ''
}

function PaperRow({ item, selected, onSelect }) {
  const status = statusConfig[item.status] || statusConfig['inbox']
  const isWebsite = item.itemType === 'website'

  return (
    <tr
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/researchos-item', JSON.stringify({ id: item.id, itemType: item.itemType || 'paper', collections: item.collections }))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onSelect(item)}
      className={`cursor-pointer transition-colors ${
        selected ? 'bg-blue-50' : 'hover:bg-slate-50'
      }`}
    >
      <td className="pl-4 pr-2 py-3 w-8">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-blue-600"
          checked={selected}
          onChange={() => onSelect(item)}
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
          <span className="text-sm font-medium text-slate-800 line-clamp-1">{item.title}</span>
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
        </div>
      </td>
      <td className="px-2 py-3 text-sm text-slate-500 max-w-[160px]">
        <span className="truncate block">{item.authors.slice(0, 2).join(', ')}{item.authors.length > 2 ? ', et al.' : ''}</span>
      </td>
      <td className="px-2 py-3 text-sm text-slate-500">{itemYear(item)}</td>
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
  const { activeLibrary, activeLibraryId } = useLibrary()
  const navigate = useNavigate()

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
  const [descExpanded, setDescExpanded] = useState(false)
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
            {/* Metadata */}
            <div className="space-y-2">
              {item.publishedDate && (
                <div className="flex gap-3 text-xs">
                  <span className="text-slate-400 w-12 flex-shrink-0 pt-px">Date</span>
                  <span className="text-slate-700">{item.publishedDate}</span>
                </div>
              )}
              <div className="flex gap-3 text-xs">
                <span className="text-slate-400 w-12 flex-shrink-0 pt-px">Domain</span>
                <a href={item.url} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline truncate">{domain}</a>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-slate-400 w-12 flex-shrink-0 pt-px">URL</span>
                <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate font-mono" title={item.url}>{item.url}</a>
              </div>
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
            {item.description && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Description</p>
                <p className={`text-xs text-slate-600 leading-relaxed ${descExpanded ? '' : 'line-clamp-4'}`}>
                  {item.description}
                </p>
                <button onClick={() => setDescExpanded(e => !e)}
                  className="mt-1.5 text-[11px] text-teal-600 hover:text-teal-700 font-medium transition-colors">
                  {descExpanded ? 'Show less' : 'Read more'}
                </button>
              </div>
            )}

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
  const { activeLibraryId, refreshCollections } = useLibrary()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedItem, setSelectedItem] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [refreshKey, setRefreshKey] = useState(0)

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


  const allTags = useMemo(() => [...new Set(items.flatMap(p => p.tags))].sort(), [items])
  const activeFilterCount = (sourceFilter !== 'all' ? 1 : 0)
    + (yearFrom || yearTo ? 1 : 0)
    + (titleFilter ? 1 : 0)
    + (venueFilter ? 1 : 0)
    + tagFilters.size

  const filtered = useMemo(() => {
    let result = urlQuery ? items : items.filter(p => filterTab === 'all' || p.status === filterTab)
    if (activeCollection === 'inbox') result = result.filter(p => p.status === 'inbox')
    else if (activeCollection === 'unfiled') result = result.filter(p => p.collections.length === 0)
    else if (activeCollection !== 'all') result = result.filter(p => p.collections.includes(activeCollection))
    if (sourceFilter !== 'all') result = result.filter(p => p.source === sourceFilter)
    if (titleFilter) result = result.filter(p => p.title.toLowerCase().includes(titleFilter.toLowerCase()))
    if (venueFilter) result = result.filter(p => itemVenue(p).toLowerCase().includes(venueFilter.toLowerCase()))
    if (yearFrom) result = result.filter(p => Number(itemYear(p)) >= Number(yearFrom))
    if (yearTo) result = result.filter(p => Number(itemYear(p)) <= Number(yearTo))
    if (tagFilters.size > 0) result = result.filter(p => [...tagFilters].every(t => p.tags.includes(t)))
    return result
  }, [items, urlQuery, filterTab, activeCollection, sourceFilter, titleFilter, venueFilter, yearFrom, yearTo, tagFilters])

  function clearFilters() {
    setSourceFilter('all')
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
                    <input type="checkbox" className="rounded border-slate-300" />
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Authors</th>
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Year</th>
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
                    onSelect={i => setSelectedItem(selectedItem?.id === i.id ? null : i)}
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
    </div>
  )
}
