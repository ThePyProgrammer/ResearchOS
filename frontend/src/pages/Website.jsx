import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { websitesApi, notesApi, papersApi } from '../services/api'
import { statusConfig, NamedLinks, EditableField, EditableTextArea, AuthorChips, TagChips } from '../components/PaperInfoPanel'
import NotesPanel from '../components/NotesPanel'
import CopilotPanel from '../components/CopilotPanel'
import { useDragResize } from '../hooks/useDragResize'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function WebsiteInfoPanel({ site, onUpdate, onStatusChange }) {
  const [editingGithub, setEditingGithub] = useState(false)
  const [githubDraft, setGithubDraft] = useState('')

  const domain = (() => { try { return new URL(site.url).hostname.replace(/^www\./, '') } catch { return site.url } })()

  const handleFieldSave = async (field, value) => {
    try {
      const updated = await websitesApi.update(site.id, { [field]: value })
      onUpdate(updated)
    } catch (err) { console.error(err) }
  }

  const handleStatusChange = async (newStatus) => {
    try {
      await websitesApi.update(site.id, { status: newStatus })
      onStatusChange(newStatus)
    } catch (err) { console.error(err) }
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      {/* Authors */}
      <AuthorChips authors={site.authors || []} onSave={v => handleFieldSave('authors', v)} />

      {/* Metadata */}
      <div className="space-y-2">
        <EditableField label="Date" value={site.publishedDate} type="date" placeholder=""
          onSave={v => handleFieldSave('publishedDate', v)} />
        <div className="flex gap-3 text-xs">
          <span className="text-slate-400 w-12 flex-shrink-0 pt-px">Domain</span>
          <a href={site.url} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline truncate">{domain}</a>
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
                  site.status === s ? 'ring-2 ring-offset-1 ring-current' : 'opacity-50 hover:opacity-80'
                }`}>
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Description */}
      <EditableTextArea
        label="Description"
        value={site.description}
        placeholder="Add description…"
        onSave={v => handleFieldSave('description', v)}
      />

      {/* Links */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Links</p>
        <div className="space-y-2">
          <NamedLinks
            links={site.links || []}
            onSave={links => handleFieldSave('links', links)}
          />
          {/* GitHub */}
          {editingGithub ? (
            <div className="flex gap-1.5 items-center">
              <Icon name="code" className="text-[15px] text-slate-400 flex-shrink-0" />
              <input
                autoFocus type="url" value={githubDraft}
                onChange={e => setGithubDraft(e.target.value)}
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
              {site.githubUrl ? (
                <>
                  <a href={site.githubUrl} target="_blank" rel="noreferrer"
                    className="flex-1 text-xs text-blue-600 hover:underline truncate font-mono" title={site.githubUrl}>
                    {site.githubUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')}
                  </a>
                  <button onClick={() => { setGithubDraft(site.githubUrl || ''); setEditingGithub(true) }}
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
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Tags</p>
        <TagChips
          tags={site.tags || []}
          onSave={v => handleFieldSave('tags', v)}
          chipClassName="bg-teal-100 text-teal-700"
        />
      </div>
    </div>
  )
}

export default function Website() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const handleBack = () => location.key !== 'default' ? navigate(-1) : navigate('/library')
  const [site, setSite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sideTab, setSideTab] = useState('details')
  const [notes, setNotes] = useState([])
  const [iframeError, setIframeError] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [bibtexCopied, setBibtexCopied] = useState(false)

  // Resize state
  const [leftWidth, setLeftWidth] = useState(null)
  const [copilotWidth, setCopilotWidth] = useState(320)
  const bodyRef = useRef(null)
  const notesAreaRef = useRef(null)
  const onMainDrag = useDragResize({ containerRef: bodyRef, setSize: setLeftWidth, minPx: 240, maxOffset: 240 })
  const onCopilotDrag = useDragResize({ containerRef: notesAreaRef, setSize: setCopilotWidth, reverse: true, minPx: 240, maxOffset: 200 })

  useEffect(() => {
    websitesApi.get(id)
      .then(setSite)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const loadNotes = useCallback(() => {
    notesApi.listForWebsite(id).then(setNotes).catch(console.error)
  }, [id])

  useEffect(() => { loadNotes() }, [loadNotes])

  const isNotes = sideTab === 'notes'

  async function handleCopyBibtex() {
    try {
      const bib = await papersApi.exportBibtex({ ids: [id] })
      await navigator.clipboard.writeText(bib)
      setBibtexCopied(true)
      setTimeout(() => setBibtexCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy BibTeX:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
          <button onClick={() => handleBack()} className="flex items-center gap-1 text-sm text-slate-500">
            <Icon name="arrow_back" className="text-[18px]" />
            Back
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-slate-400">Loading…</div>
        </div>
      </div>
    )
  }

  if (error || !site) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
          <button onClick={() => handleBack()} className="flex items-center gap-1 text-sm text-slate-500">
            <Icon name="arrow_back" className="text-[18px]" />
            Back
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
          {error || 'Website not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
        <button
          onClick={() => handleBack()}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          Back
        </button>
        <div className="h-4 border-l border-slate-200" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon name="link" className="text-[18px] text-teal-500 flex-shrink-0" />
          {editingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const trimmed = titleDraft.trim()
                  if (trimmed && trimmed !== site.title) {
                    websitesApi.update(site.id, { title: trimmed }).then(setSite).catch(console.error)
                  }
                  setEditingTitle(false)
                }
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              onBlur={() => {
                const trimmed = titleDraft.trim()
                if (trimmed && trimmed !== site.title) {
                  websitesApi.update(site.id, { title: trimmed }).then(setSite).catch(console.error)
                }
                setEditingTitle(false)
              }}
              className="text-sm font-medium text-slate-700 bg-white border border-teal-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30 flex-1 min-w-0"
            />
          ) : (
            <span
              className="text-sm font-medium text-slate-700 truncate cursor-default"
              onDoubleClick={() => { setTitleDraft(site.title); setEditingTitle(true) }}
              title="Double-click to edit"
            >
              {site.title}
            </span>
          )}
          <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
            Website
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={handleCopyBibtex}
            title="Copy BibTeX citation"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors text-xs font-medium"
          >
            <Icon name={bibtexCopied ? 'check' : 'content_copy'} className="text-[15px]" />
            {bibtexCopied ? 'Copied!' : 'BibTeX'}
          </button>
          {site.githubUrl && (
            <a href={site.githubUrl} target="_blank" rel="noreferrer" title="GitHub repository"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex items-center">
              <Icon name="code" className="text-[18px]" />
            </a>
          )}
          <a href={site.url} target="_blank" rel="noreferrer" title="Open website"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex items-center">
            <Icon name="open_in_new" className="text-[18px]" />
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" ref={bodyRef}>
        {/* Website iframe panel */}
        <div
          className="flex flex-col overflow-hidden"
          style={isNotes
            ? { width: leftWidth ?? '55%', minWidth: 240, flexShrink: 0 }
            : { flex: 1, borderRight: '1px solid #e2e8f0' }}
        >
          {/* iframe toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <Icon name="language" className="text-[14px] text-slate-400" />
            <span className="truncate font-mono">{site.url}</span>
            <a href={site.url} target="_blank" rel="noreferrer"
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 transition-colors flex-shrink-0 text-slate-600">
              <Icon name="open_in_new" className="text-[12px]" />
              New tab
            </a>
          </div>

          {/* iframe or blocked fallback */}
          {iframeError ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-4 p-8 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                <Icon name="block" className="text-[36px] text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">This site can't be displayed in a frame</p>
                <p className="text-xs text-slate-400 mb-4">
                  The site has blocked embedding via X-Frame-Options or CSP.
                </p>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Icon name="open_in_new" className="text-[15px]" />
                  Open in new tab
                </a>
              </div>
            </div>
          ) : (
            <iframe
              src={site.url}
              title={site.title}
              className="flex-1 border-0 w-full"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onError={() => setIframeError(true)}
            />
          )}
        </div>

        {/* Main resize handle — notes tab only */}
        {isNotes && (
          <div
            onMouseDown={onMainDrag}
            className="w-1 flex-shrink-0 bg-slate-200 hover:bg-teal-400 active:bg-teal-500 cursor-col-resize transition-colors"
            title="Drag to resize"
          />
        )}

        {/* Right panel */}
        <div className={`${isNotes ? 'flex-1 min-w-0' : 'w-80 flex-shrink-0 border-l border-slate-200'} flex flex-col bg-white`}>
          {/* Tab bar */}
          <div className="flex border-b border-slate-100 flex-shrink-0">
            {[
              { id: 'details', label: 'Details', icon: 'info' },
              { id: 'notes', label: 'Notes', icon: 'edit_note' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setSideTab(t.id)}
                className={`flex items-center justify-center gap-1.5 flex-1 py-2.5 text-xs font-semibold transition-colors tracking-wide capitalize ${
                  sideTab === t.id
                    ? 'text-teal-600 border-b-2 border-teal-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon name={t.icon} className="text-[15px]" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {sideTab === 'details' && (
              <WebsiteInfoPanel
                site={site}
                onUpdate={setSite}
                onStatusChange={newStatus => setSite(s => ({ ...s, status: newStatus }))}
              />
            )}
            {sideTab === 'notes' && (
              <div ref={notesAreaRef} className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex overflow-hidden min-w-0">
                  <NotesPanel
                    notes={notes}
                    setNotes={setNotes}
                    createFn={(data) => notesApi.createForWebsite(id, data)}
                  />
                </div>
                {copilotOpen && (
                  <div
                    onMouseDown={onCopilotDrag}
                    className="w-1 flex-shrink-0 bg-slate-200 hover:bg-purple-400 active:bg-purple-500 cursor-col-resize transition-colors"
                    title="Drag to resize"
                  />
                )}
                <CopilotPanel
                  websiteId={id}
                  open={copilotOpen}
                  onToggle={() => setCopilotOpen(o => !o)}
                  notes={notes}
                  onNotesChanged={loadNotes}
                  width={copilotWidth}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
