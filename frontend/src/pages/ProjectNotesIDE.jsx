import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
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
import { TableKit } from '@tiptap/extension-table'
import 'katex/dist/katex.min.css'
import { notesApi, experimentsApi, projectNotesCopilotApi, projectPapersApi, papersApi, websitesApi, githubReposApi } from '../services/api'
import { createWikiLinkExtension, extractWikiLinks } from '../components/WikiLinkExtension'
import NoteGraphView from '../components/NoteGraphView'
import NotesCopilotPanel, { SuggestionTabView } from '../components/NotesCopilotPanel'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// ─── Toolbar button ───────────────────────────────────────────────────────────
function ToolBtn({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1 rounded transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <Icon name={icon} className="text-[16px]" />
    </button>
  )
}

// ─── Export utilities ─────────────────────────────────────────────────────────
function _nodeToMd(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const tag = node.tagName.toLowerCase()
  const inner = () => Array.from(node.childNodes).map(_nodeToMd).join('')
  switch (tag) {
    case 'h1': return `# ${inner()}\n\n`
    case 'h2': return `## ${inner()}\n\n`
    case 'h3': return `### ${inner()}\n\n`
    case 'p':  return `${inner()}\n\n`
    case 'br': return '\n'
    case 'hr': return `---\n\n`
    case 'strong': case 'b': return `**${inner()}**`
    case 'em':     case 'i': return `*${inner()}*`
    case 's':  return `~~${inner()}~~`
    case 'u':  case 'mark': return inner()
    case 'code': return node.closest('pre') ? inner() : `\`${inner()}\``
    case 'pre': {
      const lang = node.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] ?? ''
      return `\`\`\`${lang}\n${inner()}\n\`\`\`\n\n`
    }
    case 'blockquote': return `${inner().trim().split('\n').map(l => `> ${l}`).join('\n')}\n\n`
    case 'a': return `[${inner()}](${node.getAttribute('href') ?? ''})`
    case 'ul': return Array.from(node.children).map(li => {
      const cb = li.querySelector('input[type="checkbox"]')
      const text = _nodeToMd(li).trim()
      if (cb) return `- [${cb.checked ? 'x' : ' '}] ${text}\n`
      return `- ${text}\n`
    }).join('') + '\n'
    case 'ol': return Array.from(node.children).map((li, i) => `${i + 1}. ${_nodeToMd(li).trim()}\n`).join('') + '\n'
    case 'li': return inner()
    case 'input': return ''
    case 'span':
      if (node.dataset.wikiName) return `[[${node.dataset.wikiName}]]`
      if (node.dataset.latex)    return `$${node.dataset.latex}$`
      return inner()
    case 'table': {
      const rows = Array.from(node.querySelectorAll('tr'))
      if (!rows.length) return ''
      const mdRows = rows.map(tr => '| ' + Array.from(tr.querySelectorAll('th, td')).map(c => _nodeToMd(c).trim().replace(/\n+/g, ' ')).join(' | ') + ' |')
      mdRows.splice(1, 0, '| ' + Array.from(rows[0].querySelectorAll('th, td')).map(() => '---').join(' | ') + ' |')
      return mdRows.join('\n') + '\n\n'
    }
    case 'thead': case 'tbody': case 'tfoot': case 'tr': case 'th': case 'td': return inner()
    default: return inner()
  }
}

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return _nodeToMd(doc.body).trim()
}

function exportMarkdown(html, name) {
  const blob = new Blob([htmlToMarkdown(html)], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${name}.md`; a.click()
  URL.revokeObjectURL(url)
}

function exportPDF(html, name) {
  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111;line-height:1.75;font-size:16px}
  h1{font-size:2em;border-bottom:1px solid #e5e7eb;padding-bottom:.3em}h2{font-size:1.5em}h3{font-size:1.2em}
  code{font-family:'Courier New',monospace;font-size:.875em;background:#f3f4f6;border-radius:3px;padding:2px 5px}
  pre{background:#f3f4f6;border-radius:6px;padding:12px 16px;overflow-x:auto}pre code{background:none;padding:0}
  blockquote{border-left:3px solid #d1d5db;margin:1em 0;padding-left:1em;color:#6b7280}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:6px 12px;text-align:left}
  th{background:#f9fafb;font-weight:600}@media print{body{margin:0}@page{margin:2cm}}</style>
  </head><body><h1>${name}</h1>${html}<script>window.onload=()=>window.print()<\/script></body></html>`)
  win.document.close()
}

// ─── Table toolbar ────────────────────────────────────────────────────────────
function TableMenu({ editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const inTable = editor.isActive('table')

  useEffect(() => {
    if (!open) return
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function run(cmd) { cmd(); setOpen(false) }
  const sep = <div className="my-1 border-t border-slate-100" />

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} title="Table"
        className={`p-1 rounded transition-colors ${inTable || open ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
        <Icon name="table" className="text-[16px]" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <p className="px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Insert</p>
          <button onClick={() => run(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50">
            <Icon name="table" className="text-[14px] text-slate-400" /> Insert table (3×3)
          </button>
          {inTable && (<>
            {sep}
            <p className="px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Columns</p>
            <button onClick={() => run(() => editor.chain().focus().addColumnBefore().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="add" className="text-[14px] text-slate-400" /> Add column before</button>
            <button onClick={() => run(() => editor.chain().focus().addColumnAfter().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="add" className="text-[14px] text-slate-400" /> Add column after</button>
            <button onClick={() => run(() => editor.chain().focus().deleteColumn().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"><Icon name="remove" className="text-[14px]" /> Delete column</button>
            {sep}
            <p className="px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Rows</p>
            <button onClick={() => run(() => editor.chain().focus().addRowBefore().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="add" className="text-[14px] text-slate-400" /> Add row before</button>
            <button onClick={() => run(() => editor.chain().focus().addRowAfter().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="add" className="text-[14px] text-slate-400" /> Add row after</button>
            <button onClick={() => run(() => editor.chain().focus().deleteRow().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"><Icon name="remove" className="text-[14px]" /> Delete row</button>
            {sep}
            <button onClick={() => run(() => editor.chain().focus().mergeCells().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="merge" className="text-[14px] text-slate-400" /> Merge cells</button>
            <button onClick={() => run(() => editor.chain().focus().splitCell().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="call_split" className="text-[14px] text-slate-400" /> Split cell</button>
            {sep}
            <button onClick={() => run(() => editor.chain().focus().deleteTable().run())} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"><Icon name="delete" className="text-[14px]" /> Delete table</button>
          </>)}
        </div>
      )}
    </div>
  )
}

function ExportMenu({ onMarkdown, onPDF }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} title="Export"
        className={`p-1 rounded transition-colors ${open ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
        <Icon name="download" className="text-[16px]" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <button onClick={() => { onMarkdown(); setOpen(false) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50">
            <Icon name="article" className="text-[14px] text-slate-400" /> Export as Markdown
          </button>
          <button onClick={() => { onPDF(); setOpen(false) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50">
            <Icon name="picture_as_pdf" className="text-[14px] text-slate-400" /> Export as PDF
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Tiptap editor ────────────────────────────────────────────────────────────
function TiptapEditor({ content, onUpdate, onSave, getAllNotes, onWikiLinkClick, noteName }) {
  const getAllNotesRef = useRef(getAllNotes)
  const onWikiLinkClickRef = useRef(onWikiLinkClick)
  useEffect(() => { getAllNotesRef.current = getAllNotes }, [getAllNotes])
  useEffect(() => { onWikiLinkClickRef.current = onWikiLinkClick }, [onWikiLinkClick])

  const wikiLinkExtension = useMemo(
    () => createWikiLinkExtension({
      getAllNotes: () => getAllNotesRef.current?.() ?? [],
      onWikiLinkClick: (name, id) => onWikiLinkClickRef.current?.(name, id),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Start writing… use [[ to link to other notes' }),
      Link.configure({ openOnClick: false }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: false }),
      Typography,
      Mathematics,
      wikiLinkExtension,
      TableKit.configure({ resizable: true }),
    ],
    content: content || '',
    editorProps: { attributes: { class: 'tiptap-editor focus:outline-none' } },
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
    onBlur: () => onSave?.(),
  })

  useEffect(() => {
    if (!editor) return
    if (content !== editor.getHTML()) editor.commands.setContent(content || '', false)
  }, [content, editor])

  const [tableCtx, setTableCtx] = useState(null)
  if (!editor) return null

  const html = editor.getHTML()
  return (
    <>
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-white flex-wrap flex-shrink-0">
        <select
          value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
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
        <ToolBtn icon="format_bold" label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolBtn icon="format_italic" label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolBtn icon="format_underlined" label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolBtn icon="format_strikethrough" label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ToolBtn icon="ink_highlighter" label="Highlight" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} />
        <ToolBtn icon="code" label="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
        <ToolBtn icon="link" label="Link" active={editor.isActive('link')} onClick={() => {
          if (editor.isActive('link')) editor.chain().focus().unsetLink().run()
          else { const url = window.prompt('URL'); if (url) editor.chain().focus().setLink({ href: url }).run() }
        }} />
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <ToolBtn icon="format_list_bulleted" label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolBtn icon="format_list_numbered" label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolBtn icon="checklist" label="Task list" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <ToolBtn icon="format_quote" label="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolBtn icon="code_blocks" label="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <ToolBtn icon="horizontal_rule" label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <ToolBtn icon="function" label="Inline math" onClick={() => {
          const latex = window.prompt('LaTeX expression', 'E = mc^2')
          if (latex) editor.chain().focus().setInlineMath(latex).run()
        }} />
        <TableMenu editor={editor} />
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <ToolBtn icon="undo" label="Undo" onClick={() => editor.chain().focus().undo().run()} />
        <ToolBtn icon="redo" label="Redo" onClick={() => editor.chain().focus().redo().run()} />
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <ExportMenu onMarkdown={() => exportMarkdown(html, noteName || 'note')} onPDF={() => exportPDF(html, noteName || 'note')} />
      </div>
      <div className="flex-1 overflow-y-auto relative">
        <EditorContent
          editor={editor}
          className="h-full p-5 max-w-4xl"
          onContextMenu={e => {
            const cell = e.target.closest('td, th')
            if (!cell) return
            e.preventDefault()
            setTableCtx({ x: e.clientX, y: e.clientY })
          }}
        />
        {tableCtx && (
          <div
            style={{ position: 'fixed', top: tableCtx.y, left: tableCtx.x, zIndex: 9999 }}
            className="w-52 bg-white rounded-lg shadow-xl border border-slate-200 py-1"
          >
            <button onClick={() => { editor.chain().focus().addColumnBefore().run(); setTableCtx(null) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="add" className="text-[14px] text-slate-400" /> Add column before</button>
            <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setTableCtx(null) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="add" className="text-[14px] text-slate-400" /> Add column after</button>
            <button onClick={() => { editor.chain().focus().deleteColumn().run(); setTableCtx(null) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"><Icon name="remove" className="text-[14px]" /> Delete column</button>
            <div className="my-1 border-t border-slate-100" />
            <button onClick={() => { editor.chain().focus().addRowBefore().run(); setTableCtx(null) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="add" className="text-[14px] text-slate-400" /> Add row before</button>
            <button onClick={() => { editor.chain().focus().addRowAfter().run(); setTableCtx(null) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="add" className="text-[14px] text-slate-400" /> Add row after</button>
            <button onClick={() => { editor.chain().focus().deleteRow().run(); setTableCtx(null) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"><Icon name="remove" className="text-[14px]" /> Delete row</button>
            <div className="my-1 border-t border-slate-100" />
            <button onClick={() => { editor.chain().focus().deleteTable().run(); setTableCtx(null) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"><Icon name="delete" className="text-[14px]" /> Delete table</button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Note tree node ───────────────────────────────────────────────────────────
function NoteTreeNode({
  note, allNotes, selectedNoteId, expandedNotes, onSelect, onToggle, onContextMenu, depth = 0,
  sourceKey, draggingNoteId, onDragStart, onDragEnd, onPin,
}) {
  const children = allNotes.filter(n => n.parentId === note.id)
  const isFolder = note.type === 'folder'
  const isOpen = expandedNotes[note.id]
  const isSelected = selectedNoteId === note.id
  const isDragging = draggingNoteId === note.id

  const dragProps = !isFolder ? {
    draggable: true,
    onDragStart: e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', note.id); onDragStart?.(note.id, sourceKey) },
    onDragEnd: () => onDragEnd?.(),
  } : {}

  return (
    <div>
      <button
        {...dragProps}
        onClick={() => isFolder ? onToggle(note.id) : onSelect(note.id)}
        onContextMenu={e => { e.preventDefault(); onContextMenu(e, note) }}
        className={`group w-full flex items-center gap-1 py-[3px] text-[12px] rounded transition-colors text-left ${
          isSelected ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
        } ${isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: 6 }}
      >
        {isFolder ? (
          <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="text-[12px] text-slate-400 flex-shrink-0" />
        ) : (
          <span className="w-[12px] flex-shrink-0" />
        )}
        <Icon name={isFolder ? (isOpen ? 'folder_open' : 'folder') : 'description'}
          className={`text-[13px] flex-shrink-0 ${isFolder ? 'text-amber-500' : 'text-slate-400'}`} />
        <span className="truncate flex-1">{note.name}</span>
        <span role="button" tabIndex={-1}
          onClick={e => { e.stopPropagation(); onPin?.(note.id) }}
          title={note.isPinned ? 'Unpin' : 'Pin to top'}
          className={`flex-shrink-0 p-0.5 rounded transition-all ${
            note.isPinned ? 'text-amber-400' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-400'
          }`}
        >
          <Icon name="star" className="text-[11px]" />
        </span>
        {!isFolder && (
          <Icon name="drag_indicator" className="text-[12px] text-slate-300 flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab" />
        )}
      </button>
      {isFolder && isOpen && children
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .map(child => (
          <NoteTreeNode
            key={child.id}
            note={child}
            allNotes={allNotes}
            selectedNoteId={selectedNoteId}
            expandedNotes={expandedNotes}
            onSelect={onSelect}
            onToggle={onToggle}
            onContextMenu={onContextMenu}
            depth={depth + 1}
            sourceKey={sourceKey}
            draggingNoteId={draggingNoteId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onPin={onPin}
          />
        ))}
    </div>
  )
}

// ─── Experiment folder in sidebar ─────────────────────────────────────────────
const EXPERIMENT_STATUS = {
  planned:   { cls: 'bg-blue-100 text-blue-700',    icon: 'schedule' },
  running:   { cls: 'bg-amber-100 text-amber-700',  icon: 'play_circle' },
  completed: { cls: 'bg-emerald-100 text-emerald-700', icon: 'check_circle' },
  failed:    { cls: 'bg-red-100 text-red-700',      icon: 'error' },
}

function ExperimentFolder({
  exp, notes, loaded, isOpen,
  selectedNoteId, isActiveSource,
  expandedNotes,
  onToggle, onSelectNote, onToggleNote, onNoteContextMenu, onItemContextMenu,
  creating, newName, setNewName, onCreateSubmit, onCancelCreate,
  onPin,
  draggingNoteId, onDragStart, onDragEnd,
}) {
  const sourceKey = `experiment:${exp.id}`
  const s = EXPERIMENT_STATUS[exp.status] || EXPERIMENT_STATUS.planned
  const rootNotes = (notes || []).filter(n => !n.parentId).sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      <div
        onClick={onToggle}
        onContextMenu={e => { e.preventDefault(); onItemContextMenu(e) }}
        title={exp.name}
        className={`group flex items-center gap-1.5 py-[3px] px-1.5 rounded cursor-pointer text-[12px] transition-colors hover:bg-indigo-50 ${isActiveSource ? 'bg-indigo-50' : ''}`}
      >
        <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="text-[12px] text-indigo-400 flex-shrink-0" />
        <span className={`inline-flex items-center justify-center w-4 h-4 rounded flex-shrink-0 ${s.cls}`}>
          <Icon name="science" className="text-[11px]" />
        </span>
        <span className="flex-1 truncate font-medium text-indigo-700 min-w-0">{exp.name}</span>
        {loaded && (notes || []).length > 0 && (
          <span className="text-[10px] opacity-60 text-indigo-600 flex-shrink-0">{(notes || []).length}</span>
        )}
      </div>

      {isOpen && (
        <div>
          {!loaded && (
            <div className="flex items-center gap-1.5 pl-9 pr-2 py-1 text-[11px] text-slate-400">
              <Icon name="autorenew" className="text-[12px] animate-spin" />
              Loading…
            </div>
          )}
          {loaded && rootNotes.map(note => (
            <NoteTreeNode
              key={note.id}
              note={note}
              allNotes={notes}
              selectedNoteId={isActiveSource ? selectedNoteId : null}
              expandedNotes={expandedNotes}
              onSelect={onSelectNote}
              onToggle={onToggleNote}
              onContextMenu={onNoteContextMenu}
              depth={1}
              sourceKey={sourceKey}
              draggingNoteId={draggingNoteId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onPin={onPin}
            />
          ))}
          {loaded && rootNotes.length === 0 && !creating && (
            <p className="pl-9 py-1 text-[11px] text-slate-400 italic">No notes yet</p>
          )}
          {creating && (
            <form onSubmit={onCreateSubmit} className="pl-7 pr-2 py-0.5">
              <div className="flex items-center gap-1">
                <Icon name={creating.type === 'folder' ? 'folder' : 'description'}
                  className={`text-[12px] flex-shrink-0 ${creating.type === 'folder' ? 'text-amber-500' : 'text-slate-400'}`} />
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && onCancelCreate()}
                  placeholder={creating.type === 'folder' ? 'Folder name' : 'File name'}
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded focus:outline-none focus:border-blue-400" />
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

const ITEM_TYPE_CONFIG = {
  paper:       { icon: 'article',    color: 'blue',   label: 'Paper' },
  website:     { icon: 'language',   color: 'purple', label: 'Website' },
  github_repo: { icon: 'code',       color: 'violet', label: 'GitHub' },
}

function LiteratureItemFolder({
  item, notes, loaded, isOpen,
  selectedNoteId, isActiveSource,
  expandedNotes,
  onToggle, onSelectNote, onToggleNote, onNoteContextMenu, onItemContextMenu,
  creating, newName, setNewName, onCreateSubmit, onCancelCreate,
  onPin,
  draggingNoteId, onDragStart, onDragEnd,
}) {
  const sourceKey = `${item.itemType}:${item.id}`
  const cfg = ITEM_TYPE_CONFIG[item.itemType] || ITEM_TYPE_CONFIG.paper
  const rootNotes = (notes || []).filter(n => !n.parentId).sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      <div
        onClick={onToggle}
        onContextMenu={e => { e.preventDefault(); onItemContextMenu?.(e) }}
        title={item.title || item.name}
        className={`group flex items-center gap-1.5 py-[3px] px-1.5 rounded cursor-pointer text-[12px] transition-colors hover:bg-${cfg.color}-50 ${isActiveSource ? `bg-${cfg.color}-50` : ''}`}
      >
        <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className={`text-[12px] text-${cfg.color}-400 flex-shrink-0`} />
        <Icon name={cfg.icon} className={`text-[13px] text-${cfg.color}-500 flex-shrink-0`} />
        <span className={`flex-1 truncate font-medium text-${cfg.color}-700 min-w-0`}>{item.title || item.name || 'Untitled'}</span>
        {loaded && (notes || []).length > 0 && (
          <span className={`text-[10px] opacity-60 text-${cfg.color}-600 flex-shrink-0`}>{(notes || []).length}</span>
        )}
      </div>

      {isOpen && (
        <div>
          {!loaded && (
            <div className="flex items-center gap-1.5 pl-9 pr-2 py-1 text-[11px] text-slate-400">
              <Icon name="autorenew" className="text-[12px] animate-spin" />
              Loading…
            </div>
          )}
          {loaded && rootNotes.map(note => (
            <NoteTreeNode
              key={note.id}
              note={note}
              allNotes={notes}
              selectedNoteId={isActiveSource ? selectedNoteId : null}
              expandedNotes={expandedNotes}
              onSelect={onSelectNote}
              onToggle={onToggleNote}
              onContextMenu={onNoteContextMenu}
              depth={1}
              sourceKey={sourceKey}
              draggingNoteId={draggingNoteId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onPin={onPin}
            />
          ))}
          {loaded && rootNotes.length === 0 && !creating && (
            <p className="pl-9 py-1 text-[11px] text-slate-400 italic">No notes yet</p>
          )}
          {creating && (
            <form onSubmit={onCreateSubmit} className="pl-7 pr-2 py-0.5">
              <div className="flex items-center gap-1">
                <Icon name={creating.type === 'folder' ? 'folder' : 'description'}
                  className={`text-[12px] flex-shrink-0 ${creating.type === 'folder' ? 'text-amber-500' : 'text-slate-400'}`} />
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && onCancelCreate()}
                  placeholder={creating.type === 'folder' ? 'Folder name' : 'File name'}
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded focus:outline-none focus:border-blue-400" />
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Breadcrumb helper ────────────────────────────────────────────────────────
function buildPath(noteId, allNotes, sourceLabel) {
  const parts = []
  let cur = allNotes.find(n => n.id === noteId)
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentId ? allNotes.find(n => n.id === cur.parentId) : null
  }
  if (sourceLabel) parts.unshift(sourceLabel)
  return parts
}

// ─── Tab icons ────────────────────────────────────────────────────────────────
const TAB_ICONS = {
  note:       { name: 'description',    cls: 'text-slate-400' },
  suggestion: { name: 'difference',     cls: 'text-purple-400' },
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ tabs, activeTabId, onActivate, onClose, graphView, onToggleGraph }) {
  return (
    <div className="flex items-stretch flex-shrink-0 border-b border-slate-200 bg-slate-50 min-h-[34px]">
      <div className="flex items-end overflow-x-auto flex-1 px-1 pt-1 gap-0.5 min-w-0" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(tab => {
          const isActive = tab.noteId === activeTabId
          return (
            <div
              key={tab.noteId}
              className={`group flex items-center gap-1 px-2.5 py-1 rounded-t text-[12px] cursor-pointer select-none flex-shrink-0 transition-colors border-t border-l border-r ${
                isActive ? 'bg-white border-slate-200 text-slate-700 font-medium' : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
              style={{ maxWidth: 200, borderBottom: isActive ? '1px solid white' : '1px solid transparent', marginBottom: isActive ? -1 : 0 }}
              onClick={() => onActivate(tab.noteId)}
            >
              <Icon name={TAB_ICONS[tab.tabType]?.name || 'description'} className={`text-[12px] flex-shrink-0 ${TAB_ICONS[tab.tabType]?.cls || 'text-slate-400'}`} />
              <span className="truncate">{tab.name}</span>
              <button
                onClick={e => { e.stopPropagation(); onClose(tab.noteId) }}
                className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-slate-200 transition-all flex-shrink-0"
                title="Close tab"
              >
                <Icon name="close" className="text-[10px]" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex items-center px-2 flex-shrink-0 border-l border-slate-200">
        <button
          onClick={onToggleGraph}
          title={graphView ? 'Switch to editor' : 'Switch to graph view'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
            graphView ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          <Icon name={graphView ? 'edit_note' : 'hub'} className="text-[14px]" />
          {graphView ? 'Editor' : 'Graph'}
        </button>
      </div>
    </div>
  )
}

// ─── Templates ────────────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'blank', label: 'Blank', icon: 'description', color: 'text-slate-400', description: 'Start with an empty note', content: '' },
  {
    id: 'experiment_log', label: 'Experiment Log', icon: 'science', color: 'text-emerald-500',
    description: 'Hypothesis, setup, procedure, results, and conclusions',
    content: '<h1>Experiment Log</h1><p><strong>Date:</strong> &nbsp; <strong>Status:</strong> </p><hr><h2>Hypothesis</h2><p>If [condition], then [outcome] because [reasoning].</p><h2>Setup &amp; Materials</h2><ul><li><p></p></li></ul><h2>Procedure</h2><ol><li><p></p></li></ol><h2>Raw Results</h2><p>Paste data, measurements, or model outputs here.</p><h2>Observations</h2><p>What patterns, surprises, or anomalies did you notice?</p><h2>Conclusions</h2><p>Does the result support the hypothesis?</p><h2>Next Steps</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>',
  },
  {
    id: 'literature_note', label: 'Literature Note', icon: 'menu_book', color: 'text-blue-500',
    description: 'Atomic note on a single paper',
    content: '<h1>Literature Note</h1><p><strong>Paper:</strong> </p><p><strong>Authors:</strong> </p><hr><h2>Core Claim</h2><p></p><h2>Key Contributions</h2><ul><li><p></p></li></ul><h2>Limitations</h2><p></p><h2>My Critique</h2><p></p>',
  },
  {
    id: 'meeting_note', label: 'Meeting Note', icon: 'groups', color: 'text-violet-500',
    description: 'Agenda, discussion, decisions, and action items',
    content: '<h1>Meeting Note</h1><p><strong>Date:</strong> </p><p><strong>Attendees:</strong> </p><hr><h2>Agenda</h2><ol><li><p></p></li></ol><h2>Discussion</h2><p></p><h2>Decisions Made</h2><ul><li><p></p></li></ul><h2>Action Items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>',
  },
]

function TemplatePickerModal({ noteName, onSelect, onCancel }) {
  const [selected, setSelected] = useState(TEMPLATES[0])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 flex overflow-hidden" style={{ width: 720, maxWidth: '95vw', height: 480 }} onClick={e => e.stopPropagation()}>
        <div className="w-52 flex-shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/60">
          <div className="px-4 py-3.5 border-b border-slate-100">
            <p className="text-[13px] font-semibold text-slate-800">New note</p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">"{noteName}"</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1.5 px-1.5 flex flex-col gap-0.5">
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => setSelected(t)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${selected.id === t.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-100 border border-transparent'}`}>
                <Icon name={t.icon} className={`text-[18px] flex-shrink-0 ${selected.id === t.id ? 'text-blue-500' : t.color}`} />
                <p className={`text-[12px] font-medium truncate ${selected.id === t.id ? 'text-blue-700' : 'text-slate-700'}`}>{t.label}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
            <Icon name={selected.icon} className={`text-[18px] ${selected.color}`} />
            <div>
              <p className="text-[13px] font-semibold text-slate-800">{selected.label}</p>
              <p className="text-[11px] text-slate-400">{selected.description}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {selected.content ? (
              <div className="tiptap-editor pointer-events-none select-none" dangerouslySetInnerHTML={{ __html: selected.content }} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300">
                <Icon name="description" className="text-[40px]" />
                <p className="text-[12px]">Empty note — start from scratch</p>
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 flex-shrink-0 bg-slate-50/60">
            <button onClick={onCancel} className="px-3 py-1.5 text-[12px] text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
            <button onClick={() => onSelect(selected.content)} className="px-4 py-1.5 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5">
              <Icon name="add" className="text-[14px]" /> Create note
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Backlinks panel ──────────────────────────────────────────────────────────
function BacklinksPanel({ backlinks, onNoteClick }) {
  return (
    <div className="w-56 border-l border-slate-200 flex flex-col bg-slate-50/60 flex-shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center gap-1.5 flex-shrink-0">
        <Icon name="link" className="text-[13px] text-slate-400" />
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Backlinks</span>
        <span className="ml-auto text-[10px] text-slate-300">{backlinks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {backlinks.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-slate-400 italic">No notes link here.</p>
        ) : backlinks.map(note => (
          <button key={note.id} onClick={() => onNoteClick(note)}
            className="w-full flex items-center gap-1.5 py-[3px] px-2 text-[12px] text-slate-600 hover:bg-slate-100 rounded transition-colors text-left">
            <Icon name="description" className="text-[12px] text-slate-400 flex-shrink-0" />
            <span className="truncate flex-1">{note.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Helper: strip HTML ───────────────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
}

// ─── Graph source colors/labels for project scope ─────────────────────────────
const PROJECT_GRAPH_SOURCE_COLORS = {
  project: '#64748b',
  experiment: '#6366f1',
  paper: '#3b82f6',
  website: '#a855f7',
  github: '#8b5cf6',
}
const PROJECT_GRAPH_SOURCE_LABELS = {
  project: 'Project Notes',
  experiment: 'Experiment Notes',
  paper: 'Paper Notes',
  website: 'Website Notes',
  github: 'GitHub Notes',
}

// ─── Main ProjectNotesIDE component ──────────────────────────────────────────
export default function ProjectNotesIDE() {
  const { project, id: projectId } = useOutletContext()

  // ── Data ───────────────────────────────────────────────────────────────────
  const [projectNotes, setProjectNotes] = useState([])
  const [experiments, setExperiments] = useState([])
  const [expNotes, setExpNotes] = useState({})       // expId -> Note[]
  const [loadedExps, setLoadedExps] = useState({})   // expId -> bool
  const [linkedItems, setLinkedItems] = useState([])  // { id, title, itemType, _linkId }
  const [itemNotes, setItemNotes] = useState({})      // sourceKey -> Note[]
  const [loadedItems, setLoadedItems] = useState({})  // sourceKey -> bool
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [expandedExps, setExpandedExps] = useState({})
  const [expandedLitItems, setExpandedLitItems] = useState({})
  const [expandedNotes, setExpandedNotes] = useState({})
  const [openTabs, setOpenTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const saveTimerRef = useRef(null)
  const [graphView, setGraphView] = useState(false)
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [showCopilot, setShowCopilot] = useState(false)
  const [noteSearch, setNoteSearch] = useState('')
  const [creating, setCreating] = useState(null)
  const [newName, setNewName] = useState('')
  const [ctxMenu, setCtxMenu] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [templatePickerFor, setTemplatePickerFor] = useState(null)
  const [draggingNoteId, setDraggingNoteId] = useState(null)
  const dragRef = useRef(null)

  // Recent notes stored in localStorage keyed by project
  const [recentNoteIds, setRecentNoteIds] = useState([])
  useEffect(() => {
    if (!projectId) return
    try { setRecentNoteIds(JSON.parse(localStorage.getItem(`researchos.project.notes.recent.${projectId}`) || '[]')) } catch { setRecentNoteIds([]) }
  }, [projectId])
  useEffect(() => {
    if (!projectId) return
    try { localStorage.setItem(`researchos.project.notes.recent.${projectId}`, JSON.stringify(recentNoteIds)) } catch {}
  }, [recentNoteIds, projectId])

  // Track active editor source for note creation routing
  const activeEditorSourceRef = useRef('project')

  // ── Load project notes + experiments + linked literature on mount ──────────
  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    Promise.all([
      notesApi.listForProject(projectId).catch(() => []),
      experimentsApi.list(projectId).catch(() => []),
      projectPapersApi.list(projectId).catch(() => []),
    ]).then(async ([pNotes, exps, links]) => {
      setProjectNotes(pNotes || [])
      setExperiments(exps || [])
      // Resolve linked literature items
      const items = []
      for (const link of (links || [])) {
        if (link.paperId) {
          try {
            const paper = await papersApi.get(link.paperId)
            if (paper) items.push({ ...paper, itemType: 'paper', _linkId: link.id })
          } catch {}
        } else if (link.websiteId) {
          try {
            const site = await websitesApi.get(link.websiteId)
            if (site) items.push({ ...site, itemType: 'website', _linkId: link.id })
          } catch {}
        } else if (link.githubRepoId) {
          try {
            const repo = await githubReposApi.get(link.githubRepoId)
            if (repo) items.push({ ...repo, itemType: 'github_repo', _linkId: link.id })
          } catch {}
        }
      }
      setLinkedItems(items)
    }).catch(err => {
      setError(err.message)
    }).finally(() => setLoading(false))
  }, [projectId])

  // ── Eagerly load all experiment notes for wiki-link + graph ───────────────
  useEffect(() => {
    for (const exp of experiments) {
      if (loadedExps[exp.id]) continue
      setLoadedExps(prev => ({ ...prev, [exp.id]: 'loading' }))
      notesApi.listForExperiment(exp.id)
        .then(notes => {
          setExpNotes(prev => ({ ...prev, [exp.id]: notes || [] }))
          setLoadedExps(prev => ({ ...prev, [exp.id]: true }))
        })
        .catch(err => {
          console.error(`Failed to load notes for experiment ${exp.id}:`, err)
          setExpNotes(prev => ({ ...prev, [exp.id]: [] }))
          setLoadedExps(prev => ({ ...prev, [exp.id]: true }))
        })
    }
  }, [experiments]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Eagerly load all linked literature notes for wiki-link + graph ────────
  useEffect(() => {
    for (const item of linkedItems) {
      const sk = `${item.itemType}:${item.id}`
      if (loadedItems[sk]) continue
      setLoadedItems(prev => ({ ...prev, [sk]: 'loading' }))
      const fetchFn = item.itemType === 'paper' ? notesApi.list
        : item.itemType === 'website' ? notesApi.listForWebsite
        : notesApi.listForGitHubRepo
      fetchFn(item.id)
        .then(notes => {
          setItemNotes(prev => ({ ...prev, [sk]: notes || [] }))
          setLoadedItems(prev => ({ ...prev, [sk]: true }))
        })
        .catch(() => {
          setItemNotes(prev => ({ ...prev, [sk]: [] }))
          setLoadedItems(prev => ({ ...prev, [sk]: true }))
        })
    }
  }, [linkedItems]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Flat list of all notes (for wiki-link, graph, pinned, recent) ─────────
  const allLoadedNotes = useMemo(() => {
    const result = projectNotes.map(n => ({
      ...n, source: 'project', sourceName: 'Project Notes', sourceKey: 'project',
    }))
    for (const exp of experiments) {
      const notes = expNotes[exp.id] || []
      for (const note of notes) {
        result.push({ ...note, source: 'experiment', sourceName: exp.name, sourceKey: `experiment:${exp.id}` })
      }
    }
    for (const item of linkedItems) {
      const sk = `${item.itemType}:${item.id}`
      const notes = itemNotes[sk] || []
      const sourceLabel = item.itemType === 'paper' ? 'paper' : item.itemType === 'website' ? 'website' : 'github'
      for (const note of notes) {
        result.push({ ...note, source: sourceLabel, sourceName: item.title || item.name || 'Untitled', sourceKey: sk })
      }
    }
    return result
  }, [projectNotes, experiments, expNotes, linkedItems, itemNotes])

  // ── Note content search ────────────────────────────────────────────────────
  function getMatchSnippet(text, query) {
    const lc = text.toLowerCase()
    const qi = lc.indexOf(query.toLowerCase())
    if (qi === -1) return null
    const start = Math.max(0, qi - 50)
    const end = Math.min(text.length, qi + query.length + 70)
    return {
      before: (start > 0 ? '…' : '') + text.slice(start, qi),
      match: text.slice(qi, qi + query.length),
      after: text.slice(qi + query.length, end) + (end < text.length ? '…' : ''),
    }
  }

  function splitHighlight(text, query) {
    const li = text.toLowerCase().indexOf(query.toLowerCase())
    if (li === -1) return { before: text, match: '', after: '' }
    return { before: text.slice(0, li), match: text.slice(li, li + query.length), after: text.slice(li + query.length) }
  }

  const noteSearchResults = useMemo(() => {
    const q = noteSearch.trim()
    if (q.length < 2) return []
    const qLow = q.toLowerCase()
    return allLoadedNotes
      .filter(n => n.type === 'file')
      .filter(n => n.name.toLowerCase().includes(qLow) || stripHtml(n.content).toLowerCase().includes(qLow))
      .map(n => ({ ...n, snippet: getMatchSnippet(stripHtml(n.content), q) }))
      .slice(0, 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoadedNotes, noteSearch])

  // ── Source note helpers ────────────────────────────────────────────────────
  function getSourceNotes(sourceKey) {
    if (sourceKey === 'project') return projectNotes
    if (sourceKey.startsWith('experiment:')) {
      const expId = sourceKey.replace('experiment:', '')
      return expNotes[expId] || []
    }
    // paper:id, website:id, github_repo:id
    return itemNotes[sourceKey] || []
  }

  function setSourceNotes(sourceKey, updater) {
    if (sourceKey === 'project') {
      setProjectNotes(prev => typeof updater === 'function' ? updater(prev) : updater)
    } else if (sourceKey.startsWith('experiment:')) {
      const expId = sourceKey.replace('experiment:', '')
      setExpNotes(prev => ({
        ...prev,
        [expId]: typeof updater === 'function' ? updater(prev[expId] || []) : updater,
      }))
    } else {
      // paper:id, website:id, github_repo:id
      setItemNotes(prev => ({
        ...prev,
        [sourceKey]: typeof updater === 'function' ? updater(prev[sourceKey] || []) : updater,
      }))
    }
  }

  // ── Selected note derived from active tab ──────────────────────────────────
  const selected = useMemo(() => {
    if (!activeTabId) return null
    const tab = openTabs.find(t => t.noteId === activeTabId)
    return tab && tab.tabType === 'note' ? { noteId: tab.noteId, sourceKey: tab.sourceKey } : null
  }, [activeTabId, openTabs])

  const selectedNote = selected
    ? getSourceNotes(selected.sourceKey).find(n => n.id === selected.noteId) ?? null
    : null

  const activeSuggestionTab = useMemo(
    () => openTabs.find(t => t.noteId === activeTabId && t.tabType === 'suggestion') ?? null,
    [openTabs, activeTabId]
  )

  // ── Source label for breadcrumb ────────────────────────────────────────────
  function sourceLabel(sourceKey) {
    if (sourceKey === 'project') return project?.name || 'Project Notes'
    if (sourceKey.startsWith('experiment:')) {
      const expId = sourceKey.replace('experiment:', '')
      const exp = experiments.find(e => e.id === expId)
      return exp?.name || 'Experiment'
    }
    // paper/website/github_repo
    const item = linkedItems.find(i => `${i.itemType}:${i.id}` === sourceKey)
    return item?.title || item?.name || 'Literature'
  }

  // ── Open a note in a tab ───────────────────────────────────────────────────
  function openNoteInTab(noteId, sourceKey) {
    const notes = getSourceNotes(sourceKey)
    const note = notes.find(n => n.id === noteId)
    if (!note || note.type === 'folder') return

    // Build tab label: experiment notes get "ExpName > NoteName" prefix
    let tabName = note.name
    if (sourceKey !== 'project') {
      const expId = sourceKey.replace('experiment:', '')
      const exp = experiments.find(e => e.id === expId)
      if (exp) {
        const truncName = exp.name.length > 15 ? exp.name.slice(0, 15) + '…' : exp.name
        tabName = `${truncName} > ${note.name}`
      }
    }

    setOpenTabs(prev => {
      if (prev.some(t => t.noteId === noteId)) return prev
      // Enforce max 12 tabs: close oldest non-active
      const tabs = [...prev, { noteId, tabType: 'note', sourceKey, name: tabName }]
      if (tabs.length > 12) {
        const oldest = tabs.find(t => t.noteId !== activeTabId)
        if (oldest) return tabs.filter(t => t.noteId !== oldest.noteId)
      }
      return tabs
    })
    setActiveTabId(noteId)
    setGraphView(false)
    activeEditorSourceRef.current = sourceKey
    setRecentNoteIds(prev => [noteId, ...prev.filter(id => id !== noteId)].slice(0, 8))
  }

  // ── Sync tab names on rename ───────────────────────────────────────────────
  useEffect(() => {
    setOpenTabs(prev => prev.map(tab => {
      if (tab.tabType !== 'note') return tab
      const note = allLoadedNotes.find(n => n.id === tab.noteId)
      if (!note) return tab
      let tabName = note.name
      if (tab.sourceKey !== 'project') {
        const expId = tab.sourceKey.replace('experiment:', '')
        const exp = experiments.find(e => e.id === expId)
        if (exp) {
          const truncName = exp.name.length > 15 ? exp.name.slice(0, 15) + '…' : exp.name
          tabName = `${truncName} > ${note.name}`
        }
      }
      return { ...tab, name: tabName }
    }))
  }, [allLoadedNotes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync editor content when tab changes ───────────────────────────────────
  useEffect(() => {
    if (selectedNote) {
      setContent(selectedNote.content || '')
      setDirty(false)
      activeEditorSourceRef.current = selected?.sourceKey || 'project'
    }
  }, [selected?.noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save ──────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!selected || !dirty) return
    try {
      const updated = await notesApi.update(selected.noteId, { content })
      setSourceNotes(selected.sourceKey, prev => prev.map(n => n.id === updated.id ? updated : n))
      setDirty(false)
    } catch (err) {
      console.error('Failed to save note:', err)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, content, dirty])

  useEffect(() => {
    if (!dirty) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(save, 1200)
    return () => clearTimeout(saveTimerRef.current)
  }, [content, dirty, save])

  // ── Close context menu on outside click ───────────────────────────────────
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [!!ctxMenu]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close tab ──────────────────────────────────────────────────────────────
  function closeTab(noteId) {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.noteId === noteId)
      const next = prev[idx + 1] ?? prev[idx - 1]
      if (noteId === activeTabId) setActiveTabId(next?.noteId ?? null)
      return prev.filter(t => t.noteId !== noteId)
    })
  }

  // ── Create note ────────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim() || !creating) return
    const { sourceKey, parentId, type } = creating

    if (type === 'file') {
      setTemplatePickerFor({ sourceKey, parentId, name: newName.trim() })
      return
    }

    // Folder creation
    try {
      const data = { name: newName.trim(), type, parentId: parentId || null }
      let note
      if (sourceKey === 'project') {
        note = await notesApi.createForProject(projectId, data)
        setProjectNotes(prev => [...prev, note])
      } else if (sourceKey.startsWith('experiment:')) {
        const expId = sourceKey.replace('experiment:', '')
        note = await notesApi.createForExperiment(expId, data)
        setExpNotes(prev => ({ ...prev, [expId]: [...(prev[expId] || []), note] }))
      } else {
        note = await createNoteForItem(sourceKey, data)
        setItemNotes(prev => ({ ...prev, [sourceKey]: [...(prev[sourceKey] || []), note] }))
      }
      if (parentId) setExpandedNotes(prev => ({ ...prev, [parentId]: true }))
      setCreating(null)
      setNewName('')
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }

  function createNoteForItem(sourceKey, data) {
    const [type, id] = [sourceKey.split(':')[0], sourceKey.split(':').slice(1).join(':')]
    if (type === 'paper') return notesApi.create(id, data)
    if (type === 'website') return notesApi.createForWebsite(id, data)
    if (type === 'github_repo') return notesApi.createForGitHubRepo(id, data)
    throw new Error(`Unknown source type: ${type}`)
  }

  async function handleCreateWithTemplate(templateContent) {
    if (!templatePickerFor) return
    const { sourceKey, parentId, name } = templatePickerFor
    setTemplatePickerFor(null)
    setCreating(null)
    setNewName('')
    try {
      const data = { name, type: 'file', parentId: parentId || null, content: templateContent }
      let note
      if (sourceKey === 'project') {
        note = await notesApi.createForProject(projectId, data)
        setProjectNotes(prev => [...prev, note])
      } else if (sourceKey.startsWith('experiment:')) {
        const expId = sourceKey.replace('experiment:', '')
        note = await notesApi.createForExperiment(expId, data)
        setExpNotes(prev => ({ ...prev, [expId]: [...(prev[expId] || []), note] }))
      } else {
        note = await createNoteForItem(sourceKey, data)
        setItemNotes(prev => ({ ...prev, [sourceKey]: [...(prev[sourceKey] || []), note] }))
      }
      if (parentId) setExpandedNotes(prev => ({ ...prev, [parentId]: true }))
      if (note) openNoteInTab(note.id, sourceKey)
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }

  // Note creation routing based on active editor source
  function createNote(data) {
    const sourceKey = activeEditorSourceRef.current || 'project'
    setCreating({ sourceKey, parentId: data.parentId || null, type: data.type || 'file' })
    setNewName(data.name || '')
  }

  // ── Pin / unpin ────────────────────────────────────────────────────────────
  async function handlePin(noteId, sourceKey) {
    const note = getSourceNotes(sourceKey).find(n => n.id === noteId)
    if (!note) return
    try {
      const updated = await notesApi.update(noteId, { is_pinned: !note.isPinned })
      if (updated) setSourceNotes(sourceKey, prev => prev.map(n => n.id === updated.id ? updated : n))
    } catch (err) {
      console.error('Failed to pin note:', err)
    }
  }

  // ── Delete note ────────────────────────────────────────────────────────────
  async function handleDelete(noteId, sourceKey) {
    try {
      await notesApi.remove(noteId)
      const allNotes = getSourceNotes(sourceKey)
      const toRemove = new Set()
      function collect(id) {
        toRemove.add(id)
        allNotes.filter(n => n.parentId === id).forEach(n => collect(n.id))
      }
      collect(noteId)
      setSourceNotes(sourceKey, prev => prev.filter(n => !toRemove.has(n.id)))
      setOpenTabs(prev => {
        const remaining = prev.filter(t => !toRemove.has(t.noteId))
        if (remaining.length < prev.length && toRemove.has(activeTabId)) {
          const idx = prev.findIndex(t => t.noteId === activeTabId)
          const next = remaining[idx] ?? remaining[idx - 1] ?? remaining[0]
          setActiveTabId(next?.noteId ?? null)
        }
        return remaining
      })
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
    setCtxMenu(null)
  }

  // ── Rename note ────────────────────────────────────────────────────────────
  async function handleRename(e) {
    e.preventDefault()
    if (!renameDraft.trim() || !renaming) return
    try {
      const updated = await notesApi.update(renaming.noteId, { name: renameDraft.trim() })
      setSourceNotes(renaming.sourceKey, prev => prev.map(n => n.id === updated.id ? updated : n))
    } catch (err) {
      console.error('Failed to rename note:', err)
    }
    setRenaming(null)
  }

  // ── Wiki-link click handler ────────────────────────────────────────────────
  function handleWikiLinkClick(noteName, noteId) {
    // Check real notes first
    let target
    if (noteId) {
      target = allLoadedNotes.find(n => n.id === noteId)
    } else {
      const nameLower = noteName.toLowerCase()
      const candidates = allLoadedNotes.filter(n => n.type === 'file' && n.name.toLowerCase() === nameLower)
      const currentSourceKey = selected?.sourceKey ?? 'project'
      target = candidates.find(n => n.sourceKey === currentSourceKey) ?? candidates[0]
    }
    if (target) {
      openNoteInTab(target.id, target.sourceKey)
      return
    }

    // Check pseudo-entities (experiments, literature) from suggestion list
    const allSuggestions = getAllNotesForSuggestion()
    const entity = noteId
      ? allSuggestions.find(n => n.id === noteId)
      : allSuggestions.find(n => n.name?.toLowerCase() === noteName.toLowerCase() && n._entityType)
    if (entity?._navigateUrl) {
      window.open(entity._navigateUrl, '_blank')
      return
    }

    // Auto-create in current editing scope
    if (window.confirm(`Note "${noteName}" doesn't exist. Create it?`)) {
      const sourceKey = activeEditorSourceRef.current || 'project'
      handleCreateByName(noteName, sourceKey)
    }
  }

  async function handleCreateByName(name, sourceKey) {
    try {
      let note
      if (sourceKey === 'project') {
        note = await notesApi.createForProject(projectId, { name, type: 'file', content: '' })
        setProjectNotes(prev => [...prev, note])
      } else if (sourceKey.startsWith('experiment:')) {
        const expId = sourceKey.replace('experiment:', '')
        note = await notesApi.createForExperiment(expId, { name, type: 'file', content: '' })
        setExpNotes(prev => ({ ...prev, [expId]: [...(prev[expId] || []), note] }))
      } else {
        note = await createNoteForItem(sourceKey, { name, type: 'file', content: '' })
        setItemNotes(prev => ({ ...prev, [sourceKey]: [...(prev[sourceKey] || []), note] }))
      }
      if (note) openNoteInTab(note.id, sourceKey)
    } catch (err) {
      console.error('Failed to create note by name:', err)
    }
  }

  // ── getAllNotes for wiki-link autocomplete (includes experiments + from context) ──
  const getAllNotesForSuggestion = useCallback(() => {
    // Return allLoadedNotes + pseudo-entries for experiments (navigation entities)
    const result = [...allLoadedNotes]
    for (const exp of experiments) {
      result.push({
        id: `__exp__${exp.id}`,
        name: exp.name,
        type: 'file',
        _entityType: 'experiment',
        _entityId: exp.id,
        _navigateUrl: `/projects/${projectId}/experiments`,
        sourceKey: `experiment:${exp.id}`,
        sourceName: exp.name,
      })
    }
    return result
  }, [allLoadedNotes, experiments, projectId])

  // ── Backlinks ──────────────────────────────────────────────────────────────
  const backlinks = useMemo(() => {
    if (!selectedNote) return []
    const noteId = selectedNote.id
    const noteName = selectedNote.name.toLowerCase()
    const selectedSource = selected?.sourceKey ?? 'project'
    const sameNameCount = allLoadedNotes.filter(n => n.type === 'file' && n.name.toLowerCase() === noteName).length
    return allLoadedNotes.filter(n => {
      if (n.type !== 'file' || n.id === noteId) return false
      return extractWikiLinks(n.content || '').some(({ name, noteId: linkedId }) => {
        if (linkedId) return linkedId === noteId
        if (name.toLowerCase() !== noteName) return false
        return sameNameCount === 1 || n.sourceKey === selectedSource
      })
    })
  }, [selectedNote, selected, allLoadedNotes])

  // ── Suggestion tabs ────────────────────────────────────────────────────────
  const suggestionActionsRef = useRef({})

  function handleSuggestionStatusChange(suggestionId, status) {
    const tabId = `__suggestion__${suggestionId}`
    setOpenTabs(prev => prev.map(t => t.noteId === tabId ? { ...t, suggestion: { ...t.suggestion, status } } : t))
  }

  function openSuggestionTab(suggestion, onAccept, onReject) {
    const tabId = `__suggestion__${suggestion.id}`
    suggestionActionsRef.current[suggestion.id] = {
      onAccept: async (sug) => { await onAccept(sug); handleSuggestionStatusChange(sug.id, 'accepted') },
      onReject: (sug) => { onReject(sug); handleSuggestionStatusChange(sug.id, 'rejected') },
    }
    const tabName = (suggestion.type === 'create' ? '+ ' : '~ ') + suggestion.noteName
    setOpenTabs(prev => {
      if (prev.some(t => t.noteId === tabId)) return prev
      return [...prev, { noteId: tabId, tabType: 'suggestion', name: tabName, suggestion: { ...suggestion } }]
    })
    setActiveTabId(tabId)
    setGraphView(false)
  }

  // ── Copilot notes changed: refresh ────────────────────────────────────────
  async function handleCopilotNotesChanged() {
    try {
      const [pNotes] = await Promise.all([
        notesApi.listForProject(projectId).catch(() => []),
      ])
      setProjectNotes(pNotes || [])
    } catch { /* ignore */ }
    // Re-fetch experiment notes
    for (const exp of experiments) {
      notesApi.listForExperiment(exp.id)
        .then(notes => setExpNotes(prev => ({ ...prev, [exp.id]: notes || [] })))
        .catch(() => {})
    }
  }

  // ── Context menu helpers ───────────────────────────────────────────────────
  function openNoteCtxMenu(e, note, sourceKey) {
    setCtxMenu({ note, sourceKey, x: e.clientX, y: e.clientY })
  }

  function openExpCtxMenu(e, exp) {
    setCtxMenu({ exp, x: e.clientX, y: e.clientY, isExp: true })
  }

  // ── Sidebar tree data ──────────────────────────────────────────────────────
  const projRootNotes = projectNotes
    .filter(n => !n.parentId)
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  const pinnedNotes = allLoadedNotes.filter(n => n.isPinned && n.type === 'file')

  const recentNotes = useMemo(() => {
    return recentNoteIds
      .map(id => allLoadedNotes.find(n => n.id === id && n.type === 'file'))
      .filter(Boolean)
  }, [recentNoteIds, allLoadedNotes])

  const breadcrumb = selected
    ? buildPath(selected.noteId, getSourceNotes(selected.sourceKey), sourceLabel(selected.sourceKey))
    : []

  // ── Graph-view data: allLoadedNotes already have correct source field ─────
  const graphNotes = allLoadedNotes

  // ── Graph experiment hull grouping ─────────────────────────────────────────
  // sourceKeyCollections: maps each experiment's sourceKey to its parent group ID
  // so NoteGraphView can draw hull boundaries around sibling experiments.
  const graphSourceKeyCollections = useMemo(() => {
    const map = {}
    for (const exp of experiments) {
      const groupKey = exp.parentId || exp.id
      map[`experiment:${exp.id}`] = [groupKey]
    }
    return map
  }, [experiments])

  // graphCollections: one entry per unique parent group for hull labels
  const graphCollections = useMemo(() => {
    const seen = new Set()
    return experiments
      .map(exp => ({
        id: exp.parentId || exp.id,
        name: (experiments.find(e => e.id === (exp.parentId || exp.id)) || exp).name,
      }))
      .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
  }, [experiments])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden bg-white" style={{ minHeight: 0 }}>

      {/* ── Left: file tree panel (w-64) ──────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-50/60 overflow-hidden">

        {/* Header */}
        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest pl-0.5">Notes</span>
          <div className="flex gap-0.5">
            <button
              onClick={() => { setCreating({ sourceKey: activeEditorSourceRef.current || 'project', parentId: null, type: 'file' }); setNewName('') }}
              title="New note"
              className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Icon name="note_add" className="text-[15px]" />
            </button>
            <button
              onClick={() => { setCreating({ sourceKey: activeEditorSourceRef.current || 'project', parentId: null, type: 'folder' }); setNewName('') }}
              title="New folder"
              className="p-0.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <Icon name="create_new_folder" className="text-[15px]" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-2 py-1.5 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="relative flex items-center">
            <Icon name="search" className="absolute left-1.5 text-[13px] text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={noteSearch}
              onChange={e => setNoteSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full pl-6 pr-5 py-0.5 text-[11px] bg-slate-100 border border-transparent rounded focus:outline-none focus:border-blue-400 focus:bg-white transition-colors placeholder-slate-400"
            />
            {noteSearch && (
              <button onClick={() => setNoteSearch('')} className="absolute right-1.5 text-slate-400 hover:text-slate-600">
                <Icon name="close" className="text-[12px]" />
              </button>
            )}
          </div>
        </div>

        {/* Tree body */}
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
              <Icon name="autorenew" className="animate-spin text-[18px]" />
              <span className="text-[12px]">Loading…</span>
            </div>
          ) : error ? (
            <p className="px-3 py-4 text-[11px] text-red-500">{error}</p>
          ) : noteSearch.trim().length >= 2 ? (
            /* ── Search results ── */
            noteSearchResults.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Icon name="search_off" className="text-[28px] text-slate-300 mb-2" />
                <p className="text-[11px] text-slate-400">No notes match "{noteSearch.trim()}"</p>
              </div>
            ) : (
              <div className="py-1">
                <p className="px-2 pt-1 pb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                  {noteSearchResults.length} result{noteSearchResults.length !== 1 ? 's' : ''}
                </p>
                {noteSearchResults.map(note => {
                  const { before: nb, match: nm, after: na } = splitHighlight(note.name, noteSearch.trim())
                  const isActive = selected?.noteId === note.id
                  return (
                    <button
                      key={note.id}
                      onClick={() => openNoteInTab(note.id, note.sourceKey)}
                      className={`w-full text-left px-2 py-1.5 rounded mb-0.5 transition-colors ${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-700'}`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <Icon name="description" className="text-[12px] flex-shrink-0 text-slate-400" />
                        <span className="text-[11px] font-medium truncate">
                          {nb}{nm && <mark className="bg-yellow-200 text-inherit rounded-sm px-0">{nm}</mark>}{na}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 truncate pl-4 mt-0.5">{note.sourceName}</p>
                      {note.snippet && (
                        <p className="text-[10px] text-slate-500 pl-4 mt-0.5 leading-relaxed line-clamp-2">
                          {note.snippet.before}
                          <mark className="bg-yellow-200 text-inherit rounded-sm px-0">{note.snippet.match}</mark>
                          {note.snippet.after}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <>
              {/* ── Pinned notes ── */}
              {pinnedNotes.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-amber-500">Pinned</p>
                  {pinnedNotes.map(note => (
                    <button
                      key={note.id}
                      onClick={() => openNoteInTab(note.id, note.sourceKey)}
                      className={`group w-full flex items-center gap-1.5 py-[3px] px-2 rounded text-left text-[12px] transition-colors ${
                        selected?.noteId === note.id ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span role="button" tabIndex={-1} title="Unpin"
                        onClick={e => { e.stopPropagation(); handlePin(note.id, note.sourceKey) }}
                        className="flex-shrink-0 p-0.5 rounded text-amber-400 hover:text-amber-600 transition-colors">
                        <Icon name="star" className="text-[11px]" />
                      </span>
                      <span className="truncate flex-1">{note.name}</span>
                      <span className="text-[9px] text-slate-400 flex-shrink-0 truncate max-w-[60px]">{note.sourceName}</span>
                    </button>
                  ))}
                  <div className="mx-2 mt-1.5 mb-0.5 border-t border-slate-100" />
                </div>
              )}

              {/* ── Recent notes ── */}
              {recentNotes.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Recent</p>
                  {recentNotes.map(note => (
                    <button
                      key={note.id}
                      onClick={() => openNoteInTab(note.id, note.sourceKey)}
                      className={`w-full flex items-center gap-1.5 py-[3px] px-2 rounded text-left text-[12px] transition-colors ${
                        selected?.noteId === note.id ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon name="description" className="text-[12px] text-slate-400 flex-shrink-0" />
                      <span className="truncate flex-1">{note.name}</span>
                      <span className="text-[9px] text-slate-400 flex-shrink-0 truncate max-w-[60px]">{note.sourceName}</span>
                    </button>
                  ))}
                  <div className="mx-2 mt-1.5 mb-0.5 border-t border-slate-100" />
                </div>
              )}

              {/* ── Project Notes folder ── */}
              <div className="mb-1">
                <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Project Notes</p>
                {projRootNotes.map(note => (
                  <NoteTreeNode
                    key={note.id}
                    note={note}
                    allNotes={projectNotes}
                    selectedNoteId={selected?.sourceKey === 'project' ? selected.noteId : null}
                    expandedNotes={expandedNotes}
                    onSelect={noteId => openNoteInTab(noteId, 'project')}
                    onToggle={id => setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }))}
                    onContextMenu={(e, n) => openNoteCtxMenu(e, n, 'project')}
                    depth={0}
                    sourceKey="project"
                    draggingNoteId={draggingNoteId}
                    onDragStart={(noteId) => { dragRef.current = { noteId, sourceKey: 'project' }; setDraggingNoteId(noteId) }}
                    onDragEnd={() => { dragRef.current = null; setDraggingNoteId(null) }}
                    onPin={noteId => handlePin(noteId, 'project')}
                  />
                ))}
                {creating?.sourceKey === 'project' && !creating.parentId && (
                  <form onSubmit={handleCreate} className="px-1 py-0.5">
                    <div className="flex items-center gap-1">
                      <Icon name={creating.type === 'folder' ? 'folder' : 'description'}
                        className={`text-[13px] flex-shrink-0 ${creating.type === 'folder' ? 'text-amber-500' : 'text-slate-400'}`} />
                      <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setCreating(null)}
                        placeholder={creating.type === 'folder' ? 'Folder name' : 'File name'}
                        className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded focus:outline-none focus:border-blue-400" />
                    </div>
                  </form>
                )}
                {projRootNotes.length === 0 && !creating && (
                  <p className="px-3 py-1 text-[11px] text-slate-400 italic">No project notes yet</p>
                )}
              </div>

              {/* ── Experiment folders ── */}
              {experiments.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-indigo-400">Experiments</p>
                  {experiments.map(exp => {
                    const sourceKey = `experiment:${exp.id}`
                    return (
                      <ExperimentFolder
                        key={exp.id}
                        exp={exp}
                        notes={expNotes[exp.id] || []}
                        loaded={loadedExps[exp.id] === true}
                        isOpen={!!expandedExps[exp.id]}
                        selectedNoteId={selected?.noteId}
                        isActiveSource={selected?.sourceKey === sourceKey}
                        expandedNotes={expandedNotes}
                        onToggle={() => setExpandedExps(prev => ({ ...prev, [exp.id]: !prev[exp.id] }))}
                        onSelectNote={noteId => openNoteInTab(noteId, sourceKey)}
                        onToggleNote={id => setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }))}
                        onNoteContextMenu={(e, n) => openNoteCtxMenu(e, n, sourceKey)}
                        onItemContextMenu={e => openExpCtxMenu(e, exp)}
                        creating={creating?.sourceKey === sourceKey ? creating : null}
                        newName={newName} setNewName={setNewName}
                        onCreateSubmit={handleCreate} onCancelCreate={() => setCreating(null)}
                        onPin={noteId => handlePin(noteId, sourceKey)}
                        draggingNoteId={draggingNoteId}
                        onDragStart={(noteId) => { dragRef.current = { noteId, sourceKey }; setDraggingNoteId(noteId) }}
                        onDragEnd={() => { dragRef.current = null; setDraggingNoteId(null) }}
                      />
                    )
                  })}
                </div>
              )}

              {/* ── Linked literature folders ── */}
              {linkedItems.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-blue-400">Literature</p>
                  {linkedItems.map(item => {
                    const sourceKey = `${item.itemType}:${item.id}`
                    return (
                      <LiteratureItemFolder
                        key={sourceKey}
                        item={item}
                        notes={itemNotes[sourceKey] || []}
                        loaded={loadedItems[sourceKey] === true}
                        isOpen={!!expandedLitItems[sourceKey]}
                        selectedNoteId={selected?.noteId}
                        isActiveSource={selected?.sourceKey === sourceKey}
                        expandedNotes={expandedNotes}
                        onToggle={() => setExpandedLitItems(prev => ({ ...prev, [sourceKey]: !prev[sourceKey] }))}
                        onSelectNote={noteId => openNoteInTab(noteId, sourceKey)}
                        onToggleNote={id => setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }))}
                        onNoteContextMenu={(e, n) => openNoteCtxMenu(e, n, sourceKey)}
                        onItemContextMenu={() => {}}
                        creating={creating?.sourceKey === sourceKey ? creating : null}
                        newName={newName} setNewName={setNewName}
                        onCreateSubmit={handleCreate} onCancelCreate={() => setCreating(null)}
                        onPin={noteId => handlePin(noteId, sourceKey)}
                        draggingNoteId={draggingNoteId}
                        onDragStart={(noteId) => { dragRef.current = { noteId, sourceKey }; setDraggingNoteId(noteId) }}
                        onDragEnd={() => { dragRef.current = null; setDraggingNoteId(null) }}
                      />
                    )
                  })}
                </div>
              )}

              {/* Empty state */}
              {!loading && projectNotes.length === 0 && experiments.length === 0 && linkedItems.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Icon name="edit_note" className="text-[32px] text-slate-300 mb-2" />
                  <p className="text-[11px] text-slate-400">No notes yet.</p>
                  <button onClick={() => { setCreating({ sourceKey: 'project', parentId: null, type: 'file' }); setNewName('') }}
                    className="mt-3 text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                    Create a note
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right: editor + tabs ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <TabBar
          tabs={openTabs}
          activeTabId={activeTabId}
          onActivate={id => { setActiveTabId(id); const tab = openTabs.find(t => t.noteId === id); if (tab?.tabType === 'note') activeEditorSourceRef.current = tab.sourceKey }}
          onClose={closeTab}
          graphView={graphView}
          onToggleGraph={() => setGraphView(v => !v)}
        />

        {graphView ? (
          /* ── Graph view ── */
          <NoteGraphView
            allNotes={graphNotes}
            collections={graphCollections}
            sourceKeyCollections={graphSourceKeyCollections}
            customSourceColors={PROJECT_GRAPH_SOURCE_COLORS}
            customSourceLabels={PROJECT_GRAPH_SOURCE_LABELS}
            storagePrefix="researchos.project.graph."
            onNoteClick={noteId => {
              const note = allLoadedNotes.find(n => n.id === noteId)
              if (!note) return
              openNoteInTab(noteId, note.sourceKey)
            }}
          />
        ) : (
          /* ── Editor view ── */
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {activeSuggestionTab ? (
                <SuggestionTabView
                  suggestion={activeSuggestionTab.suggestion}
                  allNotes={allLoadedNotes}
                  onAccept={sug => suggestionActionsRef.current[sug.id]?.onAccept(sug)}
                  onReject={sug => suggestionActionsRef.current[sug.id]?.onReject(sug)}
                />
              ) : selectedNote ? (
                <>
                  {/* Editor header */}
                  <div className="px-4 py-2 border-b border-slate-100 bg-white flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-1 min-w-0 text-[12px] text-slate-500">
                      {breadcrumb.map((part, i) => (
                        <span key={i} className="flex items-center gap-1 min-w-0">
                          {i > 0 && <Icon name="chevron_right" className="text-[14px] text-slate-300 flex-shrink-0" />}
                          <span className={`${i === breadcrumb.length - 1 ? 'text-slate-700 font-medium' : 'truncate'}`}>{part}</span>
                        </span>
                      ))}
                      {dirty && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Unsaved changes" />}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setShowBacklinks(v => !v)}
                        title={showBacklinks ? 'Hide backlinks' : 'Show backlinks'}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${showBacklinks ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                      >
                        <Icon name="link" className="text-[13px]" />
                        Backlinks
                        {backlinks.length > 0 && <span className="ml-0.5 text-[10px]">{backlinks.length}</span>}
                      </button>
                      <button onClick={save} disabled={!dirty}
                        className="text-[11px] text-slate-400 hover:text-blue-600 disabled:opacity-30 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors">
                        Save
                      </button>
                    </div>
                  </div>

                  <TiptapEditor
                    key={selectedNote.id}
                    content={content}
                    onUpdate={html => { setContent(html); setDirty(true) }}
                    onSave={save}
                    getAllNotes={getAllNotesForSuggestion}
                    onWikiLinkClick={handleWikiLinkClick}
                    noteName={selectedNote.name}
                  />

                  {(() => {
                    const words = stripHtml(content).trim().split(/\s+/).filter(Boolean).length
                    const mins = Math.ceil(words / 200)
                    return (
                      <div className="flex-shrink-0 px-5 py-1.5 border-t border-slate-100 bg-slate-50/60 text-[10px] text-slate-400 select-none">
                        {words.toLocaleString()} {words === 1 ? 'word' : 'words'} · {mins} min read
                      </div>
                    )
                  })()}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Icon name="edit_note" className="text-[48px] text-slate-200" />
                  <div className="text-center">
                    <p className="text-[13px] text-slate-400 font-medium">Select a note to edit</p>
                    <p className="text-[11px] text-slate-300 mt-1">Browse Project Notes or an Experiment folder</p>
                    <p className="text-[11px] text-indigo-300 mt-1">
                      Tip: type <span className="font-mono bg-slate-100 px-1 rounded text-indigo-500">[[</span> to link notes · click Graph to visualise
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Backlinks panel */}
            {showBacklinks && selectedNote && (
              <BacklinksPanel
                backlinks={backlinks}
                onNoteClick={note => openNoteInTab(note.id, note.sourceKey)}
              />
            )}

            {/* Notes Copilot panel */}
            <NotesCopilotPanel
              open={showCopilot}
              onToggle={() => setShowCopilot(v => !v)}
              allNotes={allLoadedNotes}
              onNotesChanged={handleCopilotNotesChanged}
              onOpenSuggestionTab={openSuggestionTab}
              onWikiLinkClick={handleWikiLinkClick}
              sendFn={projectNotesCopilotApi.send}
              scopeId={projectId}
              experiments={experiments}
            />
          </div>
        )}
      </div>

      {/* Template picker modal */}
      {templatePickerFor && (
        <TemplatePickerModal
          noteName={templatePickerFor.name}
          onSelect={handleCreateWithTemplate}
          onCancel={() => { setTemplatePickerFor(null); setCreating(null); setNewName('') }}
        />
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-52"
          onClick={e => e.stopPropagation()}
        >
          {ctxMenu.isExp ? (
            <>
              <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                <p className="text-[10px] text-slate-400 truncate font-medium uppercase tracking-wider">Experiment</p>
                <p className="text-[11px] text-slate-600 truncate">{ctxMenu.exp.name}</p>
              </div>
              <button
                onClick={() => {
                  const sourceKey = `experiment:${ctxMenu.exp.id}`
                  setCreating({ sourceKey, parentId: null, type: 'file' })
                  setNewName('')
                  setExpandedExps(prev => ({ ...prev, [ctxMenu.exp.id]: true }))
                  setCtxMenu(null)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
              >
                <Icon name="note_add" className="text-[14px] text-slate-400" /> New note here
              </button>
              <button
                onClick={() => {
                  const sourceKey = `experiment:${ctxMenu.exp.id}`
                  setCreating({ sourceKey, parentId: null, type: 'folder' })
                  setNewName('')
                  setExpandedExps(prev => ({ ...prev, [ctxMenu.exp.id]: true }))
                  setCtxMenu(null)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
              >
                <Icon name="create_new_folder" className="text-[14px] text-slate-400" /> New folder here
              </button>
            </>
          ) : ctxMenu.note ? (
            <>
              <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                <p className="text-[10px] text-slate-400 truncate font-medium uppercase tracking-wider">{ctxMenu.note.type === 'folder' ? 'Folder' : 'Note'}</p>
                <p className="text-[11px] text-slate-600 truncate">{ctxMenu.note.name}</p>
              </div>
              {ctxMenu.note.type === 'folder' && (
                <>
                  <button onClick={() => {
                    setCreating({ sourceKey: ctxMenu.sourceKey, parentId: ctxMenu.note.id, type: 'file' })
                    setNewName('')
                    setExpandedNotes(prev => ({ ...prev, [ctxMenu.note.id]: true }))
                    setCtxMenu(null)
                  }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50">
                    <Icon name="note_add" className="text-[14px] text-slate-400" /> New file inside
                  </button>
                  <button onClick={() => {
                    setCreating({ sourceKey: ctxMenu.sourceKey, parentId: ctxMenu.note.id, type: 'folder' })
                    setNewName('')
                    setExpandedNotes(prev => ({ ...prev, [ctxMenu.note.id]: true }))
                    setCtxMenu(null)
                  }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50">
                    <Icon name="create_new_folder" className="text-[14px] text-slate-400" /> New folder inside
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                </>
              )}
              {renaming?.noteId === ctxMenu.note.id ? (
                <form onSubmit={handleRename} className="px-3 py-1.5">
                  <input
                    autoFocus value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setRenaming(null)}
                    className="w-full text-[11px] border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-400"
                  />
                </form>
              ) : (
                <button onClick={() => {
                  setRenaming({ noteId: ctxMenu.note.id, sourceKey: ctxMenu.sourceKey })
                  setRenameDraft(ctxMenu.note.name)
                  setCtxMenu(null)
                }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50">
                  <Icon name="edit" className="text-[14px] text-slate-400" /> Rename
                </button>
              )}
              <button onClick={() => {
                handlePin(ctxMenu.note.id, ctxMenu.sourceKey)
                setCtxMenu(null)
              }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50">
                <Icon name="star" className="text-[14px] text-amber-400" />
                {ctxMenu.note.isPinned ? 'Unpin' : 'Pin to top'}
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button onClick={() => handleDelete(ctxMenu.note.id, ctxMenu.sourceKey)}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50">
                <Icon name="delete" className="text-[14px]" /> Delete
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Rename input (when triggered from context menu outside) */}
      {renaming && !ctxMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20" onClick={() => setRenaming(null)}>
          <form onSubmit={handleRename} onClick={e => e.stopPropagation()}
            className="bg-white rounded-lg shadow-xl border border-slate-200 px-4 py-3 w-72">
            <p className="text-[11px] text-slate-500 mb-2">Rename note</p>
            <input autoFocus value={renameDraft} onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setRenaming(null)}
              className="w-full text-[12px] border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setRenaming(null)} className="text-[11px] text-slate-500 px-2 py-1 rounded hover:bg-slate-100">Cancel</button>
              <button type="submit" className="text-[11px] text-white bg-blue-600 px-3 py-1 rounded hover:bg-blue-700">Rename</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
