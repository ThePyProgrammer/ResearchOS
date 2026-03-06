import { useState, useEffect, useRef, useCallback } from 'react'
import { notesApi } from '../services/api'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function renderMarkdown(md) {
  if (!md) return ''
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-slate-800 text-slate-200 rounded-lg p-3 text-xs overflow-x-auto my-2"><code>$2</code></pre>')
    // inline code
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-[11px]">$1</code>')
    // headers
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-slate-800 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-slate-800 mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-slate-900 mt-4 mb-2">$1</h1>')
    // bold & italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">$1</a>')
    // unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-xs text-slate-600">$1</li>')
    // line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
  return html
}

function TreeNode({ note, notes, selected, expanded, onSelect, onToggle, onContextMenu, depth = 0 }) {
  const children = notes.filter(n => n.parentId === note.id)
  const isFolder = note.type === 'folder'
  const isOpen = expanded[note.id]
  const isSelected = selected === note.id

  return (
    <div>
      <button
        onClick={() => {
          if (isFolder) onToggle(note.id)
          else onSelect(note.id)
        }}
        onContextMenu={e => { e.preventDefault(); onContextMenu(e, note) }}
        className={`w-full flex items-center gap-1 py-1 text-[12px] rounded transition-colors ${
          isSelected
            ? 'bg-blue-100 text-blue-700'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: 8 }}
      >
        {isFolder ? (
          <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="text-[14px] text-slate-400 flex-shrink-0" />
        ) : (
          <span className="w-[14px] flex-shrink-0" />
        )}
        <Icon
          name={isFolder ? (isOpen ? 'folder_open' : 'folder') : 'description'}
          className={`text-[15px] flex-shrink-0 ${isFolder ? 'text-amber-500' : 'text-slate-400'}`}
        />
        <span className="truncate">{note.name}</span>
      </button>
      {isFolder && isOpen && children
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1))
        .map(child => (
          <TreeNode
            key={child.id}
            note={child}
            notes={notes}
            selected={selected}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
            onContextMenu={onContextMenu}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

export default function NotesPanel({ paperId }) {
  const [notes, setNotes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState('edit') // edit | preview
  const [creating, setCreating] = useState(null) // { parentId, type }
  const [newName, setNewName] = useState('')
  const [ctxMenu, setCtxMenu] = useState(null)
  const [renaming, setRenaming] = useState(null) // noteId
  const [renameDraft, setRenameDraft] = useState('')
  const saveTimerRef = useRef(null)
  const textareaRef = useRef(null)

  const selectedNote = notes.find(n => n.id === selectedId)

  // Load notes
  useEffect(() => {
    notesApi.list(paperId).then(setNotes).catch(console.error)
  }, [paperId])

  // Sync content when selection changes
  useEffect(() => {
    if (selectedNote) {
      setContent(selectedNote.content || '')
      setDirty(false)
      setMode('edit')
    }
  }, [selectedId])

  // Auto-save debounce
  const save = useCallback(async () => {
    if (!selectedId || !dirty) return
    try {
      const updated = await notesApi.update(selectedId, { content })
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))
      setDirty(false)
    } catch (err) {
      console.error('Failed to save note:', err)
    }
  }, [selectedId, content, dirty])

  useEffect(() => {
    if (!dirty) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(save, 1200)
    return () => clearTimeout(saveTimerRef.current)
  }, [content, dirty, save])

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [!!ctxMenu])

  function handleToggle(id) {
    setExpanded(e => ({ ...e, [id]: !e[id] }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const note = await notesApi.create(paperId, {
        name: newName.trim(),
        parentId: creating.parentId,
        type: creating.type,
      })
      setNotes(prev => [...prev, note])
      if (creating.parentId) setExpanded(e => ({ ...e, [creating.parentId]: true }))
      if (note.type === 'file') setSelectedId(note.id)
      setCreating(null)
      setNewName('')
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }

  async function handleDelete(noteId) {
    try {
      await notesApi.remove(noteId)
      // Remove from state (including children)
      const toRemove = new Set()
      function collect(id) {
        toRemove.add(id)
        notes.filter(n => n.parentId === id).forEach(n => collect(n.id))
      }
      collect(noteId)
      setNotes(prev => prev.filter(n => !toRemove.has(n.id)))
      if (toRemove.has(selectedId)) setSelectedId(null)
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
    setCtxMenu(null)
  }

  async function handleRename(e) {
    e.preventDefault()
    if (!renameDraft.trim() || !renaming) return
    try {
      const updated = await notesApi.update(renaming, { name: renameDraft.trim() })
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))
    } catch (err) {
      console.error('Failed to rename note:', err)
    }
    setRenaming(null)
  }

  function handleContentChange(e) {
    setContent(e.target.value)
    setDirty(true)
  }

  function handleTab(e) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const val = ta.value
      setContent(val.substring(0, start) + '  ' + val.substring(end))
      setDirty(true)
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
    }
  }

  const rootNotes = notes
    .filter(n => !n.parentId)
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1))

  return (
    <div className="flex h-full">
      {/* File tree */}
      <div className="w-44 flex-shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/50">
        <div className="px-2 py-2 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest pl-1">Explorer</span>
          <div className="flex gap-0.5">
            <button
              onClick={() => { setCreating({ parentId: null, type: 'file' }); setNewName('') }}
              className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="New file"
            >
              <Icon name="note_add" className="text-[15px]" />
            </button>
            <button
              onClick={() => { setCreating({ parentId: null, type: 'folder' }); setNewName('') }}
              className="p-0.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
              title="New folder"
            >
              <Icon name="create_new_folder" className="text-[15px]" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {rootNotes.map(note => (
            <TreeNode
              key={note.id}
              note={note}
              notes={notes}
              selected={selectedId}
              expanded={expanded}
              onSelect={setSelectedId}
              onToggle={handleToggle}
              onContextMenu={(e, n) => setCtxMenu({ note: n, x: e.clientX, y: e.clientY })}
            />
          ))}

          {/* Inline create form */}
          {creating && (
            <form onSubmit={handleCreate} className="px-2 py-1">
              <div className="flex items-center gap-1">
                <Icon
                  name={creating.type === 'folder' ? 'folder' : 'description'}
                  className={`text-[14px] flex-shrink-0 ${creating.type === 'folder' ? 'text-amber-500' : 'text-slate-400'}`}
                />
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setCreating(null) }}
                  placeholder={creating.type === 'folder' ? 'Folder name' : 'File name'}
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded focus:outline-none focus:border-blue-400"
                />
              </div>
            </form>
          )}

          {notes.length === 0 && !creating && (
            <div className="px-3 py-6 text-center">
              <Icon name="edit_note" className="text-[28px] text-slate-300 mb-2" />
              <p className="text-[11px] text-slate-400">No notes yet</p>
              <button
                onClick={() => { setCreating({ parentId: null, type: 'file' }); setNewName('') }}
                className="mt-2 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                Create a note
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedNote ? (
          <>
            {/* Editor toolbar */}
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon name="description" className="text-[14px] text-slate-400 flex-shrink-0" />
                <span className="text-[12px] font-medium text-slate-700 truncate">{selectedNote.name}</span>
                {dirty && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Unsaved" />}
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setMode('edit')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    mode === 'edit' ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Edit
                </button>
                <button
                  onClick={() => { save(); setMode('preview') }}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    mode === 'preview' ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>

            {/* Content area */}
            {mode === 'edit' ? (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleTab}
                onBlur={save}
                placeholder="Start writing…"
                spellCheck={false}
                className="flex-1 w-full resize-none p-4 text-[13px] leading-relaxed font-mono text-slate-700 bg-white focus:outline-none placeholder:text-slate-300"
              />
            ) : (
              <div
                className="flex-1 overflow-y-auto p-4 prose-sm text-[13px] leading-relaxed text-slate-700"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Icon name="edit_note" className="text-[36px] text-slate-300" />
            <p className="text-xs">Select a note to edit</p>
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 50 }}
          className="bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-44"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 border-b border-slate-100 mb-1">
            <p className="text-[11px] text-slate-400 truncate">{ctxMenu.note.name}</p>
          </div>
          {ctxMenu.note.type === 'folder' && (
            <>
              <button
                onClick={() => { setCreating({ parentId: ctxMenu.note.id, type: 'file' }); setNewName(''); setExpanded(e => ({ ...e, [ctxMenu.note.id]: true })); setCtxMenu(null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
              >
                <Icon name="note_add" className="text-[14px] text-slate-400" />
                New file
              </button>
              <button
                onClick={() => { setCreating({ parentId: ctxMenu.note.id, type: 'folder' }); setNewName(''); setExpanded(e => ({ ...e, [ctxMenu.note.id]: true })); setCtxMenu(null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
              >
                <Icon name="create_new_folder" className="text-[14px] text-slate-400" />
                New subfolder
              </button>
            </>
          )}
          {renaming === ctxMenu.note.id ? (
            <form onSubmit={handleRename} className="px-3 py-1.5">
              <input
                autoFocus
                value={renameDraft}
                onChange={e => setRenameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setRenaming(null); setCtxMenu(null) } }}
                className="w-full px-1.5 py-0.5 text-[11px] border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              />
            </form>
          ) : (
            <button
              onClick={() => { setRenaming(ctxMenu.note.id); setRenameDraft(ctxMenu.note.name) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              <Icon name="edit" className="text-[14px] text-slate-400" />
              Rename
            </button>
          )}
          <div className="my-1 border-t border-slate-100" />
          <button
            onClick={() => handleDelete(ctxMenu.note.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
          >
            <Icon name="delete" className="text-[14px]" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
