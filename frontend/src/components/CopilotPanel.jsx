import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { chatApi, notesApi } from '../services/api'

/* ─── Utilities ─── */

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

/**
 * Convert [[Note Name]] patterns in chat HTML into clickable styled inline spans.
 * The data-wiki-name attribute is picked up by a delegated click handler on the
 * bubble container to navigate to the linked note.
 */
function renderWikiLinksInHtml(html) {
  if (!html) return html
  return html.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
    const safe = name.replace(/"/g, '&quot;')
    return `<span data-wiki-name="${safe}" title="Open note: ${safe}" class="wiki-link-chat" style="color:#6366f1;font-weight:500;background:rgba(99,102,241,0.08);border-radius:3px;padding:0 3px;cursor:pointer;text-decoration:underline dotted #a5b4fc;">${name}</span>`
  })
}

/** Combined renderer: latex then wiki-links. */
function renderChatHtml(html) {
  return renderWikiLinksInHtml(renderLatexInHtml(html))
}

/** Strip HTML tags to get plain text for diffing. */
function stripHtml(html) {
  if (!html) return ''
  const el = document.createElement('div')
  el.innerHTML = html
  return el.textContent || ''
}

/** Simple line-based diff. Returns array of {type: 'same'|'add'|'del', text}. */
function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result = []

  // Simple LCS-based diff
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
      result.push({ type: 'same', text: oldLines[i] })
      i++; j++
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: 'add', text: newLines[j] })
      j++
    } else {
      result.push({ type: 'del', text: oldLines[i] })
      i++
    }
  }
  return result
}

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

/* ─── Diff Viewer ─── */
function DiffView({ oldContent, newContent, type }) {
  const [expanded, setExpanded] = useState(false)
  const oldText = stripHtml(oldContent || '')
  const newText = stripHtml(newContent || '')

  if (type === 'create') {
    const lines = newText.split('\n')
    const displayLines = expanded ? lines : lines.slice(0, 12)
    return (
      <div className="text-[11px] font-mono leading-relaxed max-h-60 overflow-y-auto">
        {displayLines.map((line, i) => (
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
  const hasChanges = diff.some(d => d.type !== 'same')
  if (!hasChanges) {
    return <p className="text-[11px] text-slate-400 italic px-2 py-2">No changes detected.</p>
  }

  const displayDiff = expanded ? diff : diff.slice(0, 20)
  return (
    <div className="text-[11px] font-mono leading-relaxed max-h-60 overflow-y-auto">
      {displayDiff.map((d, i) => (
        <div key={i} className={`px-2 py-px flex ${
          d.type === 'add' ? 'bg-emerald-50 text-emerald-800'
          : d.type === 'del' ? 'bg-red-50 text-red-800'
          : 'text-slate-500'
        }`}>
          <span className={`w-5 text-right mr-2 select-none flex-shrink-0 ${
            d.type === 'add' ? 'text-emerald-400' : d.type === 'del' ? 'text-red-400' : 'text-slate-300'
          }`}>
            {d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' '}
          </span>
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

/* ─── Suggestion Card ─── */
function SuggestionCard({ suggestion, currentNotes, onAccept, onReject }) {
  const [showDiff, setShowDiff] = useState(true)
  const isCreate = suggestion.type === 'create'
  const isAccepted = suggestion.status === 'accepted'
  const isRejected = suggestion.status === 'rejected'
  const isPending = suggestion.status === 'pending'

  // Find current content for edits
  const currentNote = !isCreate ? currentNotes.find(n => n.id === suggestion.noteId) : null
  const currentContent = currentNote?.content || ''

  return (
    <div className={`rounded-lg border overflow-hidden mb-2 ${
      isAccepted ? 'border-emerald-200 bg-emerald-50/30'
      : isRejected ? 'border-slate-200 bg-slate-50/50 opacity-60'
      : 'border-purple-200 bg-white'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/50 border-b border-slate-100">
        <Icon
          name={isCreate ? 'note_add' : 'edit_note'}
          className={`text-[15px] ${isCreate ? 'text-emerald-500' : 'text-blue-500'}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-700 truncate">{suggestion.noteName}</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
              isCreate ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {isCreate ? 'NEW' : 'EDIT'}
            </span>
            {isAccepted && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ACCEPTED</span>
            )}
            {isRejected && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">REJECTED</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{suggestion.description}</p>
        </div>
        <button
          onClick={() => setShowDiff(d => !d)}
          className="p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title={showDiff ? 'Collapse' : 'Expand'}
        >
          <Icon name={showDiff ? 'expand_less' : 'expand_more'} className="text-[16px]" />
        </button>
      </div>

      {/* Diff view */}
      {showDiff && (
        <DiffView
          oldContent={currentContent}
          newContent={suggestion.content}
          type={suggestion.type}
        />
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-slate-100 bg-white">
          <button
            onClick={() => onAccept(suggestion)}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-[11px] font-medium rounded-md hover:bg-emerald-700 transition-colors"
          >
            <Icon name="check" className="text-[14px]" />
            Accept
          </button>
          <button
            onClick={() => onReject(suggestion)}
            className="flex items-center gap-1 px-2.5 py-1 bg-white text-slate-600 text-[11px] font-medium rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <Icon name="close" className="text-[14px]" />
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Tiptap input for composing messages ─── */
function ChatInput({ onSend, sending, placeholder = 'Ask about this item...' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, codeBlock: false, blockquote: false, horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'copilot-input focus:outline-none' },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          const text = view.state.doc.textContent.trim()
          if (text && !sending) {
            onSend(view.dom.closest('.copilot-input-wrap')?.__editorRef?.getHTML() || text)
          }
          return true
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const wrap = editor.view.dom.closest('.copilot-input-wrap')
    if (wrap) wrap.__editorRef = editor
  }, [editor])

  const handleSend = useCallback(() => {
    if (!editor || sending) return
    const text = editor.state.doc.textContent.trim()
    if (!text) return
    onSend(editor.getHTML())
    editor.commands.clearContent()
  }, [editor, onSend, sending])

  if (!editor) return null

  return (
    <div className="copilot-input-wrap border-t border-slate-200 bg-white">
      <div className="px-3 pt-2">
        <div className="border border-slate-200 rounded-lg overflow-hidden focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
          <EditorContent editor={editor} className="max-h-24 overflow-y-auto px-3 py-2 text-[13px] text-slate-700" />
          <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50/50 border-t border-slate-100">
            <span className="text-[10px] text-slate-400">Shift+Enter for new line</span>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white text-[11px] font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Thinking...
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
        <p className="text-[10px] text-slate-400 text-center">Copilot can suggest edits to your notes</p>
      </div>
    </div>
  )
}

/* ─── Chat message bubble ─── */
function ChatBubble({ message, currentNotes, onSuggestionAccept, onSuggestionReject, onWikiLinkClick }) {
  const isUser = message.role === 'user'
  const renderedContent = useMemo(() => renderChatHtml(message.content), [message.content])
  const suggestions = message.suggestions || []

  function handleContentClick(e) {
    const el = e.target.closest('[data-wiki-name]')
    if (el && onWikiLinkClick) {
      e.preventDefault()
      onWikiLinkClick(el.dataset.wikiName)
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`${isUser ? 'max-w-[85%] order-2' : 'max-w-[95%] order-1'}`}>
        <div className="flex items-center gap-1.5 mb-1">
          {!isUser && (
            <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Icon name="smart_toy" className="text-[12px] text-purple-600" />
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-medium">
            {isUser ? 'You' : 'Copilot'}
          </span>
          <span className="text-[10px] text-slate-300">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Text content */}
        {message.content && (
          <div
            className={`text-[13px] leading-relaxed rounded-xl px-3.5 py-2.5 ${
              isUser
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-slate-100 text-slate-700 rounded-bl-md'
            }`}
          >
            <div
              className="copilot-message-content"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
              onClick={handleContentClick}
            />
          </div>
        )}

        {/* Suggestion cards */}
        {suggestions.length > 0 && (
          <div className="mt-2 space-y-2">
            {suggestions.map(sug => (
              <SuggestionCard
                key={sug.id}
                suggestion={sug}
                currentNotes={currentNotes}
                onAccept={onSuggestionAccept}
                onReject={onSuggestionReject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main CopilotPanel ─── */
export default function CopilotPanel({ paperId, websiteId, githubRepoId, open, onToggle, notes, onNotesChanged, onWikiLinkClick, width }) {
  const isWebsite = Boolean(websiteId)
  const isGitHubRepo = Boolean(githubRepoId)
  const itemId = paperId || websiteId || githubRepoId

  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [textStatus, setTextStatus] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const scrollRef = useRef(null)

  // Load chat history (+ text extraction status for papers)
  useEffect(() => {
    if (!itemId) return
    setLoading(true)
    const listPromise = isGitHubRepo
      ? chatApi.listForGitHubRepo(githubRepoId)
      : isWebsite
        ? chatApi.listForWebsite(websiteId)
        : chatApi.list(paperId)
    const statusPromise = (!isWebsite && !isGitHubRepo)
      ? chatApi.getTextStatus(paperId).catch(() => null)
      : Promise.resolve(null)
    Promise.all([listPromise, statusPromise])
      .then(([msgs, status]) => {
        setMessages(msgs)
        setTextStatus(status)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [itemId])

  async function handleExtract() {
    if (isWebsite || isGitHubRepo) return
    setExtracting(true)
    try {
      const status = await chatApi.extractText(paperId)
      setTextStatus(status)
    } catch (err) {
      console.error('Extraction failed:', err)
    } finally {
      setExtracting(false)
    }
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  async function handleSend(content) {
    if (!content.trim() || sending) return
    setSending(true)

    const tempUserMsg = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const notesCtx = (notes || []).map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        parentId: n.parentId || null,
        content: n.type !== 'folder' ? (n.content || '') : undefined,
      }))

      const payload = { content, notesContext: notesCtx.length > 0 ? notesCtx : undefined }

      if (isGitHubRepo) {
        await chatApi.sendForGitHubRepo(githubRepoId, payload)
        const updated = await chatApi.listForGitHubRepo(githubRepoId)
        setMessages(updated)
      } else if (isWebsite) {
        await chatApi.sendForWebsite(websiteId, payload)
        const updated = await chatApi.listForWebsite(websiteId)
        setMessages(updated)
      } else {
        await chatApi.send(paperId, payload)
        const updated = await chatApi.list(paperId)
        setMessages(updated)
      }
    } catch (err) {
      console.error('Chat send failed:', err)
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id)
        return [
          ...withoutTemp,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: `<p><em>Failed to get response: ${err.message}</em></p>`,
            createdAt: new Date().toISOString(),
          },
        ]
      })
    } finally {
      setSending(false)
    }
  }

  async function handleSuggestionAccept(suggestion) {
    const createNote = (data) =>
      isGitHubRepo
        ? notesApi.createForGitHubRepo(githubRepoId, data)
        : isWebsite
          ? notesApi.createForWebsite(websiteId, data)
          : notesApi.create(paperId, data)

    try {
      if (suggestion.type === 'create') {
        await createNote({
          name: suggestion.noteName,
          parentId: suggestion.parentId || null,
          type: 'file',
          content: suggestion.content,
        })
      } else if (suggestion.type === 'edit') {
        const noteExists = (notes || []).some(n => n.id === suggestion.noteId)
        if (noteExists) {
          await notesApi.update(suggestion.noteId, { content: suggestion.content })
        } else {
          await createNote({
            name: suggestion.noteName || 'Untitled',
            parentId: suggestion.parentId || null,
            type: 'file',
            content: suggestion.content,
          })
        }
      }

      // Update suggestion status in local state
      setMessages(prev => prev.map(msg => {
        if (!msg.suggestions) return msg
        return {
          ...msg,
          suggestions: msg.suggestions.map(s =>
            s.id === suggestion.id ? { ...s, status: 'accepted' } : s
          ),
        }
      }))

      // Trigger notes refresh
      onNotesChanged?.()
    } catch (err) {
      console.error('Failed to apply suggestion:', err)
    }
  }

  function handleSuggestionReject(suggestion) {
    setMessages(prev => prev.map(msg => {
      if (!msg.suggestions) return msg
      return {
        ...msg,
        suggestions: msg.suggestions.map(s =>
          s.id === suggestion.id ? { ...s, status: 'rejected' } : s
        ),
      }
    }))
  }

  async function handleClear() {
    const label = isGitHubRepo ? 'repository' : isWebsite ? 'website' : 'paper'
    if (!window.confirm(`Clear all chat history for this ${label}?`)) return
    try {
      if (isGitHubRepo) {
        await chatApi.clearForGitHubRepo(githubRepoId)
      } else if (isWebsite) {
        await chatApi.clearForWebsite(websiteId)
      } else {
        await chatApi.clear(paperId)
      }
      setMessages([])
    } catch (err) {
      console.error('Failed to clear chat:', err)
    }
  }

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="w-10 flex-shrink-0 flex flex-col items-center justify-center gap-2 bg-slate-50 border-l border-slate-200 hover:bg-purple-50 transition-colors group"
        title="Open AI Copilot"
      >
        <Icon name="smart_toy" className="text-[20px] text-slate-400 group-hover:text-purple-600 transition-colors" />
        <span className="text-[10px] font-semibold text-slate-400 group-hover:text-purple-600 [writing-mode:vertical-rl] tracking-wider">
          COPILOT
        </span>
      </button>
    )
  }

  return (
    <div
      className="flex-shrink-0 flex flex-col border-l border-slate-200 bg-white"
      style={{ width: width ?? 320 }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center">
            <Icon name="smart_toy" className="text-[14px] text-purple-600" />
          </span>
          <div>
            <span className="text-[12px] font-semibold text-slate-700">AI Copilot</span>
            <span className="text-[10px] text-slate-400 ml-1.5">{messages.length} msgs</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Clear history"
            >
              <Icon name="delete_sweep" className="text-[16px]" />
            </button>
          )}
          <button
            onClick={onToggle}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Close copilot"
          >
            <Icon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>

      {/* Context status */}
      <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/50">
        {isWebsite ? (
          <div className="flex items-center gap-1.5">
            <Icon name="language" className="text-[13px] text-teal-500" />
            <span className="text-[10px] text-teal-700 font-medium">Website context available</span>
          </div>
        ) : textStatus?.pageCount ? (
          <div className="flex items-center gap-1.5">
            <Icon name="check_circle" className="text-[13px] text-emerald-500" />
            <span className="text-[10px] text-emerald-700 font-medium">
              PDF indexed — {textStatus.pageCount} pages, {Math.round(textStatus.charCount / 1000)}k chars
            </span>
          </div>
        ) : extracting ? (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
            <span className="text-[10px] text-purple-700 font-medium">Extracting PDF text...</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon name="info" className="text-[13px] text-slate-400" />
              <span className="text-[10px] text-slate-500">PDF not indexed</span>
            </div>
            <button
              onClick={handleExtract}
              className="text-[10px] text-purple-600 hover:text-purple-700 font-medium hover:underline"
            >
              Index now
            </button>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-[12px] text-slate-400 animate-pulse">Loading history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <span className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center">
              <Icon name="smart_toy" className="text-[24px] text-purple-400" />
            </span>
            <div className="text-center">
              <p className="text-[13px] font-medium text-slate-600 mb-1">Research Copilot</p>
              <p className="text-[11px] text-slate-400 max-w-[200px] leading-relaxed">
                Ask questions, get summaries, or ask Copilot to write and edit your notes.
              </p>
            </div>
            <div className="w-full space-y-1.5 mt-2">
              {(isWebsite ? [
                'Summarize the key points of this page',
                'Create a notes file with key takeaways',
                'What are the main arguments or claims?',
                'Write a summary note about this site',
              ] : [
                'Summarize the key contributions',
                'Create a notes file with key takeaways',
                'What are the limitations?',
                'Write a methodology summary note',
              ]).map(q => (
                <button
                  key={q}
                  onClick={() => handleSend(`<p>${q}</p>`)}
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
              currentNotes={notes || []}
              onSuggestionAccept={handleSuggestionAccept}
              onSuggestionReject={handleSuggestionReject}
              onWikiLinkClick={onWikiLinkClick}
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
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <ChatInput
        onSend={handleSend}
        sending={sending}
        placeholder={isWebsite ? 'Ask about this website...' : 'Ask about this paper...'}
      />
    </div>
  )
}
