import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import Mathematics from '@tiptap/extension-mathematics'
import 'katex/dist/katex.min.css'
import { notesApi } from '../services/api'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

/* ─── Toolbar Button ─── */
function ToolBtn({ icon, label, active, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      } ${className}`}
    >
      <Icon name={icon} className="text-[16px]" />
    </button>
  )
}

/* ─── Tiptap WYSIWYG Editor ─── */
function TiptapEditor({ content, onUpdate, onSave }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: '' } },
      }),
      Placeholder.configure({
        placeholder: 'Start writing, or type / for commands...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: '' },
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: false }),
      Typography,
      Mathematics,
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML())
    },
    onBlur: () => {
      onSave?.()
    },
  })

  // Sync content when it changes externally (note selection change)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (content !== current) {
      editor.commands.setContent(content || '', false)
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <>
      {/* Fixed toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-slate-100 bg-white flex-wrap">
        <select
          value={
            editor.isActive('heading', { level: 1 }) ? 'h1'
            : editor.isActive('heading', { level: 2 }) ? 'h2'
            : editor.isActive('heading', { level: 3 }) ? 'h3'
            : 'p'
          }
          onChange={e => {
            const v = e.target.value
            if (v === 'p') editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: parseInt(v[1]) }).run()
          }}
          className="text-[11px] text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-blue-400 mr-1"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <div className="w-px h-4 bg-slate-200 mx-0.5" />

        <ToolBtn icon="format_bold" label="Bold (Ctrl+B)" active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolBtn icon="format_italic" label="Italic (Ctrl+I)" active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolBtn icon="format_underlined" label="Underline (Ctrl+U)" active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolBtn icon="format_strikethrough" label="Strikethrough" active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ToolBtn icon="ink_highlighter" label="Highlight" active={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight().run()} />
        <ToolBtn icon="code" label="Inline code" active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()} />
        <ToolBtn icon="link" label="Link" active={editor.isActive('link')}
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run()
            } else {
              const url = window.prompt('URL')
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }
          }} />

        <div className="w-px h-4 bg-slate-200 mx-0.5" />

        <ToolBtn icon="format_list_bulleted" label="Bullet list" active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolBtn icon="format_list_numbered" label="Numbered list" active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolBtn icon="checklist" label="Task list" active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()} />

        <div className="w-px h-4 bg-slate-200 mx-0.5" />

        <ToolBtn icon="format_quote" label="Blockquote" active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolBtn icon="code_blocks" label="Code block" active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <ToolBtn icon="horizontal_rule" label="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <ToolBtn icon="function" label="Inline math (LaTeX)"
          onClick={() => {
            const latex = window.prompt('LaTeX expression', 'E = mc^2')
            if (latex) editor.chain().focus().setInlineMath(latex).run()
          }} />

        <div className="w-px h-4 bg-slate-200 mx-0.5" />

        <ToolBtn icon="undo" label="Undo (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()} />
        <ToolBtn icon="redo" label="Redo (Ctrl+Shift+Z)"
          onClick={() => editor.chain().focus().redo().run()} />
      </div>

      {/* Editor content area */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full p-4" />
      </div>
    </>
  )
}

/* ─── File Tree Node ─── */
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

/* ─── Main NotesPanel ─── */
export default function NotesPanel({ paperId, notes, setNotes, createFn }) {
  const [selectedId, setSelectedId] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(null)
  const [newName, setNewName] = useState('')
  const [ctxMenu, setCtxMenu] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const saveTimerRef = useRef(null)

  const selectedNote = notes.find(n => n.id === selectedId)

  // Sync content when selection changes
  useEffect(() => {
    if (selectedNote) {
      setContent(selectedNote.content || '')
      setDirty(false)
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

  function handleContentUpdate(html) {
    setContent(html)
    setDirty(true)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const _create = createFn ?? ((data) => notesApi.create(paperId, data))
      const note = await _create({
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

      {/* Editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedNote ? (
          <>
            {/* Editor header */}
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon name="description" className="text-[14px] text-slate-400 flex-shrink-0" />
                <span className="text-[12px] font-medium text-slate-700 truncate">{selectedNote.name}</span>
                {dirty && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Unsaved" />}
              </div>
              <button
                onClick={save}
                disabled={!dirty}
                className="text-[11px] text-slate-400 hover:text-blue-600 disabled:opacity-30 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
              >
                Save
              </button>
            </div>

            {/* Tiptap WYSIWYG */}
            <TiptapEditor
              content={content}
              onUpdate={handleContentUpdate}
              onSave={save}
            />
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
