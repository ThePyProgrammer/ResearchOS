import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import CanvasPreview from './CanvasPreview'
import { notePath, resolveFile } from '../../utils/jsonCanvas'

function EmbedView({ node, extension }) {
  const notes = extension.options.getNotes()
  const target = resolveFile({ file: node.attrs.file, ...(node.attrs.noteId ? { researchos: { noteId: node.attrs.noteId } } : {}) }, notes)
  return <NodeViewWrapper className="canvas-note-embed" contentEditable={false}>
    <button type="button" onClick={() => target && extension.options.onOpen(target.name, target.id)}>{target?.name || node.attrs.file} ↗</button>
    <div style={{ height: 260 }}>{target?.type === 'canvas' ? <CanvasPreview content={target.content} notes={notes} sourceKey={target.sourceKey} visited={[target.id]} /> : <p>Canvas unavailable. Check the file name or reinsert the embed.</p>}</div>
  </NodeViewWrapper>
}

export const CanvasEmbed = Node.create({
  name: 'canvasEmbed', group: 'block', atom: true, draggable: true, priority: 1100,
  addOptions() { return { getNotes: () => [], onOpen: () => {} } },
  addAttributes() {
    return {
      file: { default: '', parseHTML: element => element.getAttribute('data-canvas-file'), renderHTML: attrs => ({ 'data-canvas-file': attrs.file, 'data-wiki-name': attrs.file.split('/').at(-1) }) },
      noteId: { default: null, parseHTML: element => element.getAttribute('data-wiki-id'), renderHTML: attrs => attrs.noteId ? { 'data-wiki-id': attrs.noteId } : {} },
    }
  },
  parseHTML() { return [{ tag: 'div[data-canvas-file]' }] },
  renderHTML({ node, HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'canvas-note-embed' }), `![[${node.attrs.file}]]`] },
  addNodeView() { return ReactNodeViewRenderer(EmbedView) },
  addInputRules() {
    return [nodeInputRule({ find: /!\[\[([^\]]+\.canvas)\]\]$/, type: this.type, getAttributes: match => {
      const file = match[1].trim(), target = resolveFile({ file }, this.options.getNotes())
      return { file, noteId: target?.id || null }
    } })]
  },
})

export function CanvasEmbedPicker({ editor, notes }) {
  const canvases = notes.filter(n => n.type === 'canvas')
  if (!canvases.length) return null
  return <select aria-label="Embed canvas" title="Embed canvas" value="" className="text-[11px] border border-slate-200 rounded px-1 py-0.5 max-w-36" onChange={e => {
    const note = canvases.find(n => n.id === e.target.value)
    if (note) editor.chain().focus().insertContent({ type: 'canvasEmbed', attrs: { file: notePath(note, notes), noteId: note.id } }).run()
  }}><option value="">Embed canvas…</option>{canvases.map(n => <option key={n.id} value={n.id}>{n.name}{n.sourceName ? ` (${n.sourceName})` : ''}</option>)}</select>
}
