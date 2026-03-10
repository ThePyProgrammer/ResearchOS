import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { papersApi, notesApi } from '../services/api'
import PaperInfoPanel from '../components/PaperInfoPanel'
import NotesPanel from '../components/NotesPanel'
import CopilotPanel from '../components/CopilotPanel'
import { useDragResize } from '../hooks/useDragResize'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function buildPdfPages(paper) {
  if (!paper) return []
  return [
    {
      page: 1,
      content: [
        { type: 'h1', text: paper.title },
        { type: 'authors', text: paper.authors.join(', ') },
        { type: 'section', text: 'Abstract' },
        { type: 'text', text: paper.abstract || 'No abstract available.' },
      ],
    },
  ]
}


function PdfPage({ page }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 mb-4 max-w-2xl mx-auto">
      <p className="text-[10px] text-slate-300 mb-4 text-right">Page {page.page}</p>
      <div className="space-y-2 leading-relaxed">
        {page.content.map((block, i) => {
          if (block.type === 'h1') return (
            <h1 key={i} className="text-xl font-bold text-slate-900 text-center mb-2">{block.text}</h1>
          )
          if (block.type === 'authors') return (
            <p key={i} className="text-xs text-slate-500 text-center mb-4">{block.text}</p>
          )
          if (block.type === 'section') return (
            <h2 key={i} className="text-sm font-bold text-slate-800 mt-4 mb-1">{block.text}</h2>
          )
          return <span key={i} className="text-sm text-slate-700">{block.text}</span>
        })}
      </div>
    </div>
  )
}

export default function Paper() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [paper, setPaper] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sideTab, setSideTab] = useState('details')
  const [zoom, setZoom] = useState(100)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(true)
  const [notes, setNotes] = useState([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const fileInputRef = useRef(null)

  // Resize state
  const [leftWidth, setLeftWidth] = useState(null)
  const [copilotWidth, setCopilotWidth] = useState(320)
  const bodyRef = useRef(null)
  const notesAreaRef = useRef(null)
  const onMainDrag = useDragResize({ containerRef: bodyRef, setSize: setLeftWidth, minPx: 240, maxOffset: 240 })
  const onCopilotDrag = useDragResize({ containerRef: notesAreaRef, setSize: setCopilotWidth, reverse: true, minPx: 240, maxOffset: 200 })

  // Load notes for the paper
  const loadNotes = useCallback(() => {
    notesApi.list(id).then(setNotes).catch(console.error)
  }, [id])

  useEffect(() => { loadNotes() }, [loadNotes])

  useEffect(() => {
    let objectUrl = null
    if (!paper?.pdfUrl) {
      setPdfBlobUrl(null)
      return
    }
    setPdfLoading(true)
    fetch(paper.pdfUrl)
      .then(r => r.blob())
      .then(blob => {
        objectUrl = URL.createObjectURL(blob)
        setPdfBlobUrl(objectUrl)
      })
      .catch(() => setPdfBlobUrl(paper.pdfUrl)) // fall back to direct URL
      .finally(() => setPdfLoading(false))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [paper?.pdfUrl])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const updated = await papersApi.uploadPdf(id, file)
      setPaper(updated)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleRemovePdf() {
    setUploading(true)
    setUploadError(null)
    try {
      await papersApi.removePdf(id)
      setPaper(p => ({ ...p, pdfUrl: null }))
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    papersApi.get(id)
      .then(setPaper)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

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
          <div className="animate-pulse text-slate-400">Loading paper…</div>
        </div>
      </div>
    )
  }

  if (error || !paper) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500">
            <Icon name="arrow_back" className="text-[18px]" />
            Back
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
          {error || 'Paper not found.'}
        </div>
      </div>
    )
  }

  const pdfPages = buildPdfPages(paper)
  const isNotes = sideTab === 'notes'

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
          <Icon name="article" className="text-[18px] text-slate-400 flex-shrink-0" />
          {editingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const trimmed = titleDraft.trim()
                  if (trimmed && trimmed !== paper.title) {
                    papersApi.update(paper.id, { title: trimmed }).then(setPaper).catch(console.error)
                  }
                  setEditingTitle(false)
                }
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              onBlur={() => {
                const trimmed = titleDraft.trim()
                if (trimmed && trimmed !== paper.title) {
                  papersApi.update(paper.id, { title: trimmed }).then(setPaper).catch(console.error)
                }
                setEditingTitle(false)
              }}
              className="text-sm font-medium text-slate-700 bg-white border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex-1 min-w-0"
            />
          ) : (
            <span
              className="text-sm font-medium text-slate-700 truncate cursor-default"
              onDoubleClick={() => { setTitleDraft(paper.title); setEditingTitle(true) }}
              title="Double-click to edit"
            >
              {paper.title}
            </span>
          )}
          {paper.arxivId && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              arXiv
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {paper.githubUrl && (
            <a
              href={paper.githubUrl}
              target="_blank"
              rel="noreferrer"
              title="GitHub repository"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex items-center"
            >
              <Icon name="code" className="text-[18px]" />
            </a>
          )}
          {paper.websiteUrl && (
            <a
              href={paper.websiteUrl}
              target="_blank"
              rel="noreferrer"
              title="Project website"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex items-center"
            >
              <Icon name="language" className="text-[18px]" />
            </a>
          )}
          {(paper.arxivId || paper.doi) && (
            <a
              href={paper.arxivId ? `https://arxiv.org/abs/${paper.arxivId}` : `https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noreferrer"
              title="Open paper"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex items-center"
            >
              <Icon name="open_in_new" className="text-[18px]" />
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" ref={bodyRef}>
        {/* PDF Panel */}
        <div
          className="flex flex-col overflow-hidden"
          style={isNotes
            ? { width: leftWidth ?? '40%', minWidth: 240, flexShrink: 0 }
            : { flex: 1, borderRight: '1px solid #e2e8f0' }}
        >
          {/* PDF Toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white text-sm">
            {paper.pdfUrl ? (
              <>
                <a
                  href={paper.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-medium"
                >
                  <Icon name="open_in_new" className="text-[14px]" />
                  Open
                </a>
                <button
                  onClick={handleRemovePdf}
                  disabled={uploading}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 text-xs font-medium disabled:opacity-50"
                >
                  <Icon name="delete" className="text-[14px]" />
                  Remove PDF
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  <Icon name="upload_file" className="text-[14px]" />
                  {uploading ? 'Uploading…' : 'Upload PDF'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleUpload}
                />
                <div className="h-4 border-l border-slate-200 mx-1" />
                <button
                  onClick={() => setZoom(z => Math.max(50, z - 25))}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                >
                  <Icon name="remove" className="text-[18px]" />
                </button>
                <span className="text-xs text-slate-500 w-10 text-center">{zoom}%</span>
                <button
                  onClick={() => setZoom(z => Math.min(200, z + 25))}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                >
                  <Icon name="add" className="text-[18px]" />
                </button>
              </>
            )}
            {uploadError && (
              <span className="ml-auto text-xs text-red-500">{uploadError}</span>
            )}
          </div>

          {/* PDF Content */}
          {paper.pdfUrl ? (
            <div className="flex-1 overflow-hidden">
              {pdfLoading ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  Loading PDF…
                </div>
              ) : (
                <iframe
                  src={pdfBlobUrl}
                  title={paper.title}
                  className="w-full h-full border-0"
                />
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-slate-200 p-6">
              <div style={{ zoom: `${zoom}%` }}>
                {pdfPages.map(page => (
                  <PdfPage key={page.page} page={page} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main resize handle — notes tab only */}
        {isNotes && (
          <div
            onMouseDown={onMainDrag}
            className="w-1 flex-shrink-0 bg-slate-200 hover:bg-blue-400 active:bg-blue-500 cursor-col-resize transition-colors"
            title="Drag to resize"
          />
        )}

        {/* Right area — tabs + content */}
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
                  sideTab === t.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon name={t.icon} className="text-[15px]" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex">
            {sideTab === 'details' && (
              <div className="flex-1 overflow-y-auto">
                <PaperInfoPanel
                  paper={paper}
                  onStatusChange={(_, newStatus) => setPaper(p => ({ ...p, status: newStatus }))}
                  onPaperUpdate={setPaper}
                />
              </div>
            )}
            {sideTab === 'notes' && (
              <div ref={notesAreaRef} className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex overflow-hidden min-w-0">
                  <NotesPanel paperId={id} notes={notes} setNotes={setNotes} />
                </div>
                {copilotOpen && (
                  <div
                    onMouseDown={onCopilotDrag}
                    className="w-1 flex-shrink-0 bg-slate-200 hover:bg-purple-400 active:bg-purple-500 cursor-col-resize transition-colors"
                    title="Drag to resize"
                  />
                )}
                <CopilotPanel
                  paperId={id}
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
