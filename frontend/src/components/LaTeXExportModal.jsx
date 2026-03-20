/**
 * LaTeXExportModal — modal dialog for configuring and downloading LaTeX export.
 *
 * Props:
 *   open            {boolean}
 *   onClose         {() => void}
 *   notes           {Array}   — flat array of all notes in the project
 *   allNotes        {Array}   — same (for folder children lookup)
 *   selectedNote    {object}  — the note or folder being exported
 *   projectPapers   {Array}   — array of project-linked Paper objects
 *   projectWebsites {Array}   — array of project-linked Website objects
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import WindowModal from './WindowModal'
import { TEMPLATES } from '../utils/latexTemplates.js'
import { buildFullLatex, generateBibContent, folderToLatex, downloadLatexZip } from '../utils/latexExport.js'
import { htmlToLatex } from '../utils/latexSerializer.js'
import { extractCitations } from './CitationExtension.js'
import { deduplicateKeys } from '../utils/citationKeys.js'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// ── Sortable section item ─────────────────────────────────────────────────────

function SortableSection({ id, name }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0"
        title="Drag to reorder"
      >
        <Icon name="drag_indicator" className="text-[16px]" />
      </span>
      <Icon name="description" className="text-[14px] text-slate-400 flex-shrink-0" />
      <span className="flex-1 truncate">{name}</span>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function LaTeXExportModal({
  open,
  onClose,
  notes,
  allNotes,
  selectedNote,
  projectPapers,
  projectWebsites,
}) {
  const [template, setTemplate] = useState('article')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [sectionOrder, setSectionOrder] = useState([])
  const [generating, setGenerating] = useState(false)

  const isFolder = selectedNote?.type === 'folder'

  // Initialize state when modal opens / selectedNote changes
  useEffect(() => {
    if (!open || !selectedNote) return
    setTitle(selectedNote.name || '')
    setAuthor('')
    setTemplate('article')

    if (isFolder) {
      const children = (allNotes || [])
        .filter(n => n.parentId === selectedNote.id && n.type === 'file')
        .sort((a, b) => a.name.localeCompare(b.name))
      setSectionOrder(children.map(c => c.id))
    } else {
      setSectionOrder([])
    }
  }, [open, selectedNote, isFolder, allNotes])

  // ── DnD sensors ──────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor))

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSectionOrder(prev => {
      const oldIndex = prev.indexOf(active.id)
      const newIndex = prev.indexOf(over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  // ── Compute cited papers list ─────────────────────────────────────────────
  const citedItems = useCallback(() => {
    const allItems = [...(projectPapers || []), ...(projectWebsites || [])]

    // Collect citations from all notes being exported
    let citations = []
    if (isFolder) {
      const children = (allNotes || []).filter(n => n.parentId === selectedNote?.id && n.type === 'file')
      for (const child of children) {
        citations.push(...extractCitations(child.content || ''))
      }
    } else if (selectedNote) {
      citations = extractCitations(selectedNote.content || '')
    }

    // Deduplicate by citationKey
    const seenKeys = new Set()
    const uniqueCitations = citations.filter(c => {
      if (seenKeys.has(c.citationKey)) return false
      seenKeys.add(c.citationKey)
      return true
    })

    // Resolve to actual item objects
    const resolved = []
    for (const citation of uniqueCitations) {
      const item = allItems.find(i =>
        (citation.paperId && i.id === citation.paperId) ||
        (citation.websiteId && i.id === citation.websiteId)
      )
      if (item) resolved.push(item)
    }
    return resolved
  }, [isFolder, selectedNote, allNotes, projectPapers, projectWebsites])

  // ── Generate citation key preview list ───────────────────────────────────
  const resolvedCitations = useCallback(() => {
    const items = citedItems()
    return deduplicateKeys(items)
  }, [citedItems])

  // ── Download handler ──────────────────────────────────────────────────────
  async function handleDownload() {
    if (!selectedNote) return
    setGenerating(true)
    try {
      let body = ''
      let usedKeys = new Set()

      if (isFolder) {
        const result = folderToLatex(selectedNote, sectionOrder, allNotes || [])
        body = result.body
        usedKeys = result.usedKeys
      } else {
        const result = htmlToLatex(selectedNote.content || '')
        body = result.latex
        usedKeys = result.usedKeys
      }

      // Resolve cited items from usedKeys
      const allItems = [...(projectPapers || []), ...(projectWebsites || [])]
      const allCitations = isFolder
        ? (allNotes || [])
            .filter(n => n.parentId === selectedNote.id && n.type === 'file')
            .flatMap(n => extractCitations(n.content || ''))
        : extractCitations(selectedNote.content || '')

      const citedIds = new Set([...usedKeys])
      const citedItemObjects = []
      for (const citation of allCitations) {
        if (!citedIds.has(citation.citationKey)) continue
        const item = allItems.find(i =>
          (citation.paperId && i.id === citation.paperId) ||
          (citation.websiteId && i.id === citation.websiteId)
        )
        if (item && !citedItemObjects.find(x => x.id === item.id)) {
          citedItemObjects.push(item)
        }
      }

      const bibContent = generateBibContent(citedItemObjects)

      // Sanitize baseName: lowercase, spaces to hyphens, strip special chars
      const baseName = (title || selectedNote.name || 'export')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        || 'export'

      const texContent = buildFullLatex({ body, template, title, author, baseName, usedKeys })
      await downloadLatexZip({ texContent, bibContent, baseName })
    } catch (err) {
      console.error('LaTeX export failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  if (!open) return null

  const sectionItems = isFolder
    ? sectionOrder
        .map(id => (allNotes || []).find(n => n.id === id))
        .filter(Boolean)
    : []

  const citeItems = resolvedCitations()

  return createPortal(
    <WindowModal
      open={open}
      onClose={onClose}
      title="Export as LaTeX"
      iconName="functions"
      iconWrapClassName="bg-purple-100"
      iconClassName="text-[16px] text-purple-600"
      normalPanelClassName="w-full max-w-lg max-h-[85vh] rounded-xl"
      bodyClassName="flex flex-col min-h-0"
    >
      <div className="flex flex-col min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-4 pb-3 space-y-4">

          {/* Template selection */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Template
            </label>
            <div className="flex gap-2">
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <button
                  key={key}
                  onClick={() => setTemplate(key)}
                  className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium border transition-colors ${
                    template === key
                      ? 'bg-purple-50 border-purple-300 text-purple-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Title field */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Document title"
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-purple-400 text-slate-700"
            />
          </div>

          {/* Author field */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Author(s)
            </label>
            <input
              type="text"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="Author name(s)"
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-purple-400 text-slate-700"
            />
          </div>

          {/* Section ordering (folder export only) */}
          {isFolder && sectionItems.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Section Order
              </label>
              <DndContext
                id="latex-section-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {sectionItems.map(note => (
                      <SortableSection key={note.id} id={note.id} name={note.name} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* Cited papers list */}
          {citeItems.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Cited Papers ({citeItems.length})
              </label>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-1.5 font-semibold text-slate-500 w-36">Citation Key</th>
                      <th className="text-left px-3 py-1.5 font-semibold text-slate-500">Title</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {citeItems.map((item, i) => (
                      <tr key={item.id || i}>
                        <td className="px-3 py-1.5 font-mono text-purple-600 whitespace-nowrap">
                          {item._resolvedKey}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600 truncate max-w-0">
                          <span className="block truncate" title={item.title}>{item.title || 'Untitled'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {citeItems.length === 0 && (
            <div className="text-[11px] text-slate-400 italic">
              No citations detected in this {isFolder ? 'folder' : 'note'}.
              Use @ in the editor to insert citations.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 flex-shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleDownload}
          disabled={generating || !selectedNote}
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {generating ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Generating…
            </>
          ) : (
            <>
              <Icon name="download" className="text-[16px]" />
              Download .zip
            </>
          )}
        </button>
      </div>
    </WindowModal>,
    document.body
  )
}
