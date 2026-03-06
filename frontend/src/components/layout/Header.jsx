import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { papersApi, searchApi } from '../../services/api'
import { useLibrary } from '../../context/LibraryContext'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// ---------------------------------------------------------------------------
// Identifier type detection (mirrors backend logic for live badge)
// ---------------------------------------------------------------------------
const DOI_RE = /\b(10\.\d{4,9}\/\S+)/
const ARXIV_BARE_RE = /^\d{4}\.\d{4,5}(v\d+)?$/
const ARXIV_URL_RE = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/

function detectType(raw) {
  const s = raw.trim()
  if (!s) return null
  if (s.includes('doi.org/')) return 'doi'
  if (ARXIV_URL_RE.test(s)) return 'arxiv'
  if (s.startsWith('10.') && s.includes('/')) return 'doi'
  if (s.toLowerCase().startsWith('doi:')) return 'doi'
  if (ARXIV_BARE_RE.test(s)) return 'arxiv'
  if (s.startsWith('http://') || s.startsWith('https://')) return 'url'
  return null
}

const TYPE_META = {
  doi: { label: 'DOI', bg: 'bg-orange-100', text: 'text-orange-700' },
  arxiv: { label: 'arXiv', bg: 'bg-purple-100', text: 'text-purple-700' },
  url: { label: 'URL', bg: 'bg-blue-100', text: 'text-blue-700' },
}

// ---------------------------------------------------------------------------
// Quick-Add modal
// ---------------------------------------------------------------------------
function QuickAddModal({ open, onClose, onAdded, collectionId, libraryId }) {
  const [input, setInput] = useState('')
  const [state, setState] = useState('idle') // idle | loading | success | duplicate | error
  const [result, setResult] = useState(null)  // paper object on success
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const detectedType = detectType(input)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      // Reset on close
      setInput('')
      setState('idle')
      setResult(null)
      setError('')
    }
  }, [open])

  // Keyboard: Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  async function handleSubmit(e) {
    e?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || state === 'loading') return

    setState('loading')
    setError('')
    setResult(null)

    try {
      const paper = await papersApi.import(trimmed, libraryId)
      if (!paper.already_exists && collectionId) {
        await papersApi.update(paper.id, { collections: [collectionId] })
        paper.collections = [collectionId]
      }
      setResult(paper)
      setState(paper.already_exists ? 'duplicate' : 'success')
      if (!paper.already_exists) onAdded?.(paper)
    } catch (err) {
      setState('error')
      setError(err.message || 'Lookup failed. Please check the identifier.')
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-start justify-center pt-[12vh] z-50 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                <Icon name="add_circle" className="text-blue-600 text-[16px]" />
              </span>
              <h2 className="text-sm font-semibold text-slate-800">Quick Add</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="px-5 pb-5">
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
                placeholder="Paste DOI, arXiv ID, or URL…"
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
            {state === 'idle' && !input && (
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
                    {state === 'duplicate' ? 'Already in library' : 'Paper added to library'}
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
                Supports DOI, arXiv ID, arXiv URL, and paper page URLs
              </p>
              <div className="flex items-center gap-2">
                {(state === 'success' || state === 'duplicate') && (
                  <button
                    type="button"
                    onClick={() => { setInput(''); setState('idle'); setResult(null) }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Add another
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!input.trim() || state === 'loading'}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {state === 'loading' ? (
                    <>
                      <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Looking up…
                    </>
                  ) : (
                    <>
                      <Icon name="add" className="text-[14px]" />
                      Add to Library
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
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
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const containerRef = useRef(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeCollectionId = searchParams.get('col') || null
  const { activeLibraryId } = useLibrary()

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
        const data = await searchApi.query(query, { mode: 'lexical', limit: 5 })
        setResults(data)
        setDropdownOpen(true)
      } catch (_) {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

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

  const handleSelectPaper = (paper) => {
    setDropdownOpen(false)
    setQuery('')
    navigate(`/library/paper/${paper.id}`)
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

              {!searching && results.map((paper, i) => (
                <button
                  key={paper.id}
                  onClick={() => handleSelectPaper(paper)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${
                    i < results.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-slate-800 truncate flex-1">
                      {paper.title}
                    </span>
                    {paper.source === 'agent' && paper.agentRun && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                        Run #{paper.agentRun.runNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {paper.authors?.slice(0, 2).join(', ')}
                    {paper.authors?.length > 2 ? ' et al.' : ''}
                    {' · '}{paper.venue} {paper.year}
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
            onClick={() => setQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Icon name="add" className="text-[18px]" />
            Quick Add
          </button>
        </div>
      </header>

      <QuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onAdded={() => {
          refreshCollections()
          navigate(activeCollectionId ? `/library?col=${activeCollectionId}` : '/library')
        }}
        collectionId={activeCollectionId}
        libraryId={activeLibraryId}
      />
    </>
  )
}
