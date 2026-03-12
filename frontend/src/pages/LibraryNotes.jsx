import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import { notesApi, papersApi, websitesApi, githubReposApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'
import { createWikiLinkExtension, extractWikiLinks } from '../components/WikiLinkExtension'
import NoteGraphView from '../components/NoteGraphView'

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

// ─── Tiptap WYSIWYG editor ────────────────────────────────────────────────────
function TiptapEditor({ content, onUpdate, onSave, getAllNotes, onWikiLinkClick }) {
  // Build wiki link extension once per editor instance; use refs so the callbacks
  // always see the latest values without needing to recreate the extension.
  const getAllNotesRef = useRef(getAllNotes)
  const onWikiLinkClickRef = useRef(onWikiLinkClick)
  useEffect(() => { getAllNotesRef.current = getAllNotes }, [getAllNotes])
  useEffect(() => { onWikiLinkClickRef.current = onWikiLinkClick }, [onWikiLinkClick])

  const wikiLinkExtension = useMemo(
    () =>
      createWikiLinkExtension({
        getAllNotes: () => getAllNotesRef.current?.() ?? [],
        onWikiLinkClick: name => onWikiLinkClickRef.current?.(name),
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

  if (!editor) return null

  return (
    <>
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-white flex-wrap flex-shrink-0">
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
            if (editor.isActive('link')) editor.chain().focus().unsetLink().run()
            else { const url = window.prompt('URL'); if (url) editor.chain().focus().setLink({ href: url }).run() }
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
        <ToolBtn icon="undo" label="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} />
        <ToolBtn icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={() => editor.chain().focus().redo().run()} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full p-5 max-w-4xl" />
      </div>
    </>
  )
}

// ─── Recursive note tree node ─────────────────────────────────────────────────
function NoteTreeNode({ note, allNotes, selectedNoteId, expandedNotes, onSelect, onToggle, onContextMenu, depth = 0 }) {
  const children = allNotes.filter(n => n.parentId === note.id)
  const isFolder = note.type === 'folder'
  const isOpen = expandedNotes[note.id]
  const isSelected = selectedNoteId === note.id

  return (
    <div>
      <button
        onClick={() => isFolder ? onToggle(note.id) : onSelect(note.id)}
        onContextMenu={e => { e.preventDefault(); onContextMenu(e, note) }}
        className={`w-full flex items-center gap-1 py-[3px] text-[12px] rounded transition-colors text-left ${
          isSelected ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: 6 }}
      >
        {isFolder ? (
          <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="text-[12px] text-slate-400 flex-shrink-0" />
        ) : (
          <span className="w-[12px] flex-shrink-0" />
        )}
        <Icon
          name={isFolder ? (isOpen ? 'folder_open' : 'folder') : 'description'}
          className={`text-[13px] flex-shrink-0 ${isFolder ? 'text-amber-500' : 'text-slate-400'}`}
        />
        <span className="truncate flex-1">{note.name}</span>
      </button>
      {isFolder && isOpen && children
        .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)
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
          />
        ))}
    </div>
  )
}

// ─── Item type styles ─────────────────────────────────────────────────────────
const ITEM_STYLES = {
  paper:   { text: 'text-blue-600',   bg: 'hover:bg-blue-50',   activeBg: 'bg-blue-50',   border: 'border-blue-100', icon: 'article',  chevron: 'text-blue-400',   badge: 'bg-blue-100 text-blue-600' },
  website: { text: 'text-teal-600',   bg: 'hover:bg-teal-50',   activeBg: 'bg-teal-50',   border: 'border-teal-100', icon: 'link',     chevron: 'text-teal-400',   badge: 'bg-teal-100 text-teal-600' },
  github:  { text: 'text-violet-600', bg: 'hover:bg-violet-50', activeBg: 'bg-violet-50', border: 'border-violet-100', icon: 'code',  chevron: 'text-violet-400', badge: 'bg-violet-100 text-violet-600' },
}

// ─── Item folder ──────────────────────────────────────────────────────────────
function ItemFolder({
  item, itemType, sourceKey,
  notes, loaded, isOpen,
  selectedNoteId, isActiveSource,
  expandedNotes,
  onToggle, onSelectNote, onToggleNote, onNoteContextMenu, onItemContextMenu,
  creating, newName, setNewName, onCreateSubmit, onCancelCreate,
}) {
  const s = ITEM_STYLES[itemType]
  const title =
    itemType === 'paper'   ? (item.title || 'Untitled Paper') :
    itemType === 'website' ? (item.title || item.url || 'Untitled Website') :
                             `${item.owner}/${item.repoName}`

  const rootNotes = (notes || [])
    .filter(n => !n.parentId)
    .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)

  const noteCount = (notes || []).length

  return (
    <div>
      <div
        onClick={onToggle}
        onContextMenu={e => { e.preventDefault(); onItemContextMenu(e) }}
        title={title}
        className={`flex items-center gap-1.5 py-[3px] px-1.5 rounded cursor-pointer text-[12px] transition-colors ${s.bg} ${isActiveSource ? s.activeBg : ''}`}
      >
        <Icon
          name={isOpen ? 'expand_more' : 'chevron_right'}
          className={`text-[12px] ${s.chevron} flex-shrink-0`}
        />
        <span className={`inline-flex items-center justify-center w-4 h-4 rounded flex-shrink-0 ${s.badge}`}>
          <Icon name={s.icon} className="text-[11px]" />
        </span>
        <span className={`flex-1 truncate font-medium ${s.text}`}>{title}</span>
        {loaded && noteCount > 0 && (
          <span className={`text-[10px] opacity-60 ${s.text} flex-shrink-0`}>{noteCount}</span>
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
            />
          ))}
          {loaded && rootNotes.length === 0 && !creating && (
            <p className="pl-9 py-1 text-[11px] text-slate-400 italic">No notes yet</p>
          )}
          {creating && (
            <form onSubmit={onCreateSubmit} className="pl-7 pr-2 py-0.5">
              <div className="flex items-center gap-1">
                <Icon
                  name={creating.type === 'folder' ? 'folder' : 'description'}
                  className={`text-[12px] flex-shrink-0 ${creating.type === 'folder' ? 'text-amber-500' : 'text-slate-400'}`}
                />
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && onCancelCreate()}
                  placeholder={creating.type === 'folder' ? 'Folder name' : 'File name'}
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded focus:outline-none focus:border-blue-400"
                />
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Breadcrumb path helper ───────────────────────────────────────────────────
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

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ tabs, activeTabId, onActivate, onClose, graphView, onToggleGraph }) {
  return (
    <div className="flex items-stretch flex-shrink-0 border-b border-slate-200 bg-slate-50 min-h-[34px]">
      {/* Scrollable tab strip */}
      <div className="flex items-end overflow-x-auto flex-1 px-1 pt-1 gap-0.5 min-w-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map(tab => {
          const isActive = tab.noteId === activeTabId
          return (
            <div
              key={tab.noteId}
              className={`group flex items-center gap-1 px-2.5 py-1 rounded-t text-[12px] cursor-pointer select-none flex-shrink-0 transition-colors border-t border-l border-r ${
                isActive
                  ? 'bg-white border-slate-200 text-slate-700 font-medium'
                  : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
              style={{ maxWidth: 180, borderBottom: isActive ? '1px solid white' : '1px solid transparent', marginBottom: isActive ? -1 : 0 }}
              onClick={() => onActivate(tab.noteId)}
            >
              <Icon name="description" className="text-[12px] text-slate-400 flex-shrink-0" />
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

      {/* Graph toggle — pinned to the right of the tab row */}
      <div className="flex items-center px-2 flex-shrink-0 border-l border-slate-200">
        <button
          onClick={onToggleGraph}
          title={graphView ? 'Switch to editor' : 'Switch to graph view'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
            graphView
              ? 'bg-indigo-600 text-white'
              : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          <Icon name={graphView ? 'edit_note' : 'hub'} className="text-[14px]" />
          {graphView ? 'Editor' : 'Graph'}
        </button>
      </div>
    </div>
  )
}

// ─── Note templates ───────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'blank',
    label: 'Blank',
    icon: 'description',
    description: 'Start with an empty note',
    content: '',
  },
  {
    id: 'paper_summary',
    label: 'Paper Summary',
    icon: 'article',
    description: 'Title, contributions, method, results, and takeaways',
    content: '<h1>Paper Summary</h1><h2>Key Contributions</h2><ul><li><p></p></li></ul><h2>Methodology</h2><p></p><h2>Results</h2><p></p><h2>Limitations</h2><p></p><h2>My Takeaways</h2><p></p>',
  },
  {
    id: 'experiment_log',
    label: 'Experiment Log',
    icon: 'science',
    description: 'Hypothesis, setup, procedure, and observations',
    content: '<h1>Experiment Log</h1><h2>Hypothesis</h2><p></p><h2>Setup</h2><p></p><h2>Procedure</h2><ul><li><p></p></li></ul><h2>Results</h2><p></p><h2>Observations &amp; Conclusions</h2><p></p>',
  },
  {
    id: 'literature_review',
    label: 'Literature Review',
    icon: 'library_books',
    description: 'Research question, key papers, themes, and synthesis',
    content: '<h1>Literature Review</h1><h2>Research Question</h2><p></p><h2>Key Papers</h2><ul><li><p></p></li></ul><h2>Themes &amp; Patterns</h2><p></p><h2>Gaps in Literature</h2><p></p><h2>Synthesis</h2><p></p>',
  },
]

// ─── Template picker modal ────────────────────────────────────────────────────
function TemplatePickerModal({ noteName, onSelect, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-[480px] max-w-[90vw] p-6">
        <div className="mb-5">
          <h2 className="text-[15px] font-semibold text-slate-800">Choose a template</h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Creating <span className="font-medium text-slate-700">"{noteName}"</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t.content)}
              className="flex flex-col items-start gap-1.5 p-3.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="flex items-center gap-2">
                <Icon name={t.icon} className="text-[18px] text-slate-400 group-hover:text-blue-500 transition-colors" />
                <span className="text-[13px] font-medium text-slate-700 group-hover:text-blue-700 transition-colors">{t.label}</span>
              </div>
              <span className="text-[11px] text-slate-400 leading-snug">{t.description}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onCancel}
            className="text-[12px] text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
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
        ) : (
          backlinks.map(note => (
            <button
              key={note.id}
              onClick={() => onNoteClick(note)}
              className="w-full flex items-center gap-1.5 py-[3px] px-2 text-[12px] text-slate-600 hover:bg-slate-100 rounded transition-colors text-left"
            >
              <Icon name="description" className="text-[12px] text-slate-400 flex-shrink-0" />
              <span className="truncate flex-1">{note.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Notes IDE page ──────────────────────────────────────────────────────
export default function LibraryNotes() {
  const { activeLibraryId } = useLibrary()

  // ── Data ───────────────────────────────────────────────────────────────────
  const [papers, setPapers] = useState([])
  const [websites, setWebsites] = useState([])
  const [githubRepos, setGithubRepos] = useState([])
  const [libraryNotes, setLibraryNotes] = useState([])
  const [itemNotes, setItemNotes] = useState({})       // sourceKey → Note[]
  const [loadedItems, setLoadedItems] = useState({})   // sourceKey → bool
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Tree UI state ──────────────────────────────────────────────────────────
  const [expandedItems, setExpandedItems] = useState({})
  const [expandedNotes, setExpandedNotes] = useState({})

  // ── Tabs: each entry is { noteId, source, name } ──────────────────────────
  const [openTabs, setOpenTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)

  // ── Editor state ───────────────────────────────────────────────────────────
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const saveTimerRef = useRef(null)

  // ── Graph view toggle ──────────────────────────────────────────────────────
  const [graphView, setGraphView] = useState(false)

  // ── Backlinks panel toggle ─────────────────────────────────────────────────
  const [showBacklinks, setShowBacklinks] = useState(false)

  // ── Template picker: stores pending file-creation data while modal is open ─
  const [templatePickerFor, setTemplatePickerFor] = useState(null)

  // ── Content search ─────────────────────────────────────────────────────────
  const [noteSearch, setNoteSearch] = useState('')

  // ── Creation / rename / context menu ──────────────────────────────────────
  const [creating, setCreating] = useState(null)
  const [newName, setNewName] = useState('')
  const [ctxMenu, setCtxMenu] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')

  // ── Derive `selected` from active tab ─────────────────────────────────────
  const selected = useMemo(() => {
    if (!activeTabId) return null
    const tab = openTabs.find(t => t.noteId === activeTabId)
    return tab ? { noteId: tab.noteId, source: tab.source } : null
  }, [activeTabId, openTabs])

  // ── Note content search helpers ────────────────────────────────────────────
  function stripHtml(html) {
    if (!html) return ''
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim()
  }

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

  // ── Flat list of all loaded notes (for wiki-link suggestions + graph) ──────
  const allLoadedNotes = useMemo(() => {
    const result = libraryNotes.map(n => ({ ...n, source: 'library', sourceName: 'Library', sourceKey: 'library' }))
    for (const [key, notes] of Object.entries(itemNotes)) {
      const [type, id] = key.split(':')
      let sourceName = ''
      if (type === 'paper') {
        const p = papers.find(p => p.id === id)
        sourceName = p?.title || 'Paper'
      } else if (type === 'website') {
        const w = websites.find(w => w.id === id)
        sourceName = w?.title || w?.url || 'Website'
      } else if (type === 'github') {
        const r = githubRepos.find(r => r.id === id)
        sourceName = r ? `${r.owner}/${r.repoName}` : 'Repo'
      }
      for (const note of notes) {
        result.push({ ...note, source: type, sourceName, sourceKey: key })
      }
    }
    return result
  }, [libraryNotes, itemNotes])

  // ── Search results: flat filtered list matching name or content ────────────
  const noteSearchResults = useMemo(() => {
    const q = noteSearch.trim()
    if (q.length < 2) return []
    const qLow = q.toLowerCase()
    return allLoadedNotes
      .filter(n => n.type === 'file')
      .filter(n => {
        const nameMatch = n.name.toLowerCase().includes(qLow)
        const contentMatch = stripHtml(n.content).toLowerCase().includes(qLow)
        return nameMatch || contentMatch
      })
      .map(n => {
        const plain = stripHtml(n.content)
        return { ...n, snippet: getMatchSnippet(plain, q) }
      })
      .slice(0, 50)
  }, [allLoadedNotes, noteSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeLibraryId) return
    setLoading(true)
    setError(null)
    Promise.all([
      papersApi.list({ library_id: activeLibraryId }).catch(() => []),
      websitesApi.list({ library_id: activeLibraryId }).catch(() => []),
      githubReposApi.list({ library_id: activeLibraryId }).catch(() => []),
      notesApi.listForLibrary(activeLibraryId).catch(() => []),
    ]).then(([paps, sites, repos, libNotes]) => {
      setPapers(paps || [])
      setWebsites(sites || [])
      setGithubRepos(repos || [])
      setLibraryNotes(libNotes || [])

      // Eagerly load all item notes in the background so they are available
      // for wiki-link suggestions and the graph view even before folders are
      // expanded in the tree.
      const paperKeys   = (paps   || []).map(p => ({ key: `paper:${p.id}`,   fetch: () => notesApi.list(p.id) }))
      const websiteKeys = (sites  || []).map(s => ({ key: `website:${s.id}`, fetch: () => notesApi.listForWebsite(s.id) }))
      const repoKeys    = (repos  || []).map(r => ({ key: `github:${r.id}`,  fetch: () => notesApi.listForGitHubRepo(r.id) }))
      const allItems    = [...paperKeys, ...websiteKeys, ...repoKeys]

      Promise.allSettled(allItems.map(({ fetch }) => fetch())).then(results => {
        const notesMap = {}
        const loadedMap = {}
        results.forEach((result, i) => {
          const key = allItems[i].key
          notesMap[key]  = result.status === 'fulfilled' ? (result.value || []) : []
          loadedMap[key] = true
        })
        setItemNotes(prev => ({ ...prev, ...notesMap }))
        setLoadedItems(prev => ({ ...prev, ...loadedMap }))
      })
    }).catch(err => {
      setError(err.message)
    }).finally(() => setLoading(false))
  }, [activeLibraryId])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getSourceNotes(source) {
    if (source === 'library') return libraryNotes
    return itemNotes[source] || []
  }

  function setSourceNotes(source, updater) {
    if (source === 'library') {
      setLibraryNotes(prev => typeof updater === 'function' ? updater(prev) : updater)
    } else {
      setItemNotes(prev => ({
        ...prev,
        [source]: typeof updater === 'function' ? updater(prev[source] || []) : updater,
      }))
    }
  }

  const selectedNote = selected
    ? getSourceNotes(selected.source).find(n => n.id === selected.noteId) ?? null
    : null

  function sourceLabel(source) {
    if (source === 'library') return activeLibraryId ? 'Library' : null
    const [type, id] = source.split(':')
    if (type === 'paper') { const p = papers.find(p => p.id === id); return p?.title || 'Paper' }
    if (type === 'website') { const w = websites.find(w => w.id === id); return w?.title || w?.url || 'Website' }
    if (type === 'github') { const r = githubRepos.find(r => r.id === id); return r ? `${r.owner}/${r.repoName}` : 'Repo' }
    return null
  }

  // ── Open a note in a tab (or activate existing tab) ────────────────────────
  function openNoteInTab(noteId, source) {
    const notes = getSourceNotes(source)
    const note = notes.find(n => n.id === noteId)
    if (!note || note.type === 'folder') return

    setOpenTabs(prev => {
      if (prev.some(t => t.noteId === noteId)) return prev
      return [...prev, { noteId, source, name: note.name }]
    })
    setActiveTabId(noteId)
    setGraphView(false)
  }

  // ── Handle wiki link click: resolve by ID first, fall back to name ────────
  function handleWikiLinkClick(noteName, noteId) {
    let target
    if (noteId) {
      target = allLoadedNotes.find(n => n.id === noteId)
    } else {
      // Name-only fallback: prefer a note in the same source as the current note
      // to avoid cross-paper collisions (e.g. every paper having its own "Summary").
      const nameLower = noteName.toLowerCase()
      const candidates = allLoadedNotes.filter(n => n.type === 'file' && n.name.toLowerCase() === nameLower)
      const currentSourceKey = selected?.source ?? 'library'
      target = candidates.find(n => n.sourceKey === currentSourceKey) ?? candidates[0]
    }
    if (target) {
      // Figure out source from allLoadedNotes entry
      const source = target.source === 'paper' || target.source === 'website' || target.source === 'github'
        ? Object.keys(itemNotes).find(key => {
            const notes = itemNotes[key]
            return notes?.some(n => n.id === target.id)
          }) ?? 'library'
        : 'library'
      openNoteInTab(target.id, source)
    } else {
      // Offer to create a new library note with that name
      if (window.confirm(`Note "${noteName}" doesn't exist. Create it?`)) {
        handleCreateByName(noteName, 'library')
      }
    }
  }

  async function handleCreateByName(name, source) {
    try {
      let note
      if (source === 'library') {
        note = await notesApi.createForLibrary(activeLibraryId, { name, type: 'file', content: '' })
        setLibraryNotes(prev => [...prev, note])
      }
      if (note) openNoteInTab(note.id, 'library')
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }

  // ── Sync editor content when active tab changes ────────────────────────────
  useEffect(() => {
    if (selectedNote) {
      setContent(selectedNote.content || '')
      setDirty(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.noteId])

  // Keep tab names in sync when notes are renamed
  useEffect(() => {
    setOpenTabs(prev =>
      prev.map(tab => {
        const note = allLoadedNotes.find(n => n.id === tab.noteId)
        return note ? { ...tab, name: note.name } : tab
      })
    )
  }, [allLoadedNotes])

  // ── Auto-save ──────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!selected || !dirty) return
    try {
      const updated = await notesApi.update(selected.noteId, { content })
      setSourceNotes(selected.source, prev => prev.map(n => n.id === updated.id ? updated : n))
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
  }, [!!ctxMenu])

  // ── Load item notes lazily ─────────────────────────────────────────────────
  async function loadItemNotes(sourceKey) {
    if (loadedItems[sourceKey]) return
    const [type, id] = sourceKey.split(':')
    try {
      let notes = []
      if (type === 'paper') notes = await notesApi.list(id)
      else if (type === 'website') notes = await notesApi.listForWebsite(id)
      else if (type === 'github') notes = await notesApi.listForGitHubRepo(id)
      setItemNotes(prev => ({ ...prev, [sourceKey]: notes || [] }))
    } catch (err) {
      console.error('Failed to load notes for', sourceKey, err)
    } finally {
      setLoadedItems(prev => ({ ...prev, [sourceKey]: true }))
    }
  }

  async function toggleItem(sourceKey) {
    const willOpen = !expandedItems[sourceKey]
    setExpandedItems(prev => ({ ...prev, [sourceKey]: !prev[sourceKey] }))
    if (willOpen && !loadedItems[sourceKey]) {
      await loadItemNotes(sourceKey)
    }
  }

  // ── Create note ────────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim() || !creating) return
    const { source, parentId, type } = creating

    // For file creation show the template picker; it will call handleCreateWithTemplate
    if (type === 'file') {
      setTemplatePickerFor({ source, parentId, name: newName.trim() })
      return
    }

    // Folder creation proceeds immediately
    try {
      const data = { name: newName.trim(), type, parentId: parentId || null }
      let note
      if (source === 'library') {
        note = await notesApi.createForLibrary(activeLibraryId, data)
        setLibraryNotes(prev => [...prev, note])
      } else {
        const [itemType, itemId] = source.split(':')
        if (itemType === 'paper') note = await notesApi.create(itemId, data)
        else if (itemType === 'website') note = await notesApi.createForWebsite(itemId, data)
        else if (itemType === 'github') note = await notesApi.createForGitHubRepo(itemId, data)
        setItemNotes(prev => ({ ...prev, [source]: [...(prev[source] || []), note] }))
      }
      if (parentId) setExpandedNotes(prev => ({ ...prev, [parentId]: true }))
      setCreating(null)
      setNewName('')
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }

  // ── Create note with a chosen template ────────────────────────────────────
  async function handleCreateWithTemplate(templateContent) {
    if (!templatePickerFor) return
    const { source, parentId, name } = templatePickerFor
    setTemplatePickerFor(null)
    setCreating(null)
    setNewName('')
    try {
      const data = { name, type: 'file', parentId: parentId || null, content: templateContent }
      let note
      if (source === 'library') {
        note = await notesApi.createForLibrary(activeLibraryId, data)
        setLibraryNotes(prev => [...prev, note])
      } else {
        const [itemType, itemId] = source.split(':')
        if (itemType === 'paper') note = await notesApi.create(itemId, data)
        else if (itemType === 'website') note = await notesApi.createForWebsite(itemId, data)
        else if (itemType === 'github') note = await notesApi.createForGitHubRepo(itemId, data)
        setItemNotes(prev => ({ ...prev, [source]: [...(prev[source] || []), note] }))
      }
      if (parentId) setExpandedNotes(prev => ({ ...prev, [parentId]: true }))
      if (note) openNoteInTab(note.id, source)
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }

  // ── Delete note ────────────────────────────────────────────────────────────
  async function handleDelete(noteId, source) {
    try {
      await notesApi.remove(noteId)
      const toRemove = new Set()
      const allNotes = getSourceNotes(source)
      function collect(id) {
        toRemove.add(id)
        allNotes.filter(n => n.parentId === id).forEach(n => collect(n.id))
      }
      collect(noteId)
      setSourceNotes(source, prev => prev.filter(n => !toRemove.has(n.id)))
      // Close any tabs for deleted notes
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
      setSourceNotes(renaming.source, prev => prev.map(n => n.id === updated.id ? updated : n))
    } catch (err) {
      console.error('Failed to rename note:', err)
    }
    setRenaming(null)
  }

  // ── Close a tab ────────────────────────────────────────────────────────────
  function closeTab(noteId) {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.noteId === noteId)
      const next = prev[idx + 1] ?? prev[idx - 1]
      if (noteId === activeTabId) setActiveTabId(next?.noteId ?? null)
      return prev.filter(t => t.noteId !== noteId)
    })
  }

  // ── Context menu helpers ───────────────────────────────────────────────────
  function openNoteCtxMenu(e, note, source) {
    setCtxMenu({ note, source, x: e.clientX, y: e.clientY })
  }

  function openItemCtxMenu(e, item, itemType, sourceKey) {
    setCtxMenu({ item, itemType, sourceKey, x: e.clientX, y: e.clientY, isItem: true })
  }

  // ── Tree data ──────────────────────────────────────────────────────────────
  const libRootNotes = libraryNotes
    .filter(n => !n.parentId)
    .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)

  const sortedPapers = [...papers].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  const sortedWebsites = [...websites].sort((a, b) => (a.title || a.url || '').localeCompare(b.title || b.url || ''))
  const sortedRepos = [...githubRepos].sort((a, b) => `${a.owner}/${a.repoName}`.localeCompare(`${b.owner}/${b.repoName}`))

  const breadcrumb = selected
    ? buildPath(selected.noteId, getSourceNotes(selected.source), sourceLabel(selected.source))
    : []

  // ── Wiki link suggestion callback (stable ref) ────────────────────────────
  const getAllNotesForSuggestion = useCallback(
    () => allLoadedNotes,
    [allLoadedNotes]
  )

  // ── Backlinks: notes whose links resolve to the current note ─────────────
  const backlinks = useMemo(() => {
    if (!selectedNote) return []
    const noteId          = selectedNote.id
    const noteName        = selectedNote.name.toLowerCase()
    const selectedSource  = selected?.source ?? 'library'

    // How many file-notes share the same name?  Used to short-circuit the
    // same-source check when the name is globally unique.
    const sameNameCount = allLoadedNotes.filter(
      n => n.type === 'file' && n.name.toLowerCase() === noteName
    ).length

    return allLoadedNotes.filter(n => {
      if (n.type !== 'file' || n.id === noteId) return false
      return extractWikiLinks(n.content || '').some(({ name, noteId: linkedId }) => {
        if (linkedId) return linkedId === noteId
        if (name.toLowerCase() !== noteName) return false
        // Name-only resolution: this link points to selectedNote when the
        // same-source heuristic would resolve here — i.e. N is in the same
        // source as selectedNote, or selectedNote has a globally unique name.
        return sameNameCount === 1 || n.sourceKey === selectedSource
      })
    })
  }, [selectedNote, selected, allLoadedNotes])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden bg-white" style={{ minHeight: 0 }}>

      {/* ── Left: file tree panel ─────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-50/60 overflow-hidden">

        {/* Panel header */}
        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest pl-0.5">
            Explorer
          </span>
          <div className="flex gap-0.5">
            <button
              onClick={() => { setCreating({ source: 'library', parentId: null, type: 'file' }); setNewName('') }}
              title="New file in Library"
              className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Icon name="note_add" className="text-[15px]" />
            </button>
            <button
              onClick={() => { setCreating({ source: 'library', parentId: null, type: 'folder' }); setNewName('') }}
              title="New folder in Library"
              className="p-0.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <Icon name="create_new_folder" className="text-[15px]" />
            </button>
          </div>
        </div>

        {/* Search bar */}
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
              <button
                onClick={() => setNoteSearch('')}
                className="absolute right-1.5 text-slate-400 hover:text-slate-600"
              >
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
                      className={`w-full text-left px-2 py-1.5 rounded mb-0.5 transition-colors ${
                        isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <Icon name="description" className="text-[12px] flex-shrink-0 text-slate-400" />
                        <span className="text-[11px] font-medium truncate">
                          {nb}
                          {nm && <mark className="bg-yellow-200 text-inherit rounded-sm px-0">{nm}</mark>}
                          {na}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 truncate pl-4 mt-0.5">{note.sourceName || 'Library'}</p>
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
              {/* ── Library notes ── */}
              {(libRootNotes.length > 0 || (creating?.source === 'library' && !creating.parentId)) && (
                <div className="mb-1">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                    Library
                  </p>
                  {libRootNotes.map(note => (
                    <NoteTreeNode
                      key={note.id}
                      note={note}
                      allNotes={libraryNotes}
                      selectedNoteId={selected?.source === 'library' ? selected.noteId : null}
                      expandedNotes={expandedNotes}
                      onSelect={noteId => openNoteInTab(noteId, 'library')}
                      onToggle={id => setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }))}
                      onContextMenu={(e, n) => openNoteCtxMenu(e, n, 'library')}
                      depth={0}
                    />
                  ))}
                  {creating?.source === 'library' && !creating.parentId && (
                    <form onSubmit={handleCreate} className="px-1 py-0.5">
                      <div className="flex items-center gap-1">
                        <Icon
                          name={creating.type === 'folder' ? 'folder' : 'description'}
                          className={`text-[13px] flex-shrink-0 ${creating.type === 'folder' ? 'text-amber-500' : 'text-slate-400'}`}
                        />
                        <input
                          autoFocus
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          onKeyDown={e => e.key === 'Escape' && setCreating(null)}
                          placeholder={creating.type === 'folder' ? 'Folder name' : 'File name'}
                          className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ── Papers ── */}
              {sortedPapers.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Papers</p>
                  {sortedPapers.map(paper => {
                    const sourceKey = `paper:${paper.id}`
                    return (
                      <ItemFolder
                        key={paper.id}
                        item={paper} itemType="paper" sourceKey={sourceKey}
                        notes={itemNotes[sourceKey]} loaded={!!loadedItems[sourceKey]}
                        isOpen={!!expandedItems[sourceKey]}
                        selectedNoteId={selected?.noteId} isActiveSource={selected?.source === sourceKey}
                        expandedNotes={expandedNotes}
                        onToggle={() => toggleItem(sourceKey)}
                        onSelectNote={noteId => openNoteInTab(noteId, sourceKey)}
                        onToggleNote={id => setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }))}
                        onNoteContextMenu={(e, n) => openNoteCtxMenu(e, n, sourceKey)}
                        onItemContextMenu={e => openItemCtxMenu(e, paper, 'paper', sourceKey)}
                        creating={creating?.source === sourceKey ? creating : null}
                        newName={newName} setNewName={setNewName}
                        onCreateSubmit={handleCreate} onCancelCreate={() => setCreating(null)}
                      />
                    )
                  })}
                </div>
              )}

              {/* ── Websites ── */}
              {sortedWebsites.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Websites</p>
                  {sortedWebsites.map(site => {
                    const sourceKey = `website:${site.id}`
                    return (
                      <ItemFolder
                        key={site.id}
                        item={site} itemType="website" sourceKey={sourceKey}
                        notes={itemNotes[sourceKey]} loaded={!!loadedItems[sourceKey]}
                        isOpen={!!expandedItems[sourceKey]}
                        selectedNoteId={selected?.noteId} isActiveSource={selected?.source === sourceKey}
                        expandedNotes={expandedNotes}
                        onToggle={() => toggleItem(sourceKey)}
                        onSelectNote={noteId => openNoteInTab(noteId, sourceKey)}
                        onToggleNote={id => setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }))}
                        onNoteContextMenu={(e, n) => openNoteCtxMenu(e, n, sourceKey)}
                        onItemContextMenu={e => openItemCtxMenu(e, site, 'website', sourceKey)}
                        creating={creating?.source === sourceKey ? creating : null}
                        newName={newName} setNewName={setNewName}
                        onCreateSubmit={handleCreate} onCancelCreate={() => setCreating(null)}
                      />
                    )
                  })}
                </div>
              )}

              {/* ── GitHub Repos ── */}
              {sortedRepos.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">GitHub Repos</p>
                  {sortedRepos.map(repo => {
                    const sourceKey = `github:${repo.id}`
                    return (
                      <ItemFolder
                        key={repo.id}
                        item={repo} itemType="github" sourceKey={sourceKey}
                        notes={itemNotes[sourceKey]} loaded={!!loadedItems[sourceKey]}
                        isOpen={!!expandedItems[sourceKey]}
                        selectedNoteId={selected?.noteId} isActiveSource={selected?.source === sourceKey}
                        expandedNotes={expandedNotes}
                        onToggle={() => toggleItem(sourceKey)}
                        onSelectNote={noteId => openNoteInTab(noteId, sourceKey)}
                        onToggleNote={id => setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }))}
                        onNoteContextMenu={(e, n) => openNoteCtxMenu(e, n, sourceKey)}
                        onItemContextMenu={e => openItemCtxMenu(e, repo, 'github', sourceKey)}
                        creating={creating?.source === sourceKey ? creating : null}
                        newName={newName} setNewName={setNewName}
                        onCreateSubmit={handleCreate} onCancelCreate={() => setCreating(null)}
                      />
                    )
                  })}
                </div>
              )}

              {/* Empty state */}
              {!loading && papers.length === 0 && websites.length === 0 && githubRepos.length === 0 && libraryNotes.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Icon name="edit_note" className="text-[32px] text-slate-300 mb-2" />
                  <p className="text-[11px] text-slate-400">No items in this library yet.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Add papers or create a library note.</p>
                  <button
                    onClick={() => { setCreating({ source: 'library', parentId: null, type: 'file' }); setNewName('') }}
                    className="mt-3 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Create a note
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right: editor + tabs + graph ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Tab bar — always visible; graph toggle lives on the right end */}
        <TabBar
          tabs={openTabs}
          activeTabId={activeTabId}
          onActivate={setActiveTabId}
          onClose={closeTab}
          graphView={graphView}
          onToggleGraph={() => setGraphView(v => !v)}
        />

        {graphView ? (
          /* ── Graph view ─────────────────────────────────────────────── */
          <NoteGraphView
            allNotes={allLoadedNotes}
            onNoteClick={noteId => {
              const note = allLoadedNotes.find(n => n.id === noteId)
              if (!note) return
              const source = note.source === 'paper' || note.source === 'website' || note.source === 'github'
                ? Object.keys(itemNotes).find(key => itemNotes[key]?.some(n => n.id === noteId)) ?? 'library'
                : 'library'
              openNoteInTab(noteId, source)
            }}
          />
        ) : (
          /* ── Editor view ────────────────────────────────────────────── */
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Editor column */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {selectedNote ? (
                <>
                  {/* Editor header with breadcrumb */}
                  <div className="px-4 py-2 border-b border-slate-100 bg-white flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-1 min-w-0 text-[12px] text-slate-500">
                      {breadcrumb.map((part, i) => (
                        <span key={i} className="flex items-center gap-1 min-w-0">
                          {i > 0 && <Icon name="chevron_right" className="text-[14px] text-slate-300 flex-shrink-0" />}
                          <span className={`${i === breadcrumb.length - 1 ? 'text-slate-700 font-medium' : 'truncate'}`}>
                            {part}
                          </span>
                        </span>
                      ))}
                      {dirty && (
                        <span className="ml-2 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Unsaved changes" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setShowBacklinks(v => !v)}
                        title={showBacklinks ? 'Hide backlinks' : 'Show backlinks'}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          showBacklinks
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Icon name="link" className="text-[13px]" />
                        Backlinks
                        {backlinks.length > 0 && (
                          <span className="ml-0.5 text-[10px]">{backlinks.length}</span>
                        )}
                      </button>
                      <button
                        onClick={save}
                        disabled={!dirty}
                        className="text-[11px] text-slate-400 hover:text-blue-600 disabled:opacity-30 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  {/* Tiptap editor */}
                  <TiptapEditor
                    key={selectedNote.id}
                    content={content}
                    onUpdate={html => { setContent(html); setDirty(true) }}
                    onSave={save}
                    getAllNotes={getAllNotesForSuggestion}
                    onWikiLinkClick={handleWikiLinkClick}
                  />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Icon name="edit_note" className="text-[48px] text-slate-200" />
                  <div className="text-center">
                    <p className="text-[13px] text-slate-400 font-medium">Select a note to edit</p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Or click a paper folder to browse its notes
                    </p>
                    <p className="text-[11px] text-indigo-300 mt-1">
                      Tip: type <span className="font-mono bg-slate-100 px-1 rounded text-indigo-500">[[</span> to link notes · click Graph to visualise
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Backlinks side panel */}
            {showBacklinks && selectedNote && (
              <BacklinksPanel
                backlinks={backlinks}
                onNoteClick={note => {
                  const source = note.source === 'paper' || note.source === 'website' || note.source === 'github'
                    ? Object.keys(itemNotes).find(key => itemNotes[key]?.some(n => n.id === note.id)) ?? 'library'
                    : 'library'
                  openNoteInTab(note.id, source)
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Template picker modal ─────────────────────────────────────────── */}
      {templatePickerFor && (
        <TemplatePickerModal
          noteName={templatePickerFor.name}
          onSelect={handleCreateWithTemplate}
          onCancel={() => { setTemplatePickerFor(null); setCreating(null); setNewName('') }}
        />
      )}

      {/* ── Context menu ──────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-52"
          onClick={e => e.stopPropagation()}
        >
          {ctxMenu.isItem ? (
            <>
              <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                <p className="text-[10px] text-slate-400 truncate font-medium uppercase tracking-wider">
                  {ctxMenu.itemType === 'paper' ? 'Paper' : ctxMenu.itemType === 'website' ? 'Website' : 'GitHub Repo'}
                </p>
                <p className="text-[11px] text-slate-600 truncate">
                  {ctxMenu.itemType === 'paper'
                    ? (ctxMenu.item.title || 'Untitled')
                    : ctxMenu.itemType === 'website'
                    ? (ctxMenu.item.title || ctxMenu.item.url)
                    : `${ctxMenu.item.owner}/${ctxMenu.item.repoName}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setCreating({ source: ctxMenu.sourceKey, parentId: null, type: 'file' })
                  setNewName('')
                  setExpandedItems(prev => ({ ...prev, [ctxMenu.sourceKey]: true }))
                  if (!loadedItems[ctxMenu.sourceKey]) loadItemNotes(ctxMenu.sourceKey)
                  setCtxMenu(null)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
              >
                <Icon name="note_add" className="text-[14px] text-slate-400" />
                New file here
              </button>
              <button
                onClick={() => {
                  setCreating({ source: ctxMenu.sourceKey, parentId: null, type: 'folder' })
                  setNewName('')
                  setExpandedItems(prev => ({ ...prev, [ctxMenu.sourceKey]: true }))
                  if (!loadedItems[ctxMenu.sourceKey]) loadItemNotes(ctxMenu.sourceKey)
                  setCtxMenu(null)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
              >
                <Icon name="create_new_folder" className="text-[14px] text-slate-400" />
                New folder here
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => {
                  const [type, id] = ctxMenu.sourceKey.split(':')
                  const route = type === 'paper' ? `/library/paper/${id}`
                    : type === 'website' ? `/library/website/${id}`
                    : `/library/github-repo/${id}`
                  window.open(route, '_blank')
                  setCtxMenu(null)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
              >
                <Icon name="open_in_new" className="text-[14px] text-slate-400" />
                Open in new tab
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-1 border-b border-slate-100 mb-1">
                <p className="text-[11px] text-slate-400 truncate">{ctxMenu.note?.name}</p>
              </div>
              {ctxMenu.note?.type === 'folder' && (
                <>
                  <button
                    onClick={() => {
                      setCreating({ source: ctxMenu.source, parentId: ctxMenu.note.id, type: 'file' })
                      setNewName('')
                      setExpandedNotes(prev => ({ ...prev, [ctxMenu.note.id]: true }))
                      setCtxMenu(null)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
                  >
                    <Icon name="note_add" className="text-[14px] text-slate-400" />
                    New file
                  </button>
                  <button
                    onClick={() => {
                      setCreating({ source: ctxMenu.source, parentId: ctxMenu.note.id, type: 'folder' })
                      setNewName('')
                      setExpandedNotes(prev => ({ ...prev, [ctxMenu.note.id]: true }))
                      setCtxMenu(null)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
                  >
                    <Icon name="create_new_folder" className="text-[14px] text-slate-400" />
                    New subfolder
                  </button>
                </>
              )}
              {renaming?.noteId === ctxMenu.note?.id ? (
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
                  onClick={() => {
                    setRenaming({ noteId: ctxMenu.note.id, source: ctxMenu.source })
                    setRenameDraft(ctxMenu.note.name)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
                >
                  <Icon name="edit" className="text-[14px] text-slate-400" />
                  Rename
                </button>
              )}
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => handleDelete(ctxMenu.note.id, ctxMenu.source)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
              >
                <Icon name="delete" className="text-[14px]" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
