/**
 * NotesCopilotPanel
 *
 * A library-scoped AI copilot panel for the Notes IDE page.
 *
 * Key features
 * ────────────
 * • Context selection via @ mention: type "@" in the chat input to pick
 *   papers, websites, GitHub repos, collections, or "all items".
 * • Per-item "include notes" toggle on each context chip.
 * • Agentic loop: the backend may call read_note / list_item_notes internally
 *   before returning suggestions — a spinner with iteration count shows progress.
 * • Suggestion cards (edit / create) with diff view and accept / reject.
 * • Full conversation history kept in React state (stateless API).
 */

import {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { notesCopilotApi, notesApi } from '../services/api'

/* ─── Utilities ────────────────────────────────────────────────────────────── */

function renderLatexInHtml(html) {
  if (!html) return html
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }) }
    catch { return `<code>${tex}</code>` }
  })
  html = html.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (_, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }) }
    catch { return `<code>${tex}</code>` }
  })
  return html
}

function stripHtml(html) {
  if (!html) return ''
  const el = document.createElement('div')
  el.innerHTML = html
  return el.textContent || ''
}

function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result = []
  const m = oldLines.length, n = newLines.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: 'same', text: oldLines[i] }); i++; j++
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: 'add', text: newLines[j] }); j++
    } else {
      result.push({ type: 'del', text: oldLines[i] }); i++
    }
  }
  return result
}

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

/* ─── Item type styling ──────────────────────────────────────────────────────── */
const ITEM_STYLE = {
  paper:       { icon: 'article',     color: 'text-blue-500',   bg: 'bg-blue-50',   pill: 'bg-blue-100 text-blue-700' },
  website:     { icon: 'language',    color: 'text-teal-500',   bg: 'bg-teal-50',   pill: 'bg-teal-100 text-teal-700' },
  github_repo: { icon: 'code',        color: 'text-violet-500', bg: 'bg-violet-50', pill: 'bg-violet-100 text-violet-700' },
  library:     { icon: 'local_library', color: 'text-slate-500', bg: 'bg-slate-50', pill: 'bg-slate-100 text-slate-600' },
  collection:  { icon: 'folder',      color: 'text-amber-500',  bg: 'bg-amber-50',  pill: 'bg-amber-100 text-amber-700' },
}

/* ─── Diff viewer ────────────────────────────────────────────────────────────── */
function DiffView({ oldContent, newContent, type }) {
  const [expanded, setExpanded] = useState(false)
  const oldText = stripHtml(oldContent || '')
  const newText = stripHtml(newContent || '')

  if (type === 'create') {
    const lines = newText.split('\n')
    const display = expanded ? lines : lines.slice(0, 12)
    return (
      <div className="text-[11px] font-mono leading-relaxed max-h-60 overflow-y-auto">
        {display.map((line, i) => (
          <div key={i} className="px-2 py-px bg-emerald-50 text-emerald-800 flex">
            <span className="text-emerald-400 w-5 text-right mr-2 select-none flex-shrink-0">+</span>
            <span className="whitespace-pre-wrap break-all">{line || ' '}</span>
          </div>
        ))}
        {!expanded && lines.length > 12 && (
          <button onClick={() => setExpanded(true)} className="w-full px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 text-center">
            Show {lines.length - 12} more lines
          </button>
        )}
      </div>
    )
  }

  const diff = computeDiff(oldText, newText)
  if (!diff.some(d => d.type !== 'same')) {
    return <p className="text-[11px] text-slate-400 italic px-2 py-2">No changes detected.</p>
  }
  const display = expanded ? diff : diff.slice(0, 20)
  return (
    <div className="text-[11px] font-mono leading-relaxed max-h-60 overflow-y-auto">
      {display.map((d, i) => (
        <div key={i} className={`px-2 py-px flex ${
          d.type === 'add' ? 'bg-emerald-50 text-emerald-800'
          : d.type === 'del' ? 'bg-red-50 text-red-800'
          : 'text-slate-500'
        }`}>
          <span className={`w-5 text-right mr-2 select-none flex-shrink-0 ${
            d.type === 'add' ? 'text-emerald-400' : d.type === 'del' ? 'text-red-400' : 'text-slate-300'
          }`}>{d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' '}</span>
          <span className="whitespace-pre-wrap break-all">{d.text || ' '}</span>
        </div>
      ))}
      {!expanded && diff.length > 20 && (
        <button onClick={() => setExpanded(true)} className="w-full px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 text-center">
          Show {diff.length - 20} more lines
        </button>
      )}
    </div>
  )
}

/* ─── Suggestion card ────────────────────────────────────────────────────────── */
function SuggestionCard({ suggestion, allNotes, onAccept, onReject }) {
  const [showDiff, setShowDiff] = useState(true)
  const isCreate   = suggestion.type === 'create'
  const isAccepted = suggestion.status === 'accepted'
  const isRejected = suggestion.status === 'rejected'
  const isPending  = suggestion.status === 'pending'

  const currentNote    = !isCreate ? allNotes.find(n => n.id === suggestion.noteId) : null
  const currentContent = currentNote?.content || ''

  // Destination label for create suggestions
  const targetLabel = useMemo(() => {
    if (!isCreate) return null
    const tt = suggestion.targetType || 'library'
    const style = ITEM_STYLE[tt] || ITEM_STYLE.library
    return { label: tt === 'library' ? 'Library notes' : `${tt} — ${suggestion.targetId || ''}`, style }
  }, [isCreate, suggestion.targetType, suggestion.targetId])

  return (
    <div className={`rounded-lg border overflow-hidden mb-2 ${
      isAccepted ? 'border-emerald-200 bg-emerald-50/30'
      : isRejected ? 'border-slate-200 bg-slate-50/50 opacity-60'
      : 'border-purple-200 bg-white'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/50 border-b border-slate-100">
        <Icon name={isCreate ? 'note_add' : 'edit_note'} className={`text-[15px] ${isCreate ? 'text-emerald-500' : 'text-blue-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-700 truncate">{suggestion.noteName}</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${isCreate ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {isCreate ? 'NEW' : 'EDIT'}
            </span>
            {isCreate && targetLabel && (
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${targetLabel.style.pill}`}>
                {targetLabel.label}
              </span>
            )}
            {isAccepted && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ACCEPTED</span>}
            {isRejected && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">REJECTED</span>}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{suggestion.description}</p>
        </div>
        <button onClick={() => setShowDiff(d => !d)} className="p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100" title={showDiff ? 'Collapse' : 'Expand'}>
          <Icon name={showDiff ? 'expand_less' : 'expand_more'} className="text-[16px]" />
        </button>
      </div>

      {showDiff && (
        <DiffView oldContent={currentContent} newContent={suggestion.content} type={suggestion.type} />
      )}

      {isPending && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-slate-100 bg-white">
          <button onClick={() => onAccept(suggestion)} className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-[11px] font-medium rounded-md hover:bg-emerald-700 transition-colors">
            <Icon name="check" className="text-[14px]" /> Accept
          </button>
          <button onClick={() => onReject(suggestion)} className="flex items-center gap-1 px-2.5 py-1 bg-white text-slate-600 text-[11px] font-medium rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
            <Icon name="close" className="text-[14px]" /> Reject
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Chat bubble ────────────────────────────────────────────────────────────── */
function ChatBubble({ message, allNotes, onAccept, onReject }) {
  const isUser = message.role === 'user'
  const rendered = useMemo(() => renderLatexInHtml(message.content), [message.content])
  const suggestions = message.suggestions || []

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={isUser ? 'max-w-[85%]' : 'max-w-[97%]'}>
        <div className="flex items-center gap-1.5 mb-1">
          {!isUser && (
            <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Icon name="smart_toy" className="text-[12px] text-purple-600" />
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-medium">{isUser ? 'You' : 'Copilot'}</span>
          <span className="text-[10px] text-slate-300">
            {new Date(message.createdAt || message.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {message.content && (
          <div className={`text-[13px] leading-relaxed rounded-xl px-3.5 py-2.5 ${
            isUser ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'
          }`}>
            <div className="copilot-message-content" dangerouslySetInnerHTML={{ __html: rendered }} />
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="mt-2 space-y-2">
            {suggestions.map(sug => (
              <SuggestionCard key={sug.id} suggestion={sug} allNotes={allNotes} onAccept={onAccept} onReject={onReject} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── @ mention dropdown ────────────────────────────────────────────────────── */
function MentionDropdown({ query, papers, websites, githubRepos, collections, onSelect, anchorRef }) {
  const qLow = query.toLowerCase()

  const matchItems = (items, type) =>
    items.filter(it => {
      const name = type === 'github_repo'
        ? `${it.owner || ''}/${it.repoName || it.repo_name || ''}`.toLowerCase()
        : (it.title || it.name || '').toLowerCase()
      return !qLow || name.includes(qLow)
    }).slice(0, 8).map(it => ({
      type,
      id: it.id,
      name: type === 'github_repo'
        ? `${it.owner || ''}/${it.repoName || it.repo_name || ''}`
        : (it.title || it.name || 'Untitled'),
      metadata: it,
    }))

  const specialItems = [
    { type: 'all_papers',   id: '__all_papers__',   name: 'All papers'      },
    { type: 'all_websites', id: '__all_websites__',  name: 'All websites'    },
    { type: 'all_repos',    id: '__all_repos__',     name: 'All GitHub repos' },
    { type: 'library',      id: '__library__',       name: 'Library notes'   },
  ].filter(s => !qLow || s.name.toLowerCase().includes(qLow))

  const groups = [
    { label: 'Papers',      items: matchItems(papers, 'paper'),       style: ITEM_STYLE.paper       },
    { label: 'Websites',    items: matchItems(websites, 'website'),   style: ITEM_STYLE.website     },
    { label: 'GitHub',      items: matchItems(githubRepos, 'github_repo'), style: ITEM_STYLE.github_repo },
    { label: 'Collections', items: matchItems(collections, 'collection'), style: ITEM_STYLE.collection },
  ].filter(g => g.items.length > 0)

  const hasResults = groups.some(g => g.items.length) || specialItems.length

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-72 overflow-y-auto">
      {/* Special / global items */}
      {specialItems.length > 0 && (
        <div className="px-2 pt-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">Quick select</p>
          <div className="space-y-0.5">
            {specialItems.map(item => {
              const icon = item.type === 'all_papers' ? 'article'
                : item.type === 'all_websites' ? 'language'
                : item.type === 'all_repos' ? 'code'
                : 'local_library'
              const color = item.type === 'all_papers' ? 'text-blue-500'
                : item.type === 'all_websites' ? 'text-teal-500'
                : item.type === 'all_repos' ? 'text-violet-500'
                : 'text-slate-500'
              return (
                <button
                  key={item.id}
                  onMouseDown={e => { e.preventDefault(); onSelect(item) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left"
                >
                  <Icon name={icon} className={`text-[15px] ${color}`} />
                  <span className="text-[12px] text-slate-700">{item.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {groups.map(g => (
        <div key={g.label} className="px-2 pt-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">{g.label}</p>
          <div className="space-y-0.5">
            {g.items.map(item => (
              <button
                key={item.id}
                onMouseDown={e => { e.preventDefault(); onSelect(item) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left"
              >
                <Icon name={g.style.icon} className={`text-[15px] ${g.style.color} flex-shrink-0`} />
                <span className="text-[12px] text-slate-700 truncate">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {!hasResults && (
        <p className="px-4 py-3 text-[12px] text-slate-400 text-center">No results for "{query}"</p>
      )}
      <div className="h-2" />
    </div>
  )
}

/* ─── Context chip ───────────────────────────────────────────────────────────── */
function ContextChip({ item, onRemove, onToggleNotes }) {
  const style = ITEM_STYLE[item.type] || ITEM_STYLE.library
  const isSpecial = item.id.startsWith('__')

  return (
    <div className={`inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-full text-[10px] font-medium border ${style.pill} border-transparent`}>
      <Icon name={style.icon} className={`text-[12px] ${style.color}`} />
      <span className="max-w-[100px] truncate">{item.name}</span>

      {/* Toggle notes inclusion */}
      {!isSpecial && (
        <button
          onClick={() => onToggleNotes(item.id)}
          title={item.includeNotes ? 'Remove notes from context' : 'Include notes in context'}
          className={`px-1 py-0.5 rounded-full text-[9px] font-semibold transition-colors ${
            item.includeNotes
              ? 'bg-purple-200 text-purple-700 hover:bg-purple-300'
              : 'bg-white/70 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {item.includeNotes ? '+notes' : 'notes?'}
        </button>
      )}

      <button
        onClick={() => onRemove(item.id)}
        className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
        title="Remove from context"
      >
        <Icon name="close" className="text-[11px]" />
      </button>
    </div>
  )
}

/* ─── Chat input with @ trigger ─────────────────────────────────────────────── */
function ChatInput({ onSend, sending, papers, websites, githubRepos, collections,
                     contextItems, onAddContext, onRemoveContext, onToggleNotes }) {
  const [value, setValue] = useState('')
  const [mentionQuery, setMentionQuery] = useState(null) // null = no dropdown
  const textareaRef = useRef(null)

  // Detect @ in textarea and track the query fragment after it
  function handleChange(e) {
    const val = e.target.value
    setValue(val)

    const pos = e.target.selectionStart
    const textBefore = val.slice(0, pos)
    const atIdx = textBefore.lastIndexOf('@')

    if (atIdx !== -1) {
      // Make sure it's a "fresh" @ (preceded by whitespace or start-of-string)
      const charBefore = textBefore[atIdx - 1]
      if (atIdx === 0 || /\s/.test(charBefore)) {
        const query = textBefore.slice(atIdx + 1)
        // Only show dropdown if there's no space inside the query fragment
        if (!query.includes(' ')) {
          setMentionQuery(query)
          return
        }
      }
    }
    setMentionQuery(null)
  }

  function handleKeyDown(e) {
    if (mentionQuery !== null && e.key === 'Escape') {
      setMentionQuery(null)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend()
    }
  }

  function handleSelectMention(item) {
    // Remove the "@query" from the textarea
    const pos = textareaRef.current?.selectionStart ?? value.length
    const atIdx = value.slice(0, pos).lastIndexOf('@')
    const newVal = value.slice(0, atIdx) + value.slice(pos)
    setValue(newVal)
    setMentionQuery(null)
    onAddContext(item)
    textareaRef.current?.focus()
  }

  function doSend() {
    const text = value.trim()
    if (!text || sending) return
    onSend(text)
    setValue('')
    setMentionQuery(null)
  }

  return (
    <div className="border-t border-slate-200 bg-white">
      {/* Context chips */}
      {contextItems.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1">
          {contextItems.map(item => (
            <ContextChip
              key={item.id}
              item={item}
              onRemove={onRemoveContext}
              onToggleNotes={onToggleNotes}
            />
          ))}
        </div>
      )}

      <div className="px-3 pt-2 relative">
        {mentionQuery !== null && (
          <MentionDropdown
            query={mentionQuery}
            papers={papers}
            websites={websites}
            githubRepos={githubRepos}
            collections={collections}
            onSelect={handleSelectMention}
          />
        )}

        <div className="border border-slate-200 rounded-lg overflow-hidden focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-500/20 transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder='Ask anything… type @ to add context'
            rows={3}
            className="w-full px-3 py-2 text-[13px] text-slate-700 placeholder-slate-400 resize-none focus:outline-none max-h-28 overflow-y-auto"
          />
          <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50/50 border-t border-slate-100">
            <span className="text-[10px] text-slate-400">
              @ to add context · Shift+Enter for new line
            </span>
            <button
              onClick={doSend}
              disabled={sending || !value.trim()}
              className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white text-[11px] font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Thinking…
                </>
              ) : (
                <>
                  <Icon name="send" className="text-[14px]" />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <div className="px-3 pb-2 pt-1">
        <p className="text-[10px] text-slate-400 text-center">Copilot can read and propose edits to any note in the library</p>
      </div>
    </div>
  )
}

/* ─── Main NotesCopilotPanel ────────────────────────────────────────────────── */
export default function NotesCopilotPanel({
  open,
  onToggle,
  libraryId,
  papers = [],
  websites = [],
  githubRepos = [],
  collections = [],
  allNotes = [],          // flat list of all loaded notes for diff lookup
  onNotesChanged,         // callback when a suggestion is accepted
  width = 340,
}) {
  const [messages, setMessages] = useState([])      // local history
  const [sending, setSending]   = useState(false)
  const [contextItems, setContextItems] = useState([])
  const scrollRef = useRef(null)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, sending])

  /* ─── Resolve context items into the payload shape expected by the backend ─ */
  const resolveContextItems = useCallback((items) => {
    const resolved = []
    for (const item of items) {
      if (item.type === 'all_papers') {
        for (const p of papers) {
          const notes = item.includeNotes
            ? (allNotes.filter(n => n.paperId === p.id || (n.sourceKey && n.sourceKey === `paper:${p.id}`)))
            : undefined
          resolved.push({ type: 'paper', id: p.id, name: p.title || 'Paper', metadata: p, notes })
        }
      } else if (item.type === 'all_websites') {
        for (const w of websites) {
          const notes = item.includeNotes
            ? allNotes.filter(n => n.websiteId === w.id || (n.sourceKey && n.sourceKey === `website:${w.id}`))
            : undefined
          resolved.push({ type: 'website', id: w.id, name: w.title || w.url || 'Website', metadata: w, notes })
        }
      } else if (item.type === 'all_repos') {
        for (const r of githubRepos) {
          const rName = `${r.owner || ''}/${r.repoName || r.repo_name || ''}`
          const notes = item.includeNotes
            ? allNotes.filter(n => n.githubRepoId === r.id || (n.sourceKey && n.sourceKey === `github:${r.id}`))
            : undefined
          resolved.push({ type: 'github_repo', id: r.id, name: rName, metadata: r, notes })
        }
      } else if (item.type === 'collection') {
        // Expand collection to all papers/websites/repos in the collection
        const cid = item.metadata?.id || item.id
        for (const p of papers.filter(p => (p.collections || []).includes(cid))) {
          resolved.push({ type: 'paper', id: p.id, name: p.title || 'Paper', metadata: p, notes: undefined })
        }
        for (const w of websites.filter(w => (w.collections || []).includes(cid))) {
          resolved.push({ type: 'website', id: w.id, name: w.title || w.url || 'Website', metadata: w, notes: undefined })
        }
        for (const r of githubRepos.filter(r => (r.collections || []).includes(cid))) {
          const rName = `${r.owner || ''}/${r.repoName || r.repo_name || ''}`
          resolved.push({ type: 'github_repo', id: r.id, name: rName, metadata: r, notes: undefined })
        }
      } else if (item.type === 'library') {
        const libNotes = allNotes.filter(n => n.libraryId === libraryId || (!n.paperId && !n.websiteId && !n.githubRepoId))
        resolved.push({ type: 'library', id: libraryId, name: 'Library notes', metadata: null, notes: libNotes })
      } else {
        // Single paper / website / github_repo
        let notes = undefined
        if (item.includeNotes) {
          if (item.type === 'paper')
            notes = allNotes.filter(n => n.paperId === item.id || (n.sourceKey && n.sourceKey === `paper:${item.id}`))
          else if (item.type === 'website')
            notes = allNotes.filter(n => n.websiteId === item.id || (n.sourceKey && n.sourceKey === `website:${item.id}`))
          else if (item.type === 'github_repo')
            notes = allNotes.filter(n => n.githubRepoId === item.id || (n.sourceKey && n.sourceKey === `github:${item.id}`))
        }
        resolved.push({ type: item.type, id: item.id, name: item.name, metadata: item.metadata, notes })
      }
    }
    return resolved
  }, [papers, websites, githubRepos, allNotes, libraryId])

  /* ─── Send message ─────────────────────────────────────────────────────── */
  async function handleSend(text) {
    if (!text.trim() || sending) return
    setSending(true)

    const userMsg = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const resolvedCtx = resolveContextItems(contextItems)
      // Build history (exclude the just-added temp message)
      const history = messages
        .filter(m => !m.id.startsWith('temp_'))
        .map(m => ({ role: m.role, content: m.content }))

      const payload = {
        content: text,
        context_items: resolvedCtx.map(ci => ({
          type: ci.type,
          id: ci.id,
          name: ci.name,
          metadata: ci.metadata || null,
          notes: ci.notes
            ? ci.notes.map(n => ({
                id: n.id, name: n.name, type: n.type,
                parent_id: n.parentId || null,
                content: n.type !== 'folder' ? (n.content || '') : null,
              }))
            : null,
        })),
        history,
      }

      const assistantMsg = await notesCopilotApi.send(libraryId, payload)
      // Replace temp message with real user entry, then add assistant response
      setMessages(prev => [
        ...prev.filter(m => m.id !== userMsg.id),
        { ...userMsg, id: `user_${Date.now()}` },
        assistantMsg,
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev.filter(m => m.id !== userMsg.id),
        { ...userMsg, id: `user_${Date.now()}` },
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `<p><em>Failed to get response: ${err.message}</em></p>`,
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  /* ─── Context management ───────────────────────────────────────────────── */
  function handleAddContext(item) {
    setContextItems(prev => {
      if (prev.some(c => c.id === item.id)) return prev
      return [...prev, { ...item, includeNotes: false }]
    })
  }
  function handleRemoveContext(id) {
    setContextItems(prev => prev.filter(c => c.id !== id))
  }
  function handleToggleNotes(id) {
    setContextItems(prev => prev.map(c => c.id === id ? { ...c, includeNotes: !c.includeNotes } : c))
  }

  /* ─── Suggestion accept/reject ─────────────────────────────────────────── */
  async function handleAccept(suggestion) {
    try {
      if (suggestion.type === 'create') {
        const tt = suggestion.targetType || 'library'
        const tid = suggestion.targetId || null
        const data = {
          name: suggestion.noteName,
          parent_id: suggestion.parentId || null,
          type: 'file',
          content: suggestion.content,
        }
        if (tt === 'paper' && tid) {
          await notesApi.create(tid, data)
        } else if (tt === 'website' && tid) {
          await notesApi.createForWebsite(tid, data)
        } else if (tt === 'github_repo' && tid) {
          await notesApi.createForGitHubRepo(tid, data)
        } else {
          // library-level note
          await notesApi.createForLibrary(libraryId, data)
        }
      } else if (suggestion.type === 'edit') {
        const noteExists = allNotes.some(n => n.id === suggestion.noteId)
        if (noteExists) {
          await notesApi.update(suggestion.noteId, { content: suggestion.content })
        } else {
          // Fallback: create as library note
          await notesApi.createForLibrary(libraryId, {
            name: suggestion.noteName || 'Untitled',
            type: 'file',
            content: suggestion.content,
          })
        }
      }

      setMessages(prev => prev.map(msg => {
        if (!msg.suggestions) return msg
        return { ...msg, suggestions: msg.suggestions.map(s => s.id === suggestion.id ? { ...s, status: 'accepted' } : s) }
      }))
      onNotesChanged?.()
    } catch (err) {
      console.error('Failed to apply suggestion:', err)
    }
  }

  function handleReject(suggestion) {
    setMessages(prev => prev.map(msg => {
      if (!msg.suggestions) return msg
      return { ...msg, suggestions: msg.suggestions.map(s => s.id === suggestion.id ? { ...s, status: 'rejected' } : s) }
    }))
  }

  async function handleClear() {
    if (!window.confirm('Clear Notes Copilot chat history?')) return
    try {
      await notesCopilotApi.clear(libraryId)
      setMessages([])
    } catch (_) {
      setMessages([])
    }
  }

  /* ─── Collapsed tab ─────────────────────────────────────────────────────── */
  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="w-10 flex-shrink-0 flex flex-col items-center justify-center gap-2 bg-slate-50 border-l border-slate-200 hover:bg-purple-50 transition-colors group"
        title="Open Notes Copilot"
      >
        <Icon name="smart_toy" className="text-[20px] text-slate-400 group-hover:text-purple-600 transition-colors" />
        <span className="text-[10px] font-semibold text-slate-400 group-hover:text-purple-600 [writing-mode:vertical-rl] tracking-wider">
          COPILOT
        </span>
      </button>
    )
  }

  /* ─── Full panel ────────────────────────────────────────────────────────── */
  const STARTER_PROMPTS = [
    'Summarise the key themes across all @-mentioned papers',
    'Compare the methodologies of the selected papers',
    'Write a literature review note using the selected context',
    'Identify gaps or open questions in the selected works',
    'Create a synthesis note with cross-paper insights',
  ]

  return (
    <div className="flex-shrink-0 flex flex-col border-l border-slate-200 bg-white" style={{ width }}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center">
            <Icon name="smart_toy" className="text-[14px] text-purple-600" />
          </span>
          <div>
            <span className="text-[12px] font-semibold text-slate-700">Notes Copilot</span>
            <span className="text-[10px] text-slate-400 ml-1.5">{messages.length} msgs</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button onClick={handleClear} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Clear history">
              <Icon name="delete_sweep" className="text-[16px]" />
            </button>
          )}
          <button onClick={onToggle} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="Close copilot">
            <Icon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>

      {/* Context summary bar */}
      {contextItems.length > 0 && (
        <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Icon name="hub" className="text-[13px] text-purple-400 flex-shrink-0" />
            <span className="text-[10px] text-slate-500">
              {contextItems.length} context item{contextItems.length !== 1 ? 's' : ''} — including{' '}
              {contextItems.filter(c => c.includeNotes).length} with notes
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <span className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center">
              <Icon name="smart_toy" className="text-[24px] text-purple-400" />
            </span>
            <div className="text-center">
              <p className="text-[13px] font-medium text-slate-600 mb-1">Notes Copilot</p>
              <p className="text-[11px] text-slate-400 max-w-[220px] leading-relaxed">
                Type <span className="font-mono bg-slate-100 px-1 rounded text-purple-600">@</span> to select context — papers, websites, repos, collections, or your notes.
                Then ask anything.
              </p>
            </div>
            <div className="w-full space-y-1.5 mt-1">
              {STARTER_PROMPTS.map(q => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="w-full text-left px-3 py-2 text-[11px] text-slate-600 bg-slate-50 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors border border-slate-100 hover:border-purple-200"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <ChatBubble
              key={msg.id}
              message={msg}
              allNotes={allNotes}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))
        )}

        {sending && (
          <div className="flex justify-start mb-3">
            <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-4 py-3 rounded-bl-md">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="text-[11px] text-slate-500">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        sending={sending}
        papers={papers}
        websites={websites}
        githubRepos={githubRepos}
        collections={collections}
        contextItems={contextItems}
        onAddContext={handleAddContext}
        onRemoveContext={handleRemoveContext}
        onToggleNotes={handleToggleNotes}
      />
    </div>
  )
}
