import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { papersApi, websitesApi, githubReposApi, searchApi } from '../../services/api'
import { useLibrary } from '../../context/LibraryContext'
import { AuthorChips } from '../PaperInfoPanel'
import WindowModal from '../WindowModal'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// ---------------------------------------------------------------------------
// Identifier type detection (mirrors backend logic for live badge)
// ---------------------------------------------------------------------------
const DOI_RE = /\b(10\.\d{4,9}\/\S+)/
const ARXIV_BARE_RE = /^\d{4}\.\d{4,5}(v\d+)?$/
const ARXIV_URL_RE = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/
const GITHUB_URL_RE = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/

function detectType(raw) {
  const s = raw.trim()
  if (!s) return null
  if (s.includes('doi.org/')) return 'doi'
  if (ARXIV_URL_RE.test(s)) return 'arxiv'
  if (s.startsWith('10.') && s.includes('/')) return 'doi'
  if (s.toLowerCase().startsWith('doi:')) return 'doi'
  if (ARXIV_BARE_RE.test(s)) return 'arxiv'
  if (GITHUB_URL_RE.test(s)) return 'github'
  if (s.startsWith('http://') || s.startsWith('https://')) return 'url'
  return null
}

const TYPE_META = {
  doi: { label: 'DOI', bg: 'bg-orange-100', text: 'text-orange-700' },
  arxiv: { label: 'arXiv', bg: 'bg-purple-100', text: 'text-purple-700' },
  url: { label: 'URL', bg: 'bg-blue-100', text: 'text-blue-700' },
  github: { label: 'GitHub', bg: 'bg-violet-100', text: 'text-violet-700' },
}

const QUICK_ADD_WINDOWS_STORAGE_KEY = 'researchos.quickAdd.windows.v1'

function createDefaultQuickAddSnapshot() {
  return {
    mode: 'paper',
    input: '',
    state: 'idle',
    uploadMeta: { title: '', authors: [], date: '', venue: '' },
    bibtexState: 'idle', // idle | parsing | preview | importing | done | error
  }
}

function normalizeQuickAddSnapshot(snapshot) {
  const base = createDefaultQuickAddSnapshot()
  if (!snapshot || typeof snapshot !== 'object') return base
  const mode = ['paper', 'website', 'github', 'upload', 'bibtex'].includes(snapshot.mode) ? snapshot.mode : base.mode
  const state = ['idle', 'success', 'duplicate', 'error'].includes(snapshot.state) ? snapshot.state : base.state
  const uploadMetaRaw = snapshot.uploadMeta && typeof snapshot.uploadMeta === 'object' ? snapshot.uploadMeta : {}
  return {
    mode,
    state,
    input: typeof snapshot.input === 'string' ? snapshot.input : base.input,
    bibtexState: ['idle', 'parsing', 'preview', 'importing', 'done', 'error'].includes(snapshot.bibtexState) ? snapshot.bibtexState : 'idle',
    uploadMeta: {
      title: typeof uploadMetaRaw.title === 'string' ? uploadMetaRaw.title : '',
      authors: Array.isArray(uploadMetaRaw.authors) ? uploadMetaRaw.authors.filter(a => typeof a === 'string') : [],
      date: typeof uploadMetaRaw.date === 'string' ? uploadMetaRaw.date : '',
      venue: typeof uploadMetaRaw.venue === 'string' ? uploadMetaRaw.venue : '',
    },
  }
}

// ---------------------------------------------------------------------------
// Quick-Add modal
// ---------------------------------------------------------------------------
function QuickAddModal({ open, startMinimized = false, snapshot, onSnapshotChange, onClose, onAdded, onOpenAnother, collectionId, libraryId }) {
  const initialSnapshot = normalizeQuickAddSnapshot(snapshot)
  const [mode, setMode] = useState(initialSnapshot.mode) // 'paper' | 'website' | 'upload' | 'bibtex'
  const [input, setInput] = useState(initialSnapshot.input)
  const [state, setState] = useState(initialSnapshot.state) // idle | loading | success | duplicate | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // Upload mode state
  const [pdfFile, setPdfFile] = useState(null)
  const [uploadMeta, setUploadMeta] = useState(initialSnapshot.uploadMeta)
  const fileInputRef = useRef(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [uploadDupes, setUploadDupes] = useState(null) // { duplicates, paper } when dedup warning shown

  // BibTeX mode state
  const [bibtexFile, setBibtexFile] = useState(null)
  const [bibtexEntries, setBibtexEntries] = useState([]) // parsed preview entries
  const [bibtexSelected, setBibtexSelected] = useState(new Set()) // selected indices
  const [bibtexState, setBibtexState] = useState(initialSnapshot.bibtexState) // idle | parsing | preview | importing | done | error
  const [bibtexResults, setBibtexResults] = useState(null) // import results
  const bibtexFileInputRef = useRef(null)

  const detectedType = (mode === 'paper' || mode === 'github') ? detectType(input) : null

  // Focus input when opened; reset on close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setInput('')
      setState('idle')
      setResult(null)
      setError('')
      setMode('paper')
      setPdfFile(null)
      setUploadMeta({ title: '', authors: [], date: '', venue: '' })
      setUploadDupes(null)
      setExtracting(false)
      setBibtexFile(null)
      setBibtexEntries([])
      setBibtexSelected(new Set())
      setBibtexState('idle')
      setBibtexResults(null)
    }
  }, [open])

  // Keyboard: Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    onSnapshotChange?.({
      mode,
      input,
      state: state === 'loading' ? 'idle' : state,
      uploadMeta,
      bibtexState: ['parsing', 'importing'].includes(bibtexState) ? 'idle' : bibtexState,
    })
  }, [mode, input, state, uploadMeta, bibtexState, onSnapshotChange])

  async function handleBibtexParse(file) {
    if (!file) return
    setBibtexFile(file)
    setBibtexState('parsing')
    setBibtexEntries([])
    setBibtexSelected(new Set())
    setError('')

    try {
      const entries = await papersApi.parseBibtex(file, libraryId)
      setBibtexEntries(entries)
      // Auto-select all non-duplicate, non-error entries
      const selected = new Set()
      entries.forEach((e, i) => {
        if (e.paper && !e.duplicate && !e.error) selected.add(i)
      })
      setBibtexSelected(selected)
      setBibtexState('preview')
    } catch (err) {
      setError(err.message || 'Failed to parse BibTeX file')
      setBibtexState('error')
    }
  }

  async function handleBibtexConfirm() {
    const selectedEntries = bibtexEntries
      .filter((_, i) => bibtexSelected.has(i))
      .map(e => e.paper)
      .filter(Boolean)
      .map(p => ({
        ...p,
        collections: collectionId && collectionId !== 'unfiled' ? [collectionId] : (p.collections || []),
      }))

    if (selectedEntries.length === 0) return

    setBibtexState('importing')
    setError('')

    try {
      const results = await papersApi.confirmBibtex(selectedEntries, libraryId)
      setBibtexResults(results)
      setBibtexState('done')
      const createdCount = results.filter(r => r.status === 'created').length
      if (createdCount > 0) onAdded?.()
    } catch (err) {
      setError(err.message || 'Import failed')
      setBibtexState('error')
    }
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    if (mode === 'upload') return handleUploadSubmit()
    if (mode === 'bibtex') return
    const trimmed = input.trim()
    if (!trimmed || state === 'loading') return

    setState('loading')
    setError('')
    setResult(null)

    try {
      if (mode === 'github') {
        const repo = await githubReposApi.import(trimmed, libraryId)
        if (!repo.already_exists && collectionId && collectionId !== 'unfiled') {
          await githubReposApi.update(repo.id, { collections: [collectionId] })
          repo.collections = [collectionId]
        }
        setResult(repo)
        setState(repo.already_exists ? 'duplicate' : 'success')
        if (!repo.already_exists) onAdded?.(repo)
      } else if (mode === 'website') {
        const site = await websitesApi.import(trimmed, libraryId)
        if (!site.already_exists && collectionId && collectionId !== "unfiled") {
          await websitesApi.update(site.id, { collections: [collectionId] })
          site.collections = [collectionId]
        }
        setResult(site)
        setState(site.already_exists ? 'duplicate' : 'success')
        if (!site.already_exists) onAdded?.(site)
      } else {
        const paper = await papersApi.import(trimmed, libraryId)
        if (!paper.already_exists && collectionId && collectionId !== "unfiled") {
          await papersApi.update(paper.id, { collections: [collectionId] })
          paper.collections = [collectionId]
        }
        setResult(paper)
        setState(paper.already_exists ? 'duplicate' : 'success')
        if (!paper.already_exists) onAdded?.(paper)
      }
    } catch (err) {
      setState('error')
      setError(err.message || 'Lookup failed. Please check the identifier.')
    }
  }

  function _buildUploadPaperData() {
    return {
      title: uploadMeta.title.trim(),
      authors: uploadMeta.authors,
      year: uploadMeta.date ? new Date(uploadMeta.date).getFullYear() : 0,
      published_date: uploadMeta.date || null,
      venue: uploadMeta.venue.trim() || 'Unknown',
      status: 'inbox',
      source: 'human',
      collections: collectionId && collectionId !== 'unfiled' ? [collectionId] : [],
      library_id: libraryId || null,
    }
  }

  async function _createPaperAndUpload(paperData) {
    const paper = await papersApi.create(paperData)
    if (pdfFile) {
      await papersApi.uploadPdf(paper.id, pdfFile)
    }
    setResult(paper)
    setState('success')
    onAdded?.(paper)
  }

  async function handleUploadSubmit(forceCreate = false) {
    if (!uploadMeta.title.trim() || state === 'loading') return
    setState('loading')
    setError('')
    setResult(null)
    setUploadDupes(null)

    try {
      const paperData = _buildUploadPaperData()

      if (!forceCreate) {
        // Check for duplicates first
        const checkResult = await papersApi.checkDuplicates(paperData)
        if (checkResult.duplicates) {
          // Duplicates found — show warning, don't create yet
          setUploadDupes(checkResult)
          setState('idle')
          return
        }
        // checkResult.created means paper was already created (no dupes)
        if (checkResult.created) {
          const paper = checkResult.created
          if (pdfFile) {
            await papersApi.uploadPdf(paper.id, pdfFile)
          }
          setResult(paper)
          setState('success')
          onAdded?.(paper)
          return
        }
      }

      // Force create (user dismissed duplicate warning)
      await _createPaperAndUpload(paperData)
    } catch (err) {
      setState('error')
      setError(err.message || 'Failed to create paper.')
    }
  }

  async function handleExtractMetadata(file) {
    if (!file || extracting) return
    setExtracting(true)
    try {
      const meta = await papersApi.extractMetadata(file)
      setUploadMeta(prev => ({
        title: meta.title || prev.title,
        authors: meta.authors?.length ? meta.authors : prev.authors,
        date: meta.date || prev.date,
        venue: meta.venue || prev.venue,
      }))
    } catch (err) {
      // Silently fail — user can still fill in manually
      console.warn('Metadata extraction failed:', err)
    } finally {
      setExtracting(false)
    }
  }

  if (!open) return null

  return (
    <WindowModal
      open={open}
      onClose={onClose}
      title="Quick Add"
      initialMode={startMinimized ? 'minimized' : 'normal'}
      iconName={mode === 'bibtex' ? 'description' : mode === 'website' ? 'link' : mode === 'upload' ? 'upload_file' : 'add_circle'}
      iconWrapClassName={mode === 'bibtex' ? 'bg-green-100' : mode === 'website' ? 'bg-teal-100' : mode === 'upload' ? 'bg-amber-100' : 'bg-blue-100'}
      iconClassName={`text-[16px] ${mode === 'bibtex' ? 'text-green-600' : mode === 'website' ? 'text-teal-600' : mode === 'upload' ? 'text-amber-600' : 'text-blue-600'}`}
      position="top"
      normalPanelClassName="w-full max-w-lg rounded-2xl"
    >
      <form onSubmit={handleSubmit} className="px-5 pb-5 pt-4">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => onOpenAnother?.()}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-md hover:bg-slate-200 hover:text-slate-700 transition-colors"
            title="Open another Quick Add window"
          >
            <Icon name="add" className="text-[14px]" />
            New window
          </button>
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => { setMode('paper'); setInput(''); setState('idle'); setResult(null); setPdfFile(null); setUploadMeta({ title: '', authors: [], date: '', venue: '' }); setUploadDupes(null) }}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'paper' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => { setMode('upload'); setInput(''); setState('idle'); setResult(null) }}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'upload' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => { setMode('bibtex'); setInput(''); setState('idle'); setResult(null); setPdfFile(null); setUploadMeta({ title: '', authors: [], date: '', venue: '' }); setUploadDupes(null) }}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'bibtex' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              BibTeX
            </button>
            <button
              type="button"
              onClick={() => { setMode('website'); setInput(''); setState('idle'); setResult(null); setPdfFile(null); setUploadMeta({ title: '', authors: [], date: '', venue: '' }); setUploadDupes(null) }}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'website' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Website
            </button>
            <button
              type="button"
              onClick={() => { setMode('github'); setInput(''); setState('idle'); setResult(null); setPdfFile(null); setUploadMeta({ title: '', authors: [], date: '', venue: '' }); setUploadDupes(null) }}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'github' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              GitHub
            </button>
          </div>
        </div>

            {/* BibTeX mode */}
            {mode === 'bibtex' && (
              <div className="space-y-3">
                {/* File picker (idle or error state) */}
                {(bibtexState === 'idle' || bibtexState === 'error') && (
                  <>
                    <input
                      ref={bibtexFileInputRef}
                      type="file"
                      accept=".bib,.bibtex"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleBibtexParse(f)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => bibtexFileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDraggingOver(true) }}
                      onDragEnter={(e) => { e.preventDefault(); setDraggingOver(true) }}
                      onDragLeave={() => setDraggingOver(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDraggingOver(false)
                        const f = e.dataTransfer.files?.[0]
                        if (f) handleBibtexParse(f)
                      }}
                      className={`w-full flex flex-col items-center justify-center gap-1 px-4 py-6 border-2 border-dashed rounded-xl text-sm transition-colors ${
                        draggingOver
                          ? 'border-blue-400 bg-blue-50 text-blue-600'
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <Icon name={draggingOver ? 'file_download' : 'description'} className="text-[24px]" />
                      {draggingOver ? 'Drop .bib file here' : 'Click or drag & drop a .bib file'}
                      <span className="text-[11px] text-slate-400">Exported from Zotero, Mendeley, Google Scholar, etc.</span>
                    </button>
                  </>
                )}

                {/* Parsing spinner */}
                {bibtexState === 'parsing' && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <svg className="animate-spin w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="text-sm text-slate-500">Parsing {bibtexFile?.name}...</span>
                  </div>
                )}

                {/* Preview table */}
                {bibtexState === 'preview' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        {bibtexEntries.length} {bibtexEntries.length === 1 ? 'entry' : 'entries'} found in <span className="font-medium text-slate-700">{bibtexFile?.name}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => { setBibtexState('idle'); setBibtexFile(null); setBibtexEntries([]); setBibtexSelected(new Set()) }}
                        className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Choose different file
                      </button>
                    </div>

                    {/* Select all / deselect all */}
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bibtexSelected.size > 0 && bibtexSelected.size === bibtexEntries.filter(e => e.paper && !e.error).length}
                          ref={el => {
                            if (el) {
                              const validCount = bibtexEntries.filter(e => e.paper && !e.error).length
                              el.indeterminate = bibtexSelected.size > 0 && bibtexSelected.size < validCount
                            }
                          }}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const all = new Set()
                              bibtexEntries.forEach((entry, i) => { if (entry.paper && !entry.error) all.add(i) })
                              setBibtexSelected(all)
                            } else {
                              setBibtexSelected(new Set())
                            }
                          }}
                          className="rounded border-slate-300"
                        />
                        Select all
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {bibtexSelected.size} selected
                        {bibtexEntries.some(e => e.duplicate) && (
                          <> · <span className="text-amber-600">{bibtexEntries.filter(e => e.duplicate).length} duplicates</span></>
                        )}
                        {bibtexEntries.some(e => e.error) && (
                          <> · <span className="text-red-500">{bibtexEntries.filter(e => e.error).length} errors</span></>
                        )}
                      </span>
                    </div>

                    {/* Entry list */}
                    <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {bibtexEntries.map((entry, i) => (
                        <label
                          key={entry.key || i}
                          className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors ${
                            entry.error ? 'opacity-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={bibtexSelected.has(i)}
                            disabled={!entry.paper || !!entry.error}
                            onChange={() => {
                              setBibtexSelected(prev => {
                                const next = new Set(prev)
                                if (next.has(i)) next.delete(i)
                                else next.add(i)
                                return next
                              })
                            }}
                            className="mt-0.5 rounded border-slate-300"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-slate-800 truncate">
                                {entry.paper?.title || entry.key}
                              </span>
                              {entry.duplicate && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0" title={
                                  entry.duplicateMatchField
                                    ? `${entry.duplicateConfidence === 'exact' ? 'Exact' : 'Likely'} match on ${entry.duplicateMatchField === 'doi' ? 'DOI' : entry.duplicateMatchField === 'arxiv_id' ? 'arXiv ID' : 'title'}`
                                    : 'Duplicate detected'
                                }>
                                  {entry.duplicateConfidence === 'likely' ? 'LIKELY DUPLICATE' : 'DUPLICATE'}
                                </span>
                              )}
                              {entry.error && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">
                                  ERROR
                                </span>
                              )}
                            </div>
                            {entry.paper && (
                              <p className="text-[11px] text-slate-400 truncate">
                                {entry.paper.authors?.slice(0, 2).join(', ')}
                                {entry.paper.authors?.length > 2 ? ' et al.' : ''}
                                {entry.paper.year ? ` · ${entry.paper.year}` : ''}
                                {entry.paper.venue && entry.paper.venue !== 'Unknown' ? ` · ${entry.paper.venue}` : ''}
                              </p>
                            )}
                            {entry.error && (
                              <p className="text-[10px] text-red-500">{entry.error}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}

                {/* Importing spinner */}
                {bibtexState === 'importing' && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <svg className="animate-spin w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="text-sm text-slate-500">Importing {bibtexSelected.size} papers...</span>
                  </div>
                )}

                {/* Done state */}
                {bibtexState === 'done' && bibtexResults && (
                  <div className="space-y-2">
                    <div className="rounded-xl px-4 py-3 bg-emerald-50 border border-emerald-200">
                      <div className="flex items-center gap-2">
                        <Icon name="check_circle" className="text-[20px] text-emerald-500" />
                        <div>
                          <p className="text-xs font-semibold text-emerald-700">
                            {bibtexResults.filter(r => r.status === 'created').length} papers imported
                          </p>
                          {bibtexResults.some(r => r.status === 'failed') && (
                            <p className="text-[11px] text-red-600 mt-0.5">
                              {bibtexResults.filter(r => r.status === 'failed').length} failed
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error state */}
                {bibtexState === 'error' && error && (
                  <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-red-50 border border-red-200">
                    <Icon name="error" className="text-[20px] text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-red-700">BibTeX import failed</p>
                      <p className="text-xs text-red-600 mt-0.5">{error}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Upload mode: PDF picker + metadata fields */}
            {mode === 'upload' && state !== 'success' && (
              <div className="space-y-3">
                {/* PDF file picker + drop zone */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setPdfFile(f)
                      handleExtractMetadata(f)
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDraggingOver(true) }}
                  onDragEnter={(e) => { e.preventDefault(); setDraggingOver(true) }}
                  onDragLeave={() => setDraggingOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDraggingOver(false)
                    const f = e.dataTransfer.files?.[0]
                    if (f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
                      setPdfFile(f)
                      handleExtractMetadata(f)
                    }
                  }}
                  className={`w-full flex flex-col items-center justify-center gap-1 px-4 py-4 border-2 border-dashed rounded-xl text-sm transition-colors ${
                    pdfFile
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : draggingOver
                        ? 'border-blue-400 bg-blue-50 text-blue-600'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <Icon name={pdfFile ? 'check_circle' : draggingOver ? 'file_download' : 'upload_file'} className="text-[20px]" />
                  {pdfFile ? pdfFile.name : draggingOver ? 'Drop PDF here' : 'Click or drag & drop a PDF (optional)'}
                </button>

                {/* Extracting indicator / re-extract button */}
                {pdfFile && (
                  <div className="flex items-center gap-2">
                    {extracting ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-blue-600">
                        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Extracting metadata from PDF…
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleExtractMetadata(pdfFile)}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <Icon name="auto_awesome" className="text-[13px]" />
                        Re-extract metadata
                      </button>
                    )}
                  </div>
                )}

                {/* Title (required) */}
                <input
                  type="text"
                  value={uploadMeta.title}
                  onChange={(e) => setUploadMeta(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Title *"
                  disabled={state === 'loading'}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-60 transition"
                />

                {/* Authors */}
                <AuthorChips
                  authors={uploadMeta.authors}
                  onSave={(newAuthors) => setUploadMeta(prev => ({ ...prev, authors: newAuthors }))}
                />

                {/* Date + Venue in a row */}
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={uploadMeta.date}
                    onChange={(e) => setUploadMeta(prev => ({ ...prev, date: e.target.value }))}
                    disabled={state === 'loading'}
                    className="w-40 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-60 transition"
                  />
                  <input
                    type="text"
                    value={uploadMeta.venue}
                    onChange={(e) => setUploadMeta(prev => ({ ...prev, venue: e.target.value }))}
                    placeholder="Venue / Journal"
                    disabled={state === 'loading'}
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-60 transition"
                  />
                </div>
              </div>
            )}

            {/* Upload mode: duplicate warning */}
            {mode === 'upload' && uploadDupes && (
              <div className="mt-3 rounded-xl px-4 py-3 bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-3">
                  <Icon name="warning" className="text-[20px] text-amber-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-amber-700">Possible duplicate detected</p>
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      A similar paper already exists in your library:
                    </p>
                    {uploadDupes.duplicates.map((d, i) => (
                      <div key={i} className="mt-1.5 p-2 bg-white/60 rounded-lg border border-amber-100">
                        <p className="text-xs font-medium text-slate-700 truncate">{d.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {d.authors?.slice(0, 2).join(', ')}
                          {d.authors?.length > 2 ? ' et al.' : ''}
                          {d.year ? ` · ${d.year}` : ''}
                          {' · '}
                          <span className="text-amber-600">
                            {d.confidence === 'exact' ? 'Exact' : 'Likely'} match on {d.matchField === 'doi' ? 'DOI' : d.matchField === 'arxiv_id' ? 'arXiv ID' : 'title'}
                          </span>
                        </p>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2.5">
                      <button
                        type="button"
                        onClick={() => setUploadDupes(null)}
                        className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => { setUploadDupes(null); handleUploadSubmit(true) }}
                        className="px-3 py-1.5 text-[11px] font-semibold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors"
                      >
                        Import anyway
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Import/Website/GitHub mode: identifier input */}
            {mode !== 'upload' && mode !== 'bibtex' && (
              <>
                {/* Input row */}
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      if (state !== 'idle') {
                        setState('idle')
                        setResult(null)
                        setError('')
                      }
                    }}
                    placeholder={mode === 'website' ? 'Paste a website URL…' : mode === 'github' ? 'Paste a GitHub repo URL…' : 'Paste DOI, arXiv ID, or URL…'}
                    disabled={state === 'loading'}
                    className="w-full px-4 py-3 pr-[4.5rem] bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-60 transition"
                  />
                  {/* Type badge */}
                  {detectedType && state === 'idle' && (
                    <span
                      className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_META[detectedType].bg} ${TYPE_META[detectedType].text}`}
                    >
                      {TYPE_META[detectedType].label}
                    </span>
                  )}
                </div>

                {/* Examples */}
                {state === 'idle' && !input && mode === 'github' && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {[
                      'github.com/huggingface/transformers',
                      'github.com/openai/openai-python',
                    ].map(label => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setInput(`https://${label}`)}
                        className="text-[11px] px-2 py-0.5 rounded-full border font-mono transition-colors bg-violet-100 text-violet-700 border-transparent hover:opacity-80"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {state === 'idle' && !input && mode === 'paper' && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {[
                      { label: '10.48550/arXiv.1706.03762', type: 'doi' },
                      { label: '2303.08774', type: 'arxiv' },
                      { label: 'arxiv.org/abs/2310.06825', type: 'arxiv' },
                    ].map(({ label, type }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setInput(label)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border font-mono transition-colors
                          ${TYPE_META[type].bg} ${TYPE_META[type].text} border-transparent hover:opacity-80`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Success state */}
            {(state === 'success' || state === 'duplicate') && result && (
              <div className={`mt-3 rounded-xl px-4 py-3 flex items-start gap-3 ${
                state === 'duplicate' ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'
              }`}>
                <Icon
                  name={state === 'duplicate' ? 'info' : 'check_circle'}
                  className={`text-[20px] mt-0.5 shrink-0 ${
                    state === 'duplicate' ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${
                    state === 'duplicate' ? 'text-amber-700' : 'text-emerald-700'
                  }`}>
                    {state === 'duplicate' ? 'Already in library' : mode === 'github' ? 'Repository added to library' : mode === 'website' ? 'Website added to library' : 'Paper added to library'}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5 truncate font-medium">
                    {result.title}
                  </p>
                  {result.authors?.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {result.authors.slice(0, 3).join(', ')}
                      {result.authors.length > 3 ? ` +${result.authors.length - 3} more` : ''}
                      {result.year ? ` · ${result.year}` : ''}
                    </p>
                  )}
                  {state === 'duplicate' && result.duplicates?.length > 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Matched by {result.duplicates[0].matchField === 'doi' ? 'DOI' : result.duplicates[0].matchField === 'arxiv_id' ? 'arXiv ID' : 'title'}
                      {result.duplicates[0].confidence === 'likely' ? ' (likely match)' : ' (exact match)'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Error state */}
            {state === 'error' && (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-start gap-3 bg-red-50 border border-red-200">
                <Icon name="error" className="text-[20px] text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-700">Lookup failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Action row */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[11px] text-slate-400">
                {mode === 'bibtex'
                  ? 'Import papers from a .bib file (Zotero, Mendeley, etc.)'
                  : mode === 'upload'
                    ? 'Upload a PDF and fill in the metadata manually'
                    : mode === 'github'
                      ? 'Fetches repo info and CITATION.cff if available'
                      : mode === 'website'
                        ? 'Fetches title, description and author from the page'
                        : 'Supports DOI, arXiv ID, arXiv URL, and paper page URLs'}
              </p>
              <div className="flex items-center gap-2">
                {(state === 'success' || state === 'duplicate') && mode !== 'bibtex' && (
                  <button
                    type="button"
                    onClick={() => { setInput(''); setState('idle'); setResult(null); setPdfFile(null); setUploadMeta({ title: '', authors: [], date: '', venue: '' }); setUploadDupes(null) }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Add another
                  </button>
                )}
                {mode === 'bibtex' && bibtexState === 'done' && (
                  <button
                    type="button"
                    onClick={() => { setBibtexState('idle'); setBibtexFile(null); setBibtexEntries([]); setBibtexSelected(new Set()); setBibtexResults(null) }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Import another file
                  </button>
                )}
                {mode === 'bibtex' ? (
                  bibtexState === 'preview' && (
                    <button
                      type="button"
                      onClick={handleBibtexConfirm}
                      disabled={bibtexSelected.size === 0}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Icon name="download" className="text-[14px]" />
                      Import {bibtexSelected.size} {bibtexSelected.size === 1 ? 'paper' : 'papers'}
                    </button>
                  )
                ) : (
                  <button
                    type="submit"
                    disabled={
                      mode === 'upload'
                        ? !uploadMeta.title.trim() || state === 'loading'
                        : !input.trim() || state === 'loading'
                    }
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {state === 'loading' ? (
                      <>
                        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        {mode === 'upload' ? 'Uploading…' : 'Looking up…'}
                      </>
                    ) : (
                      <>
                        <Icon name={mode === 'upload' ? 'upload' : 'add'} className="text-[14px]" />
                        {mode === 'upload' ? 'Upload Paper' : mode === 'github' ? 'Add Repo' : mode === 'website' ? 'Add Website' : 'Add Paper'}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
      </form>
    </WindowModal>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
export default function Header() {
  const { refreshCollections } = useLibrary()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [quickAddWindows, setQuickAddWindows] = useState([])
  const quickAddCounterRef = useRef(0)
  const containerRef = useRef(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeCollectionId = searchParams.get('col') || null
  const { activeLibraryId } = useLibrary()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUICK_ADD_WINDOWS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const windows = parsed
        .filter(w => w && typeof w === 'object' && typeof w.id === 'string')
        .map(w => ({ id: w.id, snapshot: normalizeQuickAddSnapshot(w.snapshot), startMinimized: true }))
      if (windows.length > 0) {
        setQuickAddWindows(windows)
        const maxSuffix = windows.reduce((max, w) => {
          const n = parseInt(String(w.id).replace('quick-add-', ''), 10)
          return Number.isFinite(n) ? Math.max(max, n) : max
        }, 0)
        quickAddCounterRef.current = Math.max(quickAddCounterRef.current, maxSuffix)
      }
    } catch {
      // ignore malformed localStorage payload
    }
  }, [])

  useEffect(() => {
    try {
      const serializable = quickAddWindows.map(w => ({ id: w.id, snapshot: w.snapshot }))
      localStorage.setItem(QUICK_ADD_WINDOWS_STORAGE_KEY, JSON.stringify(serializable))
    } catch {
      // ignore storage write failures
    }
  }, [quickAddWindows])

  // Debounced lexical search → quick dropdown (no API key needed)
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setDropdownOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await searchApi.query(query, { mode: 'lexical', limit: 5, libraryId: activeLibraryId })
        setResults(data)
        setDropdownOpen(true)
      } catch (_) {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, activeLibraryId])

  // Close dropdown when clicking outside
  useEffect(() => {
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const commitSearch = (q = query, mode = 'lexical') => {
    const trimmed = q.trim()
    if (!trimmed) return
    setDropdownOpen(false)
    setQuery('')
    navigate(`/library?q=${encodeURIComponent(trimmed)}&mode=${mode}`)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setDropdownOpen(false); setQuery('') }
    if (e.key === 'Enter') commitSearch()
  }

  const handleSelectItem = (item) => {
    setDropdownOpen(false)
    setQuery('')
    if (item.itemType === 'website') {
      navigate(`/library/website/${item.id}`)
    } else if (item.itemType === 'github_repo') {
      // No dedicated repo detail page yet — surface in library view
      navigate(`/library?q=${encodeURIComponent(item.title)}&mode=lexical`)
    } else {
      navigate(`/library/paper/${item.id}`)
    }
  }

  const openQuickAddWindow = () => {
    quickAddCounterRef.current += 1
    const id = `quick-add-${quickAddCounterRef.current}`
    setQuickAddWindows(prev => [...prev, { id, snapshot: createDefaultQuickAddSnapshot(), startMinimized: false }])
  }

  const closeQuickAddWindow = (id) => {
    setQuickAddWindows(prev => prev.filter(win => win.id !== id))
  }

  const updateQuickAddWindowSnapshot = (id, nextSnapshot) => {
    const normalized = normalizeQuickAddSnapshot(nextSnapshot)
    setQuickAddWindows(prev =>
      prev.map(win => (win.id === id ? { ...win, snapshot: normalized, startMinimized: false } : win))
    )
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        {/* Search with live dropdown */}
        <div ref={containerRef} className="flex-1 max-w-xl relative">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none" />
          <input
            type="text"
            placeholder="Search library lexically or semantically…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= 2 && setDropdownOpen(true)}
            className="w-full pl-9 pr-16 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); setDropdownOpen(false) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          ) : (
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono pointer-events-none">
              ⌘K
            </kbd>
          )}

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
              {searching && (
                <div className="px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-slate-200 border-t-blue-500 rounded-full" />
                  Searching…
                </div>
              )}

              {!searching && results.length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-400">
                  No results for "<span className="text-slate-600 font-medium">{query}</span>"
                </div>
              )}

              {!searching && results.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${
                    i < results.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-slate-800 truncate flex-1">
                      {item.title}
                    </span>
                    {item.itemType === 'website' && (
                      <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                        Website
                      </span>
                    )}
                    {item.itemType === 'github_repo' && (
                      <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                        GitHub
                      </span>
                    )}
                    {item.itemType === 'paper' && item.source === 'agent' && item.agentRun && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                        Run #{item.agentRun.runNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {item.itemType === 'website' && (
                      item.url
                    )}
                    {item.itemType === 'github_repo' && (
                      `${item.owner}/${item.repoName}${item.language ? ` · ${item.language}` : ''}${item.stars != null ? ` · ★${item.stars}` : ''}`
                    )}
                    {(!item.itemType || item.itemType === 'paper') && (
                      <>
                        {item.authors?.slice(0, 2).join(', ')}
                        {item.authors?.length > 2 ? ' et al.' : ''}
                        {' · '}{item.venue} {item.year}
                      </>
                    )}
                  </p>
                </button>
              ))}

              {/* Footer: lexical all + semantic */}
              <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100">
                <button
                  onClick={() => commitSearch(query, 'lexical')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Icon name="format_list_bulleted" className="text-[14px] text-slate-400" />
                  All lexical results
                </button>
                <button
                  onClick={() => commitSearch(query, 'semantic')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors font-medium"
                >
                  <Icon name="auto_awesome" className="text-[14px]" />
                  Semantic search
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Notification */}
          <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <Icon name="notifications" className="text-[20px]" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* Quick Add */}
          <button
            onClick={openQuickAddWindow}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Icon name="add" className="text-[18px]" />
            Quick Add
          </button>
        </div>
      </header>

      {quickAddWindows.map(win => (
        <QuickAddModal
          key={win.id}
          open
          startMinimized={Boolean(win.startMinimized)}
          snapshot={win.snapshot}
          onSnapshotChange={snapshot => updateQuickAddWindowSnapshot(win.id, snapshot)}
          onClose={() => closeQuickAddWindow(win.id)}
          onOpenAnother={openQuickAddWindow}
          onAdded={() => {
            refreshCollections()
            navigate(activeCollectionId ? `/library?col=${activeCollectionId}` : '/library')
          }}
          collectionId={activeCollectionId}
          libraryId={activeLibraryId}
        />
      ))}
    </>
  )
}
