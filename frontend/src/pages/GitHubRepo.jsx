import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { githubReposApi, notesApi } from '../services/api'
import { statusConfig, NamedLinks, EditableField, EditableTextArea } from '../components/PaperInfoPanel'
import NotesPanel from '../components/NotesPanel'
import CopilotPanel from '../components/CopilotPanel'
import { useDragResize } from '../hooks/useDragResize'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// ---------------------------------------------------------------------------
// Repo Info Panel (details sidebar)
// ---------------------------------------------------------------------------
function RepoInfoPanel({ repo, onUpdate, onStatusChange }) {
  const handleFieldSave = async (field, value) => {
    try {
      const updated = await githubReposApi.update(repo.id, { [field]: value })
      onUpdate(updated)
    } catch (err) { console.error(err) }
  }

  const handleStatusChange = async (newStatus) => {
    try {
      await githubReposApi.update(repo.id, { status: newStatus })
      onStatusChange(newStatus)
    } catch (err) { console.error(err) }
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      {/* Identity */}
      <div className="space-y-2">
        <div className="flex gap-3 text-xs items-center">
          <span className="text-slate-400 w-14 flex-shrink-0">Owner</span>
          <span className="font-mono text-slate-700">{repo.owner}</span>
        </div>
        <div className="flex gap-3 text-xs items-center">
          <span className="text-slate-400 w-14 flex-shrink-0">Repo</span>
          <span className="font-mono text-slate-700">{repo.repoName}</span>
        </div>
        {repo.language && (
          <div className="flex gap-3 text-xs items-center">
            <span className="text-slate-400 w-14 flex-shrink-0">Language</span>
            <span className="text-slate-700">{repo.language}</span>
          </div>
        )}
        {repo.stars != null && (
          <div className="flex gap-3 text-xs items-center">
            <span className="text-slate-400 w-14 flex-shrink-0">Stars</span>
            <span className="text-slate-700">★ {repo.stars.toLocaleString()}</span>
          </div>
        )}
        {repo.license && (
          <div className="flex gap-3 text-xs items-center">
            <span className="text-slate-400 w-14 flex-shrink-0">License</span>
            <span className="text-slate-700">{repo.license}</span>
          </div>
        )}
        {repo.publishedDate && (
          <div className="flex gap-3 text-xs items-center">
            <span className="text-slate-400 w-14 flex-shrink-0">Released</span>
            <span className="text-slate-700">{repo.publishedDate}</span>
          </div>
        )}
      </div>

      {/* Topics */}
      {repo.topics?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Topics</p>
          <div className="flex flex-wrap gap-1.5">
            {repo.topics.map(t => (
              <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-mono">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Status</p>
        <div className="flex gap-1.5">
          {['inbox', 'to-read', 'read'].map(s => {
            const cfg = statusConfig[s]
            return (
              <button key={s} onClick={() => handleStatusChange(s)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${cfg.class} ${
                  repo.status === s ? 'ring-2 ring-offset-1 ring-current' : 'opacity-50 hover:opacity-80'
                }`}>
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Abstract / Description */}
      <EditableTextArea
        label="Abstract"
        value={repo.abstract}
        placeholder="Add abstract or notes…"
        onSave={v => handleFieldSave('abstract', v)}
      />

      {repo.abstract == null && (
        <EditableTextArea
          label="Description"
          value={repo.description}
          placeholder="Add description…"
          onSave={v => handleFieldSave('description', v)}
        />
      )}

      {/* Links */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Links</p>
        <div className="space-y-2">
          {repo.websiteUrl && (
            <div className="flex items-center gap-2 text-xs">
              <Icon name="language" className="text-[14px] text-slate-400 flex-shrink-0" />
              <a href={repo.websiteUrl} target="_blank" rel="noreferrer"
                className="text-blue-600 hover:underline truncate">{repo.websiteUrl}</a>
            </div>
          )}
          {repo.doi && (
            <div className="flex items-center gap-2 text-xs">
              <Icon name="article" className="text-[14px] text-slate-400 flex-shrink-0" />
              <a href={`https://doi.org/${repo.doi}`} target="_blank" rel="noreferrer"
                className="text-blue-600 hover:underline font-mono truncate">{repo.doi}</a>
            </div>
          )}
          <NamedLinks
            links={repo.links || []}
            onSave={links => handleFieldSave('links', links)}
          />
        </div>
      </div>

      {/* Tags */}
      {repo.tags?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {repo.tags.map(tag => (
              <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function GitHubRepo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [repo, setRepo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sideTab, setSideTab] = useState('details')
  const [notes, setNotes] = useState([])
  const [copilotOpen, setCopilotOpen] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // Resize state
  const [leftWidth, setLeftWidth] = useState(null)
  const [copilotWidth, setCopilotWidth] = useState(320)
  const bodyRef = useRef(null)
  const notesAreaRef = useRef(null)
  const onMainDrag = useDragResize({ containerRef: bodyRef, setSize: setLeftWidth, minPx: 240, maxOffset: 240 })
  const onCopilotDrag = useDragResize({ containerRef: notesAreaRef, setSize: setCopilotWidth, reverse: true, minPx: 240, maxOffset: 200 })

  useEffect(() => {
    githubReposApi.get(id)
      .then(setRepo)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const loadNotes = useCallback(() => {
    notesApi.listForGitHubRepo(id).then(setNotes).catch(console.error)
  }, [id])

  useEffect(() => { loadNotes() }, [loadNotes])

  const isNotes = sideTab === 'notes'

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500">
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

  if (error || !repo) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500">
            <Icon name="arrow_back" className="text-[18px]" />
            Back
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
          {error || 'Repository not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          Back
        </button>
        <div className="h-4 border-l border-slate-200" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon name="code" className="text-[18px] text-violet-500 flex-shrink-0" />
          {editingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const trimmed = titleDraft.trim()
                  if (trimmed && trimmed !== repo.title) {
                    githubReposApi.update(repo.id, { title: trimmed }).then(setRepo).catch(console.error)
                  }
                  setEditingTitle(false)
                }
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              onBlur={() => {
                const trimmed = titleDraft.trim()
                if (trimmed && trimmed !== repo.title) {
                  githubReposApi.update(repo.id, { title: trimmed }).then(setRepo).catch(console.error)
                }
                setEditingTitle(false)
              }}
              className="text-sm font-medium text-slate-700 bg-white border border-violet-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/30 flex-1 min-w-0"
            />
          ) : (
            <span
              className="text-sm font-medium text-slate-700 truncate cursor-default"
              onDoubleClick={() => { setTitleDraft(repo.title); setEditingTitle(true) }}
              title="Double-click to edit"
            >
              {repo.title}
            </span>
          )}
          <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
            GitHub
          </span>
          {repo.language && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
              {repo.language}
            </span>
          )}
          {repo.stars != null && (
            <span className="text-[10px] text-slate-400 flex-shrink-0">★ {repo.stars.toLocaleString()}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <a href={repo.url} target="_blank" rel="noreferrer" title="Open on GitHub"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex items-center">
            <Icon name="open_in_new" className="text-[18px]" />
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" ref={bodyRef}>
        {/* README / description panel */}
        <div
          className="flex flex-col overflow-hidden"
          style={isNotes
            ? { width: leftWidth ?? '55%', minWidth: 240, flexShrink: 0 }
            : { flex: 1, borderRight: '1px solid #e2e8f0' }}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <Icon name="code" className="text-[14px] text-slate-400" />
            <span className="truncate font-mono">{repo.owner}/{repo.repoName}</span>
            <a href={repo.url} target="_blank" rel="noreferrer"
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 transition-colors flex-shrink-0 text-slate-600">
              <Icon name="open_in_new" className="text-[12px]" />
              GitHub
            </a>
          </div>

          {/* Repository overview */}
          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Title + meta */}
              <div>
                <h1 className="text-xl font-bold text-slate-900">{repo.title}</h1>
                <p className="text-sm text-slate-500 font-mono mt-1">{repo.owner}/{repo.repoName}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {repo.language && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-mono">{repo.language}</span>
                  )}
                  {repo.stars != null && (
                    <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">★ {repo.stars.toLocaleString()} stars</span>
                  )}
                  {repo.license && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{repo.license}</span>
                  )}
                  {repo.publishedDate && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{repo.publishedDate}</span>
                  )}
                </div>
              </div>

              {/* Topics */}
              {repo.topics?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {repo.topics.map(t => (
                    <span key={t} className="text-xs px-2.5 py-0.5 bg-violet-50 text-violet-700 rounded-full border border-violet-200 font-mono">{t}</span>
                  ))}
                </div>
              )}

              {/* Abstract or description */}
              {repo.abstract ? (
                <div className="prose prose-sm max-w-none">
                  <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-widest mb-2">Abstract</h2>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{repo.abstract}</p>
                </div>
              ) : repo.description ? (
                <div>
                  <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-widest mb-2">Description</h2>
                  <p className="text-sm text-slate-700 leading-relaxed">{repo.description}</p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                  <p className="text-sm text-slate-400">No description available.</p>
                </div>
              )}

              {/* DOI + website links */}
              {(repo.doi || repo.websiteUrl) && (
                <div className="space-y-1.5">
                  {repo.doi && (
                    <div className="flex items-center gap-2 text-sm">
                      <Icon name="article" className="text-[15px] text-slate-400" />
                      <a href={`https://doi.org/${repo.doi}`} target="_blank" rel="noreferrer"
                        className="text-blue-600 hover:underline font-mono text-xs">{repo.doi}</a>
                    </div>
                  )}
                  {repo.websiteUrl && (
                    <div className="flex items-center gap-2 text-sm">
                      <Icon name="language" className="text-[15px] text-slate-400" />
                      <a href={repo.websiteUrl} target="_blank" rel="noreferrer"
                        className="text-blue-600 hover:underline text-xs truncate">{repo.websiteUrl}</a>
                    </div>
                  )}
                </div>
              )}

              {/* Named links */}
              {repo.links?.length > 0 && (
                <div className="space-y-1">
                  {repo.links.map((link, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Icon name="link" className="text-[14px] text-slate-400" />
                      <a href={link.url} target="_blank" rel="noreferrer"
                        className="text-blue-600 hover:underline text-xs">{link.name || link.url}</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main resize handle — notes tab only */}
        {isNotes && (
          <div
            onMouseDown={onMainDrag}
            className="w-1 flex-shrink-0 bg-slate-200 hover:bg-violet-400 active:bg-violet-500 cursor-col-resize transition-colors"
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
                    ? 'text-violet-600 border-b-2 border-violet-600'
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
              <RepoInfoPanel
                repo={repo}
                onUpdate={setRepo}
                onStatusChange={newStatus => setRepo(r => ({ ...r, status: newStatus }))}
              />
            )}
            {sideTab === 'notes' && (
              <div ref={notesAreaRef} className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex overflow-hidden min-w-0">
                  <NotesPanel
                    notes={notes}
                    setNotes={setNotes}
                    createFn={(data) => notesApi.createForGitHubRepo(id, data)}
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
                  githubRepoId={id}
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
