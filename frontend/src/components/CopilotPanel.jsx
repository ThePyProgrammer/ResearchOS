import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { chatApi } from '../services/api'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

/* ─── Tiptap input for composing messages ─── */
function ChatInput({ onSend, sending }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: 'Ask about this paper...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'copilot-input focus:outline-none',
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          const html = view.state.doc.textContent.trim()
          if (html && !sending) {
            onSend(view.dom.closest('.copilot-input-wrap')?.__editorRef?.getHTML() || html)
          }
          return true
        }
        return false
      },
    },
  })

  // Store ref for keydown handler access
  useEffect(() => {
    if (!editor) return
    const wrap = editor.view.dom.closest('.copilot-input-wrap')
    if (wrap) wrap.__editorRef = editor
  }, [editor])

  const handleSend = useCallback(() => {
    if (!editor || sending) return
    const html = editor.getHTML()
    const text = editor.state.doc.textContent.trim()
    if (!text) return
    onSend(html)
    editor.commands.clearContent()
  }, [editor, onSend, sending])

  if (!editor) return null

  return (
    <div className="copilot-input-wrap border-t border-slate-200 bg-white">
      <div className="px-3 pt-2">
        <div className="border border-slate-200 rounded-lg overflow-hidden focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
          <EditorContent
            editor={editor}
            className="max-h-24 overflow-y-auto px-3 py-2 text-[13px] text-slate-700"
          />
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
        <p className="text-[10px] text-slate-400 text-center">Copilot uses GPT-4o-mini with paper context</p>
      </div>
    </div>
  )
}

/* ─── Chat message bubble ─── */
function ChatBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
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
        <div
          className={`text-[13px] leading-relaxed rounded-xl px-3.5 py-2.5 ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-md'
              : 'bg-slate-100 text-slate-700 rounded-bl-md'
          }`}
        >
          <div
            className="copilot-message-content"
            dangerouslySetInnerHTML={{ __html: message.content }}
          />
        </div>
      </div>
    </div>
  )
}

/* ─── Main CopilotPanel ─── */
export default function CopilotPanel({ paperId, open, onToggle }) {
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef(null)

  // Load chat history
  useEffect(() => {
    if (!paperId) return
    setLoading(true)
    chatApi.list(paperId)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [paperId])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  async function handleSend(content) {
    if (!content.trim() || sending) return
    setSending(true)

    // Optimistic user message
    const tempUserMsg = {
      id: `temp_${Date.now()}`,
      paperId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const assistantMsg = await chatApi.send(paperId, { content })
      // Replace temp message and add assistant response
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id)
        // Re-fetch to get both saved messages
        return withoutTemp
      })
      // Re-fetch the full history to stay in sync
      const updated = await chatApi.list(paperId)
      setMessages(updated)
    } catch (err) {
      console.error('Chat send failed:', err)
      // Remove optimistic message and show error
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id)
        return [
          ...withoutTemp,
          {
            id: `err_${Date.now()}`,
            paperId,
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

  async function handleClear() {
    if (!window.confirm('Clear all chat history for this paper?')) return
    try {
      await chatApi.clear(paperId)
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
    <div className="w-80 flex-shrink-0 flex flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center">
            <Icon name="smart_toy" className="text-[14px] text-purple-600" />
          </span>
          <div>
            <span className="text-[12px] font-semibold text-slate-700">AI Copilot</span>
            <span className="text-[10px] text-slate-400 ml-1.5">{messages.length} messages</span>
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
                Ask questions about this paper, get summaries, brainstorm ideas, or get help writing notes.
              </p>
            </div>
            <div className="w-full space-y-1.5 mt-2">
              {[
                'Summarize the key contributions',
                'What are the limitations?',
                'Explain the methodology',
                'Suggest related work',
              ].map(q => (
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
            <ChatBubble key={msg.id} message={msg} />
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
      <ChatInput onSend={handleSend} sending={sending} />
    </div>
  )
}
