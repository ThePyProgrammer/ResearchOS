import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { papersApi } from '../services/api'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const mockHighlights = [
  {
    id: 'h1',
    color: 'yellow',
    text: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder.',
    page: 1,
  },
  {
    id: 'h2',
    color: 'blue',
    text: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
    page: 1,
  },
]

const mockComments = [
  {
    id: 'c1',
    highlightId: 'h1',
    color: 'yellow',
    author: 'Dr. Researcher',
    avatar: 'DR',
    avatarBg: 'bg-blue-500',
    time: '2 days ago',
    text: 'This framing really nails the motivation. CNNs were doing better than pure RNNs at this point but still had fundamental limitations with long-range dependencies.',
    replies: [
      {
        id: 'r1',
        author: 'Research Agent',
        avatar: 'RA',
        avatarBg: 'bg-purple-500',
        isAgent: true,
        time: '2 days ago',
        text: 'Note: the attention mechanism used here differs from Bahdanau (2015) in that it operates on all positions simultaneously rather than sequentially.',
      },
    ],
  },
  {
    id: 'c2',
    highlightId: 'h2',
    color: 'blue',
    author: 'Mark Smith',
    avatar: 'MS',
    avatarBg: 'bg-emerald-500',
    time: '1 day ago',
    text: 'The "solely on attention mechanisms" claim is strong — worth noting that positional encoding is still a non-attention component.',
    replies: [],
  },
]

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

function Comment({ comment }) {
  const [showReply, setShowReply] = useState(false)

  return (
    <div className="border-b border-slate-100 last:border-0 pb-4 mb-4">
      <div className={`mb-3 px-3 py-2 rounded-lg border-l-4 text-xs text-slate-600 leading-relaxed italic ${
        comment.color === 'yellow'
          ? 'bg-amber-50 border-amber-400'
          : 'bg-blue-50 border-blue-400'
      }`}>
        "{comment.text.slice(0, 120)}…"
      </div>

      <div className="flex gap-2.5">
        <div className={`w-7 h-7 rounded-full ${comment.avatarBg} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
          {comment.avatar}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-800">{comment.author}</span>
            <span className="text-xs text-slate-400">{comment.time}</span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{comment.text}</p>
          <button
            onClick={() => setShowReply(!showReply)}
            className="mt-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Reply
          </button>
        </div>
      </div>

      {comment.replies.map(reply => (
        <div key={reply.id} className="flex gap-2.5 mt-3 ml-9">
          <div className={`w-6 h-6 rounded-full ${reply.avatarBg} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
            {reply.avatar}
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-slate-700">{reply.author}</span>
              {reply.isAgent && (
                <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 rounded font-medium">Agent</span>
              )}
              <span className="text-[11px] text-slate-400">{reply.time}</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{reply.text}</p>
          </div>
        </div>
      ))}

      {showReply && (
        <div className="mt-3 ml-9">
          <textarea
            placeholder="Write a reply…"
            className="w-full p-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            rows={2}
          />
          <div className="flex justify-end gap-2 mt-1.5">
            <button onClick={() => setShowReply(false)} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Post</button>
          </div>
        </div>
      )}
    </div>
  )
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
  const [commentsTab, setCommentsTab] = useState('comments')
  const [zoom, setZoom] = useState(100)
  const [aiQuestion, setAiQuestion] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const fileInputRef = useRef(null)

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
          <Icon name="picture_as_pdf" className="text-[18px] text-red-400 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-700 truncate">{paper.title}.pdf</span>
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
          <button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <Icon name="share" className="text-[18px]" />
          </button>
          <button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <Icon name="more_vert" className="text-[18px]" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* PDF Panel */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-200">
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

        {/* Comments Panel */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-white">
          <div className="flex border-b border-slate-100">
            {[
              { id: 'comments', label: 'Comments', count: mockComments.length },
              { id: 'notes', label: 'Notes' },
              { id: 'ai', label: 'AI Assistant' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setCommentsTab(t.id)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  commentsTab === t.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
                {t.count && (
                  <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {commentsTab === 'comments' && (
              mockComments.map(c => <Comment key={c.id} comment={c} />)
            )}
            {commentsTab === 'notes' && (
              <div className="text-center py-8">
                <Icon name="note_add" className="text-[40px] text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">No notes yet.</p>
                <button className="mt-2 text-sm text-blue-600 hover:underline font-medium">Add a note</button>
              </div>
            )}
            {commentsTab === 'ai' && (
              <div className="space-y-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="smart_toy" className="text-purple-500 text-[16px]" />
                    <span className="text-sm font-semibold text-purple-800">AI Summary</span>
                  </div>
                  <p className="text-xs text-purple-700 leading-relaxed">
                    {paper.abstract
                      ? paper.abstract.slice(0, 300) + (paper.abstract.length > 300 ? '…' : '')
                      : 'No summary available.'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Ask a question</p>
                  <textarea
                    value={aiQuestion}
                    onChange={e => setAiQuestion(e.target.value)}
                    placeholder="e.g. How does multi-head attention work?"
                    className="w-full p-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    rows={3}
                  />
                  <button className="mt-2 w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                    Ask AI
                  </button>
                </div>
              </div>
            )}
          </div>

          {commentsTab === 'comments' && (
            <div className="border-t border-slate-100 p-3">
              <textarea
                placeholder="Add a comment or highlight text to annotate…"
                className="w-full p-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                rows={2}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-1">
                  {['format_bold', 'format_italic', 'alternate_email'].map(icon => (
                    <button key={icon} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                      <Icon name={icon} className="text-[16px]" />
                    </button>
                  ))}
                </div>
                <button className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  Post
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
