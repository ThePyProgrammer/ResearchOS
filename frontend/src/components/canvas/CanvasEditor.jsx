import { useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Background, ConnectionMode, Controls, Handle, MarkerType, MiniMap, NodeResizer, Position, ReactFlow, ReactFlowProvider, SelectionMode, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { arrangeNodes, bounds, CANVAS_COLORS, canvasColor, canvasId, canvasName, containedNodes, downloadFile, duplicateSelection, exportCanvas, fileNode, notePath, parseCanvas, resolveFile, safeUrl } from '../../utils/jsonCanvas'
import { FilePreview, MarkdownCard } from './CanvasPreview'
import LinkedNoteDialog from './LinkedNoteDialog'
import { noteMarkdown } from '../../utils/noteMarkdown'
import './canvas.css'
import { useTheme } from '../../context/ThemeContext'

const SIDES = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }
const MAX_FILE_SIZE = 15 * 1024 * 1024
const editableTarget = target => target.closest('input, textarea, select, [contenteditable="true"]')
const preserveCardInteraction = event => {
  // Native controls and rendered Markdown/HTML links keep their own pointer
  // behavior. Ordinary preview content participates in the node drag instead.
  if (event.target.closest('a, button, input, textarea, select, audio, video, iframe, [contenteditable="true"]')) event.stopPropagation()
}

function CanvasCard({ id, data, selected }) {
  const { raw: node, notes, note, readOnly, patch, beginGesture, editing, setEditing, openFile } = data
  const color = canvasColor(node.color)
  const background = node.type === 'group' ? safeUrl(node.researchos?.backgroundData || node.background, true) : null
  return <div className={`canvas-card canvas-card-${node.type} ${selected ? 'is-selected' : ''}`} onMouseDownCapture={preserveCardInteraction} onTouchStartCapture={preserveCardInteraction} style={{
    borderColor: color, '--card-color': color,
    ...(background ? { backgroundImage: `url(${JSON.stringify(background)})`, backgroundSize: node.backgroundStyle === 'ratio' ? 'contain' : node.backgroundStyle === 'repeat' ? 'auto' : 'cover', backgroundRepeat: node.backgroundStyle === 'repeat' ? 'repeat' : 'no-repeat', backgroundPosition: 'center' } : {}),
  }}>
    <NodeResizer isVisible={selected && !readOnly} minWidth={120} minHeight={80} color={color} onResizeStart={() => data.beginResize(id)} onResizeEnd={data.endResize} keepAspectRatio={data.keepAspectRatio} />
    {Object.entries(SIDES).map(([side, position]) => <Handle key={side} id={side} type="source" position={position} isConnectable={!readOnly} aria-label={`Connect ${side}`} />)}
    <div className="canvas-card-title" onDoubleClick={() => { if (!readOnly) { beginGesture(); setEditing(id) } }}>
      <span>{node.type === 'text' ? 'Text' : node.type === 'file' ? resolveFile(node, notes, note.sourceKey)?.name || node.file : node.type === 'link' ? 'Web page' : node.label || 'Group'}</span>
      {node.type === 'file' && <button className="nodrag" onClick={() => openFile(node)} title="Open file">↗</button>}
      {node.type === 'link' && safeUrl(node.url) && <a className="nodrag" href={safeUrl(node.url)} target="_blank" rel="noopener noreferrer" title="Open web page">↗</a>}
    </div>
    {node.type !== 'group' && <div className={`canvas-card-content ${selected ? 'nowheel' : ''}`}>
      {node.type === 'text' && (editing === id && !readOnly
        ? <textarea aria-label="Card text" className="nodrag nowheel" autoFocus value={node.text} onChange={e => patch(id, { text: e.target.value }, false)} onBlur={() => setEditing(null)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null) } }} />
        : <div onDoubleClick={() => { if (!readOnly) { beginGesture(); setEditing(id) } }}><MarkdownCard text={node.text || '*Double-click to write…*'} /></div>)}
      {node.type === 'file' && <FilePreview node={node} notes={notes} sourceKey={note.sourceKey} visited={[note.id]} interactive={selected} />}
      {node.type === 'link' && (safeUrl(node.url) ? <><iframe className={selected ? 'nodrag nowheel' : 'canvas-inactive-frame'} title={node.url} src={safeUrl(node.url)} sandbox="allow-scripts" referrerPolicy="no-referrer" loading="lazy" /><small>Some sites block embedding. Use ↗ to open.</small></> : <p className="canvas-placeholder">Unsupported URL. Use an http or https address.</p>)}
    </div>}
  </div>
}
const nodeTypes = { canvas: CanvasCard }

function FilePicker({ notes, onPick, onClose }) {
  const [query, setQuery] = useState('')
  return <div className="canvas-modal-backdrop" onMouseDown={onClose}><div className="canvas-modal" role="dialog" aria-modal="true" aria-label="Add file or canvas" onMouseDown={e => e.stopPropagation()}>
    <header><strong>Add file or canvas</strong><button onClick={onClose} aria-label="Close file picker">×</button></header>
    <input autoFocus aria-label="Search files" placeholder="Search notes, canvases, or folders…" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="canvas-file-list">{notes.filter(n => `${n.name} ${n.sourceName || ''}`.toLowerCase().includes(query.toLowerCase())).map(n => <button key={n.id} onClick={() => onPick(n)}>
      <span>{n.type === 'folder' ? '▣' : n.type === 'canvas' ? '◫' : '▤'} {n.name}</span><small>{n.sourceName} / {notePath(n, notes)}{n.type === 'folder' ? ' (add contents)' : ''}</small>
    </button>)}{!notes.length && <p>No files in this notes directory yet. You can also import local files.</p>}</div>
  </div></div>
}

function CanvasEditorInner({ initial, note, notes, onChange, onOpen, onCreateNote, onSave, renderNoteEditor, onFileSaved }) {
  const { resolvedTheme } = useTheme()
  const [doc, setDoc] = useState(initial)
  const current = useRef(doc)
  const [selected, setSelected] = useState(new Set())
  const [selectedEdges, setSelectedEdges] = useState(new Set())
  const [editing, setEditing] = useState(null)
  const [editingFile, setEditingFile] = useState(null)
  const [picker, setPicker] = useState(null)
  const [readOnly, setReadOnly] = useState(false)
  const [snap, setSnap] = useState(true)
  const [snapObjects, setSnapObjects] = useState(false)
  const [keepAspectRatio, setKeepAspectRatio] = useState(false)
  const [showMap, setShowMap] = useState(true)
  const [help, setHelp] = useState(false)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState(null)
  const [search, setSearch] = useState('')
  const [, setHistoryVersion] = useState(0)
  const history = useRef({ undo: [], redo: [] })
  const gesture = useRef(null)
  const clipboard = useRef(null)
  const root = useRef(null)
  const importInput = useRef(null), mediaInput = useRef(null), backgroundInput = useRef(null)
  const mediaTarget = useRef(null)
  const reconnecting = useRef(false)
  const flow = useReactFlow()

  function checkpoint() {
    history.current.undo.push(current.current)
    if (history.current.undo.length > 100) history.current.undo.shift()
    history.current.redo = []
    setHistoryVersion(v => v + 1)
  }
  function commit(next, remember = true) {
    if (readOnly) return
    const value = typeof next === 'function' ? next(current.current) : next
    if (value === current.current) return
    if (remember) checkpoint()
    current.current = value; setDoc(value)
    // Dragging/resizing can produce dozens of updates per second. Serialize
    // media-heavy documents only after the gesture finishes.
    if (!gesture.current) onChange(JSON.stringify(value))
  }
  function undo(redo = false) {
    if (readOnly) return
    const from = redo ? history.current.redo : history.current.undo
    const to = redo ? history.current.undo : history.current.redo
    if (!from.length) return
    to.push(current.current); commit(from.pop(), false); setHistoryVersion(v => v + 1)
  }
  function patch(id, updates, remember = true) {
    commit(d => ({ ...d, nodes: d.nodes.map(n => n.id === id ? { ...n, ...updates } : n) }), remember)
  }
  function patchEdge(id, updates, remember = true) {
    commit(d => ({ ...d, edges: d.edges.map(e => e.id === id ? { ...e, ...updates } : e) }), remember)
  }
  function center() {
    const rect = root.current.getBoundingClientRect()
    return flow.screenToFlowPosition({ x: rect.x + rect.width / 2 - 160, y: rect.y + rect.height / 2 - 100 })
  }
  function add(type, extra = {}, position = center()) {
    if (readOnly) return
    const node = { id: canvasId(), type, x: Math.round(position.x), y: Math.round(position.y), width: type === 'group' ? 600 : 320, height: type === 'group' ? 400 : 240, ...(type === 'text' ? { text: '' } : type === 'group' ? { label: 'Group' } : {}), ...extra }
    commit(d => ({ ...d, nodes: type === 'group' ? [node, ...d.nodes] : [...d.nodes, node] }))
    setSelected(new Set([node.id])); setSelectedEdges(new Set()); setMenu(null)
    if (type === 'text') setEditing(node.id)
    return node
  }
  function addWeb(position) {
    const url = window.prompt('Web page URL', 'https://')
    if (!url) return
    if (!safeUrl(url)) { setError('Use an http or https URL.'); return }
    add('link', { url }, position)
  }
  function remove() {
    commit(d => ({ ...d, nodes: d.nodes.filter(n => !selected.has(n.id)), edges: d.edges.filter(e => !selectedEdges.has(e.id) && !selected.has(e.fromNode) && !selected.has(e.toNode)) }))
    setSelected(new Set()); setSelectedEdges(new Set()); setEditing(null)
  }
  function duplicate() {
    const next = duplicateSelection(current.current, selected)
    setSelected(new Set(next.nodes.slice(current.current.nodes.length).map(n => n.id)))
    commit(next)
  }
  function groupSelection() {
    const nodes = doc.nodes.filter(n => selected.has(n.id)), box = bounds(nodes)
    add('group', { x: box.x - 30, y: box.y - 60, width: box.width + 60, height: box.height + 90 })
  }
  function colorSelection(color) {
    commit(d => ({ ...d, nodes: d.nodes.map(n => selected.has(n.id) ? { ...n, color } : n), edges: d.edges.map(e => selectedEdges.has(e.id) ? { ...e, color } : e) }))
  }
  function pickFile(file) {
    if (picker?.swap) { patch(picker.swap, { ...fileNode(file, notes), subpath: undefined }); setPicker(null); return }
    const position = picker?.position || center()
    const files = file.type === 'folder' ? (() => {
      const folders = new Set([file.id]); let changed = true
      while (changed) { changed = false; notes.forEach(n => { if (n.type === 'folder' && folders.has(n.parentId) && !folders.has(n.id)) { folders.add(n.id); changed = true } }) }
      return notes.filter(n => n.type !== 'folder' && folders.has(n.parentId))
    })() : [file]
    const newNodes = files.map((n, i) => ({ id: canvasId(), type: 'file', ...fileNode(n, notes), x: Math.round(position.x + (i % 3) * 360), y: Math.round(position.y + Math.floor(i / 3) * 280), width: 320, height: 240 }))
    commit(d => ({ ...d, nodes: [...d.nodes, ...newNodes] })); setSelected(new Set(newNodes.map(n => n.id))); setPicker(null)
  }
  function openFile(node) {
    const target = resolveFile(node, notes, note.sourceKey)
    if (target) onOpen?.(target)
    else if (safeUrl(node.researchos?.mediaData || node.file, true)) {
      const a = document.createElement('a'); a.href = safeUrl(node.researchos?.mediaData || node.file, true); a.download = node.file; a.click()
    } else setError('File not found. Select the card and use Swap file to relink it.')
  }

  const flowNodes = useMemo(() => doc.nodes.map((n, index) => ({
    id: n.id, type: 'canvas', position: { x: n.x, y: n.y }, width: n.width, height: n.height,
    style: { width: n.width, height: n.height }, zIndex: index,
    selected: selected.has(n.id), dragHandle: n.type === 'group' ? '.canvas-card-title' : undefined,
    data: { raw: n, notes, note, readOnly, patch, beginGesture: checkpoint, editing, setEditing, openFile, keepAspectRatio,
      beginResize: id => { checkpoint(); gesture.current = { id, children: [], resize: true } },
      endResize: () => { gesture.current = null; onChange(JSON.stringify(current.current)) },
    },
  })), [doc, selected, notes, note, readOnly, editing, keepAspectRatio])
  const flowEdges = useMemo(() => doc.edges.map(e => ({
    id: e.id, source: e.fromNode, target: e.toNode, sourceHandle: e.fromSide || 'right', targetHandle: e.toSide || 'left',
    selected: selectedEdges.has(e.id), label: e.label, style: { stroke: canvasColor(e.color), strokeWidth: selectedEdges.has(e.id) ? 3 : 2 },
    markerStart: e.fromEnd === 'arrow' ? { type: MarkerType.ArrowClosed, color: canvasColor(e.color), orient: 'auto-start-reverse' } : undefined,
    markerEnd: e.toEnd !== 'none' ? { type: MarkerType.ArrowClosed, color: canvasColor(e.color) } : undefined,
    reconnectable: !readOnly,
  })), [doc.edges, selectedEdges, readOnly])

  function nodesChange(changes) {
    const selections = changes.filter(c => c.type === 'select')
    if (selections.length) setSelected(prev => { const next = new Set(prev); selections.forEach(c => c.selected ? next.add(c.id) : next.delete(c.id)); return next })
    const edits = changes.filter(c => c.type === 'position' && c.position || c.type === 'dimensions' && c.resizing)
    if (!edits.length || readOnly) return
    commit(d => {
      const updates = new Map()
      for (const change of edits) {
        const node = d.nodes.find(n => n.id === change.id)
        if (!node) continue
        if (change.type === 'position') {
          const x = Math.round(change.position.x), y = Math.round(change.position.y)
          updates.set(node.id, { ...updates.get(node.id), x, y })
          if (gesture.current?.id === node.id && node.type === 'group') for (const childId of gesture.current.children) {
            if (edits.some(c => c.id === childId && c.type === 'position')) continue
            const child = d.nodes.find(n => n.id === childId)
            if (child) updates.set(child.id, { x: child.x + x - node.x, y: child.y + y - node.y })
          }
        } else updates.set(node.id, { ...updates.get(node.id), width: Math.round(change.dimensions.width), height: Math.round(change.dimensions.height) })
      }
      return { ...d, nodes: d.nodes.map(n => updates.has(n.id) ? { ...n, ...updates.get(n.id) } : n) }
    }, false)
  }
  function dragStart(event, flowNode) {
    checkpoint()
    const node = current.current.nodes.find(n => n.id === flowNode.id)
    gesture.current = { id: node.id, children: node.type === 'group' ? containedNodes(node, current.current.nodes).map(n => n.id) : [] }
    if (event.altKey) {
      // Leave a copy at the original location while the originals move.
      commit(duplicateSelection(current.current, selected.size ? selected : new Set([node.id]), 0), false)
    }
  }
  function dragStop() {
    if (snapObjects && gesture.current) {
      const node = current.current.nodes.find(n => n.id === gesture.current.id)
      const others = current.current.nodes.filter(n => n.id !== node.id && !gesture.current.children.includes(n.id) && !selected.has(n.id))
      const x = others.map(n => n.x).find(x => Math.abs(x - node.x) < 12)
      const y = others.map(n => n.y).find(y => Math.abs(y - node.y) < 12)
      if (x !== undefined || y !== undefined) {
        const dx = (x ?? node.x) - node.x, dy = (y ?? node.y) - node.y
        const moving = new Set([node.id, ...gesture.current.children, ...selected])
        commit(d => ({ ...d, nodes: d.nodes.map(n => moving.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n) }), false)
      }
    }
    gesture.current = null
    onChange(JSON.stringify(current.current))
  }
  function connect(connection) {
    commit(d => ({ ...d, edges: [...d.edges, { id: canvasId(), fromNode: connection.source, fromSide: connection.sourceHandle || 'right', toNode: connection.target, toSide: connection.targetHandle || 'left' }] }))
  }
  function connectEnd(event, state) {
    if (readOnly || reconnecting.current || state.isValid || !state.fromNode || state.toNode) return
    const pointer = event.changedTouches?.[0] || event
    const position = flow.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY })
    checkpoint()
    const id = canvasId(), n = { id, type: 'text', x: Math.round(position.x), y: Math.round(position.y), width: 320, height: 240, text: '' }
    commit(d => ({ ...d, nodes: [...d.nodes, n], edges: [...d.edges, { id: canvasId(), fromNode: state.fromNode.id, fromSide: state.fromHandle?.id || 'right', toNode: id, toSide: 'left' }] }), false)
    setSelected(new Set([id])); setEditing(id)
  }

  async function importCanvas(file) {
    if (!file) return
    try {
      if (file.size > MAX_FILE_SIZE * 4) throw new Error('Canvas import is limited to 60 MB.')
      const imported = parseCanvas(await file.text())
      if (doc.nodes.length && !window.confirm('Replace this canvas with the imported document? You can undo this.')) return
      commit(imported); setSelected(new Set()); setSelectedEdges(new Set()); setError('')
      setTimeout(() => flow.fitView({ padding: 0.15 }), 100)
    } catch (err) { setError(err.message) }
  }
  async function importFiles(files, position = center(), backgroundFor, replaceFile) {
    try {
      const additions = []
      for (const [i, file] of (replaceFile ? [...files].slice(0, 1) : [...files]).entries()) {
        if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} exceeds the 15 MB attachment limit.`)
        const base = { id: canvasId(), type: 'file', file: file.name, x: Math.round(position.x + i * 40), y: Math.round(position.y + i * 40), width: 360, height: 280 }
        if (backgroundFor || /^(image|audio|video)\//.test(file.type) || file.type === 'application/pdf') {
          if (backgroundFor && !/^image\//.test(file.type)) throw new Error('Choose an image for the group background.')
          const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
          if (!safeUrl(data, true)) throw new Error('Unsupported media type. Use PNG, JPEG, GIF, WebP, AVIF, audio, video, or PDF.')
          if (backgroundFor) { patch(backgroundFor, { background: file.name, researchos: { ...doc.nodes.find(n => n.id === backgroundFor)?.researchos, backgroundData: data } }); return }
          additions.push({ ...base, researchos: { mediaData: data } })
        } else if (/\.canvas$/i.test(file.name)) {
          const content = JSON.stringify(parseCanvas(await file.text()))
          if (!onCreateNote) throw new Error('Create a canvas in the directory first, then add it with File / canvas.')
          const created = await onCreateNote({ name: file.name, type: 'canvas', content })
          additions.push({ ...base, ...fileNode(created, notes) })
        } else {
          const content = await file.text()
          additions.push({ ...base, researchos: { textContent: content } })
        }
      }
      if (replaceFile && additions.length) {
        patch(replaceFile, { file: additions[0].file, researchos: additions[0].researchos, subpath: undefined })
      } else commit(d => ({ ...d, nodes: [...d.nodes, ...additions] }))
      setError('')
    } catch (err) { setError(err.message || 'Could not read file.') }
  }
  async function exportBundle() {
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip(), seen = new Set(), paths = new Map()
      const safePath = path => path.replaceAll('\\', '/').split('/').filter(p => p && p !== '.' && p !== '..').join('/') || 'file'
      function reserve(path, identity) {
        path = safePath(path)
        const existing = paths.get(path)
        if (existing && existing !== identity) throw new Error(`Two files export to ${path}. Rename one before exporting a bundle.`)
        paths.set(path, identity); return path
      }
      function pack(canvas, canvasNote) {
        const value = JSON.parse(exportCanvas(canvas, notes, canvasNote.sourceKey))
        for (const node of value.nodes) {
          if (node.type === 'group' && node.researchos?.backgroundData) {
            const path = reserve(node.background, node.researchos.backgroundData)
            zip.file(path, node.researchos.backgroundData.split(',')[1], { base64: true })
            delete node.researchos.backgroundData; node.background = path
          }
          if (node.type !== 'file') continue
          const linked = resolveFile(node, notes, canvasNote.sourceKey)
          if (linked) {
            node.file = reserve(notePath(linked, notes), linked.id)
            if (!seen.has(linked.id)) {
              seen.add(linked.id)
              if (linked.type === 'canvas') zip.file(node.file, pack(parseCanvas(linked.content), linked))
              else zip.file(node.file, noteMarkdown(linked.content))
            }
          } else if (node.researchos?.mediaData) {
            node.file = reserve(node.file, node.researchos.mediaData)
            zip.file(node.file, node.researchos.mediaData.split(',')[1], { base64: true }); delete node.researchos.mediaData
          } else if (node.researchos?.textContent !== undefined) {
            node.file = reserve(node.file, node.researchos.textContent)
            zip.file(node.file, node.researchos.textContent); delete node.researchos.textContent
          }
          if (node.researchos) delete node.researchos.noteId
        }
        return JSON.stringify(value, null, 2)
      }
      seen.add(note.id)
      const path = reserve(notePath(note, notes), note.id)
      zip.file(path, pack(current.current, note))
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadFile(blob, `${note.name.replace(/\.canvas$/i, '')}.zip`, 'application/zip')
    } catch (err) { setError(err.message) }
  }
  async function exportImage(viewportOnly = false, privacy = false, scale = 2) {
    try {
      const viewport = root.current.querySelector('.react-flow__viewport'), box = bounds(doc.nodes)
      if (!doc.nodes.length) throw new Error('Add a card before exporting an image.')
      const width = Math.ceil(viewportOnly ? root.current.clientWidth : box.width + 80), height = Math.ceil(viewportOnly ? root.current.clientHeight : box.height + 80)
      if (width * height * scale * scale > 64_000_000) throw new Error('This canvas is too large for a PNG. Export the viewport or use a lower scale.')
      const url = await toPng(viewport, { backgroundColor: getComputedStyle(root.current.querySelector('.canvas-flow')).backgroundColor, width, height, pixelRatio: scale,
        style: viewportOnly ? {} : { width: `${width}px`, height: `${height}px`, transform: `translate(${-box.x + 40}px, ${-box.y + 40}px) scale(1)` },
        filter: element => !element.classList?.contains('react-flow__handle') && !element.classList?.contains('react-flow__resize-control') && !(privacy && (element.classList?.contains('canvas-card-content') || element.classList?.contains('canvas-card-title') || element.classList?.contains('react-flow__edge-textwrapper'))),
      })
      const a = document.createElement('a'); a.href = url; a.download = `${note.name.replace(/\.canvas$/i, '')}.png`; a.click()
    } catch (err) { setError(`Image export failed: ${err.message}. Embedded web pages and remote media may not be captured.`) }
  }
  function keyDown(e) {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); onSave?.(); return }
    if (editableTarget(e.target)) return
    if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); flow.fitView({ padding: 0.15 }); return }
    if (e.shiftKey && e.code === 'Digit2') { e.preventDefault(); flow.fitView({ nodes: [...selected].map(id => ({ id })), padding: 0.2 }); return }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(doc.nodes.map(n => n.id))); return }
    if (e.key === 'Escape') { setEditing(null); setMenu(null); setSelected(new Set()); setSelectedEdges(new Set()); return }
    if (readOnly) return
    if (mod && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); undo(e.key.toLowerCase() === 'y' || e.shiftKey); return }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return }
    if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault(); clipboard.current = { nodes: doc.nodes.filter(n => selected.has(n.id)), edges: doc.edges.filter(edge => selected.has(edge.fromNode) && selected.has(edge.toNode)) }; return
    }
    if (mod && e.key.toLowerCase() === 'v' && clipboard.current) {
      e.preventDefault(); const cloned = duplicateSelection(clipboard.current, new Set(clipboard.current.nodes.map(n => n.id)))
      const nodes = cloned.nodes.slice(clipboard.current.nodes.length), edges = cloned.edges.slice(clipboard.current.edges.length)
      commit(d => ({ ...d, nodes: [...d.nodes, ...nodes], edges: [...d.edges, ...edges] })); setSelected(new Set(nodes.map(n => n.id))); return
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); const step = e.shiftKey ? 40 : snap ? 20 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      const moving = new Set(selected)
      doc.nodes.filter(n => selected.has(n.id) && n.type === 'group').forEach(n => containedNodes(n, doc.nodes).forEach(child => moving.add(child.id)))
      commit(d => ({ ...d, nodes: d.nodes.map(n => moving.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n) }))
    }
  }
  const selectedNode = doc.nodes.find(n => selected.has(n.id)), selectedEdge = doc.edges.find(e => selectedEdges.has(e.id))
  const textField = (label, value, update) => <label>{label}<input aria-label={label} value={value || ''} onFocus={checkpoint} onChange={e => update(e.target.value)} disabled={readOnly} /></label>

  return <div className="canvas-editor" ref={root} tabIndex={0} onKeyDown={keyDown} onPointerDown={e => { if (!editableTarget(e.target) && !e.target.closest('button,a')) root.current.focus({ preventScroll: true }) }}>
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <button disabled={readOnly} onClick={() => add('text')}>＋ Text</button>
      <button disabled={readOnly} onClick={() => setPicker({})}>File / canvas</button>
      <button disabled={readOnly} onClick={() => { mediaTarget.current = null; mediaInput.current.click() }}>Media</button>
      <button disabled={readOnly} onClick={() => addWeb()}>Web page</button>
      <button disabled={readOnly} onClick={() => selected.size ? groupSelection() : add('group')}>Group</button>
      <span className="canvas-toolbar-divider" />
      <button aria-label="Undo" disabled={readOnly || !history.current.undo.length} onClick={() => undo()}>↶</button>
      <button aria-label="Redo" disabled={readOnly || !history.current.redo.length} onClick={() => undo(true)}>↷</button>
      <button disabled={readOnly} onClick={() => importInput.current.click()}>Import .canvas</button>
      <details><summary>Export</summary><div className="canvas-menu">
        <button onClick={() => downloadFile(exportCanvas(doc, notes, note.sourceKey), canvasName(note.name))}>Download .canvas</button>
        <button onClick={exportBundle}>Canvas + files (.zip)</button>
        <button onClick={() => exportImage()}>Full canvas PNG (2×)</button>
        <button onClick={() => exportImage(false, false, 1)}>Full canvas PNG (1×)</button>
        <button onClick={() => exportImage(true)}>Viewport PNG</button>
        <button onClick={() => exportImage(false, true)}>Privacy PNG (hide text)</button>
      </div></details>
      <details><summary>Settings</summary><div className="canvas-menu">
        <label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap to grid</label>
        <label><input type="checkbox" checked={snapObjects} onChange={e => setSnapObjects(e.target.checked)} /> Snap to objects</label>
        <label><input type="checkbox" checked={keepAspectRatio} onChange={e => setKeepAspectRatio(e.target.checked)} /> Keep resize aspect ratio</label>
        <label><input type="checkbox" checked={showMap} onChange={e => setShowMap(e.target.checked)} /> Minimap</label>
        <label><input type="checkbox" checked={readOnly} onChange={e => { setReadOnly(e.target.checked); setEditing(null) }} /> Read-only</label>
      </div></details>
      <button onClick={() => setHelp(v => !v)} aria-label="Canvas help">?</button>
    </div>
    {error && <div role="alert" className="canvas-error">{error}<button onClick={() => setError('')} aria-label="Dismiss canvas error">×</button></div>}
    {help && <div className="canvas-help">Double-click blank space to add text. Drag cards or group headers to move; drag edge dots to connect. Drag on blank space to select, Shift-click to select several. Space-drag / middle-drag to pan; wheel to pan, Ctrl/⌘-wheel or pinch to zoom. Shift+1 fits all; Shift+2 fits selection. Ctrl/⌘+Z undo, +Y redo, +D duplicate, +C/+V copy/paste cards. Delete removes selection. Arrow keys move selected cards; Shift moves farther. Drop notes, folders, URLs, or local files onto the canvas.</div>}
    <div className="canvas-workspace">
      <div className="canvas-flow" onDragOver={e => { if (!readOnly) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }} onDrop={e => {
        e.preventDefault(); e.stopPropagation(); if (readOnly) return
        const position = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        if (e.dataTransfer.files.length) { importFiles(e.dataTransfer.files, position); return }
        const text = e.dataTransfer.getData('text/plain'), file = notes.find(n => n.id === text)
        if (file) {
          // pickFile reads picker state; use direct positioned additions for drops.
          const descendants = new Set([file.id]); let size
          do { size = descendants.size; notes.forEach(n => { if (descendants.has(n.parentId)) descendants.add(n.id) }) } while (size !== descendants.size)
          const files = file.type === 'folder' ? notes.filter(n => descendants.has(n.id) && n.type !== 'folder') : [file]
          commit(d => ({ ...d, nodes: [...d.nodes, ...files.map((n, i) => ({ id: canvasId(), type: 'file', ...fileNode(n, notes), x: Math.round(position.x + i * 40), y: Math.round(position.y + i * 40), width: 320, height: 240 }))] }))
        } else if (safeUrl(text)) add('link', { url: text }, position)
        else if (text) add('text', { text }, position)
      }}>
        <ReactFlow colorMode={resolvedTheme} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onNodesChange={nodesChange}
          onEdgesChange={changes => setSelectedEdges(prev => { const next = new Set(prev); changes.filter(c => c.type === 'select').forEach(c => c.selected ? next.add(c.id) : next.delete(c.id)); return next })}
          onConnect={connect} onConnectEnd={connectEnd} onNodeDragStart={dragStart} onNodeDragStop={dragStop}
          onReconnectStart={() => { reconnecting.current = { success: false } }} onReconnect={(old, connection) => { reconnecting.current.success = true; patchEdge(old.id, { fromNode: connection.source, toNode: connection.target, fromSide: connection.sourceHandle, toSide: connection.targetHandle }) }}
          onReconnectEnd={(_, edge) => { if (reconnecting.current && !reconnecting.current.success) commit(d => ({ ...d, edges: d.edges.filter(e => e.id !== edge.id) })); reconnecting.current = false }}
          onNodeDoubleClick={(_, node) => { if (node.data.raw.type === 'file') { const file = resolveFile(node.data.raw, notes, note.sourceKey); if (!readOnly && file?.type === 'file' && renderNoteEditor) setEditingFile(file); else openFile(node.data.raw) } else if (!readOnly) { checkpoint(); setEditing(node.id) } }}
          onEdgeDoubleClick={(_, edge) => { if (readOnly) return; const label = window.prompt('Connection label', edge.label || ''); if (label !== null) patchEdge(edge.id, { label }) }}
          onPaneClick={() => setMenu(null)}
          onPaneContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX - root.current.getBoundingClientRect().x, y: e.clientY - root.current.getBoundingClientRect().y, position: flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }) }) }}
          onDoubleClick={e => { if (e.target.classList.contains('react-flow__pane') && !readOnly) add('text', {}, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })) }}
          connectionMode={ConnectionMode.Loose} nodesDraggable={!readOnly} nodesConnectable={!readOnly} edgesReconnectable={!readOnly}
          deleteKeyCode={null} selectionOnDrag selectionMode={SelectionMode.Partial} multiSelectionKeyCode="Shift" panOnDrag={[1, 2]} panActivationKeyCode="Space" panOnScroll zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false}
          snapToGrid={snap} snapGrid={[20, 20]} minZoom={0.05} maxZoom={4} fitView fitViewOptions={{ padding: 0.15 }} elevateNodesOnSelect={false} proOptions={{ hideAttribution: false }}>
          <Background gap={20} size={1} color="rgb(var(--line-slate-300))" />
          <Controls showInteractive={false} />
          {showMap && <MiniMap style={{ width: 120, height: 80 }} pannable zoomable nodeColor={n => canvasColor(n.data.raw.color)} />}
        </ReactFlow>
        {!doc.nodes.length && <div className="canvas-empty"><strong>A canvas for your research</strong><p>Add a thought, connect notes, or drop files here.</p><button disabled={readOnly} onClick={() => add('text')}>Add your first card</button></div>}
      </div>
      {(selectedNode || selectedEdge) && <aside className="canvas-inspector" aria-label="Canvas selection">
        <strong>{selected.size + selectedEdges.size} selected</strong>
        <div className="canvas-colors">{Object.entries(CANVAS_COLORS).map(([key, color]) => <button key={key} aria-label={`Color ${key}`} disabled={readOnly} style={{ background: color }} onClick={() => colorSelection(key)} />)}<input aria-label="Custom color" type="color" disabled={readOnly} value={canvasColor(selectedNode?.color || selectedEdge?.color)} onChange={e => colorSelection(e.target.value)} /></div>
        <button disabled={readOnly} onClick={remove}>Remove selection</button>
        {!!selected.size && <><button disabled={readOnly} onClick={duplicate}>Duplicate</button><button onClick={() => flow.fitView({ nodes: [...selected].map(id => ({ id })), padding: 0.2 })}>Zoom to selection</button>
          <button disabled={readOnly} onClick={() => commit(d => ({ ...d, nodes: [...d.nodes.filter(n => !selected.has(n.id)), ...d.nodes.filter(n => selected.has(n.id))] }))}>Bring to front</button>
          <button disabled={readOnly} onClick={() => commit(d => ({ ...d, nodes: [...d.nodes.filter(n => selected.has(n.id)), ...d.nodes.filter(n => !selected.has(n.id))] }))}>Send to back</button></>}
        {selected.size > 1 && <><button disabled={readOnly} onClick={groupSelection}>Group selection</button><select aria-label="Arrange cards" disabled={readOnly} value="" onChange={e => commit(d => ({ ...d, nodes: arrangeNodes(d.nodes, selected, e.target.value) }))}><option value="">Align / arrange…</option>{['left', 'center', 'right', 'top', 'middle', 'bottom', 'row', 'column', 'grid', 'distribute-horizontal', 'distribute-vertical', 'justify-horizontal', 'justify-vertical'].map(mode => <option key={mode} value={mode}>{mode.replaceAll('-', ' ')}</option>)}</select></>}
        {selected.size === 1 && selectedNode && <>
          {['x', 'y', 'width', 'height'].map(key => <label key={key}>{key}<input aria-label={`Card ${key}`} type="number" disabled={readOnly} value={selectedNode[key]} onFocus={checkpoint} onChange={e => { const value = Number(e.target.value); if (Number.isSafeInteger(value) && (!['width', 'height'].includes(key) || value > 0)) patch(selectedNode.id, { [key]: value }, false) }} /></label>)}
          {selectedNode.type === 'text' && <><button disabled={readOnly} onClick={() => { checkpoint(); setEditing(selectedNode.id) }}>Edit text</button>{onCreateNote && <button disabled={readOnly} onClick={async () => {
            const name = window.prompt('New note name', 'Untitled'); if (!name?.trim()) return
            try { const created = await onCreateNote({ name: name.trim(), type: 'file', content: renderToStaticMarkup(<MarkdownCard text={selectedNode.text} />) }); const { text, ...rest } = selectedNode; commit(d => ({ ...d, nodes: d.nodes.map(n => n.id === selectedNode.id ? { ...rest, type: 'file', ...fileNode(created, notes) } : n) })) } catch (err) { setError(err.message) }
          }}>Convert to note</button>}</>}
          {selectedNode.type === 'group' && <>
            {textField('Group label', selectedNode.label, label => patch(selectedNode.id, { label }, false))}
            <button disabled={readOnly} onClick={() => backgroundInput.current.click()}>Set background image</button>
            {textField('Background image URL / path', selectedNode.background, background => patch(selectedNode.id, { background, researchos: { ...selectedNode.researchos, backgroundData: undefined } }, false))}
            <select aria-label="Background style" disabled={readOnly} value={selectedNode.backgroundStyle || 'cover'} onChange={e => patch(selectedNode.id, { backgroundStyle: e.target.value })}><option value="cover">Cover</option><option value="ratio">Keep aspect ratio</option><option value="repeat">Repeat</option></select>
            <button disabled={readOnly} onClick={() => patch(selectedNode.id, { background: undefined, researchos: { ...selectedNode.researchos, backgroundData: undefined } })}>Remove background</button>
          </>}
          {selectedNode.type === 'file' && <>
            <button onClick={() => openFile(selectedNode)}>Open file</button><button disabled={readOnly} onClick={() => setPicker({ swap: selectedNode.id })}>Swap file</button>
            <button disabled={readOnly} onClick={() => { mediaTarget.current = selectedNode.id; mediaInput.current.click() }}>Replace with local file</button>
            {renderNoteEditor && resolveFile(selectedNode, notes, note.sourceKey)?.type === 'file' && <button disabled={readOnly} onClick={() => setEditingFile(resolveFile(selectedNode, notes, note.sourceKey))}>Edit linked note</button>}
            {textField('Heading / block', selectedNode.subpath, subpath => patch(selectedNode.id, { subpath: subpath ? (subpath.startsWith('#') ? subpath : `#${subpath}`) : undefined }, false))}
          </>}
          {selectedNode.type === 'link' && <>{textField('Web URL', selectedNode.url, url => patch(selectedNode.id, { url }, false))}<button onClick={() => navigator.clipboard?.writeText(selectedNode.url).catch(() => setError('Clipboard is unavailable.'))}>Copy URL</button><button onClick={() => { const iframe = root.current.querySelector(`[data-id="${CSS.escape(selectedNode.id)}"] iframe`); if (iframe) iframe.src = iframe.src }}>Reload page</button></>}
        </>}
        {selectedEdge && <>
          {textField('Connection label', selectedEdge.label, label => patchEdge(selectedEdge.id, { label }, false))}
          {['from', 'to'].map(end => <div key={end}>
            <label>{end === 'from' ? 'From card' : 'To card'}<select aria-label={`${end} card`} disabled={readOnly} value={selectedEdge[`${end}Node`]} onChange={e => patchEdge(selectedEdge.id, { [`${end}Node`]: e.target.value })}>{doc.nodes.map(n => <option key={n.id} value={n.id}>{n.text?.slice(0, 30) || n.label || n.file || n.url || n.id}</option>)}</select></label>
            <label>Side<select aria-label={`${end} side`} disabled={readOnly} value={selectedEdge[`${end}Side`] || (end === 'from' ? 'right' : 'left')} onChange={e => patchEdge(selectedEdge.id, { [`${end}Side`]: e.target.value })}>{Object.keys(SIDES).map(side => <option key={side}>{side}</option>)}</select></label>
            <label>Endpoint<select aria-label={`${end} endpoint`} disabled={readOnly} value={selectedEdge[`${end}End`] || (end === 'from' ? 'none' : 'arrow')} onChange={e => patchEdge(selectedEdge.id, { [`${end}End`]: e.target.value })}><option>none</option><option>arrow</option></select></label>
            <button onClick={() => flow.fitView({ nodes: [{ id: selectedEdge[`${end}Node`] }], padding: 0.5 })}>Follow {end === 'from' ? 'start' : 'end'}</button>
          </div>)}
        </>}
      </aside>}
    </div>
    <div className="canvas-status"><span>{doc.nodes.length} cards · {doc.edges.length} connections{readOnly ? ' · Read-only' : ''}</span><input aria-label="Find card" placeholder="Find card…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const found = doc.nodes.filter(n => `${n.text || ''} ${n.label || ''} ${n.file || ''} ${n.url || ''}`.toLowerCase().includes(search.toLowerCase())); flow.fitView({ nodes: found.map(n => ({ id: n.id })), padding: 0.2 }); setSelected(new Set(found.map(n => n.id))) } }} /><select aria-label="Jump to group" value="" onChange={e => flow.fitView({ nodes: [{ id: e.target.value }], padding: 0.2 })}><option value="">Jump to group…</option>{doc.nodes.filter(n => n.type === 'group').map(n => <option key={n.id} value={n.id}>{n.label || 'Group'}</option>)}</select><button onClick={() => flow.setViewport({ ...flow.getViewport(), zoom: 1 })}>100%</button><button onClick={() => flow.fitView({ padding: 0.15 })}>Fit all</button></div>
    {menu && !readOnly && <div className="canvas-context-menu" style={{ left: Math.min(menu.x, root.current.clientWidth - 180), top: Math.min(menu.y, root.current.clientHeight - 180) }}><button onClick={() => add('text', {}, menu.position)}>Add text card</button><button onClick={() => { setPicker({ position: menu.position }); setMenu(null) }}>Add file / canvas</button><button onClick={() => { addWeb(menu.position); setMenu(null) }}>Add web page</button><button onClick={() => add('group', {}, menu.position)}>Create group</button></div>}
    {picker && <FilePicker notes={picker.swap ? notes.filter(n => n.type !== 'folder') : notes} onPick={pickFile} onClose={() => setPicker(null)} />}
    {editingFile && <LinkedNoteDialog key={editingFile.id} note={editingFile} renderEditor={renderNoteEditor} onSaved={onFileSaved} onClose={() => setEditingFile(null)} />}
    <input ref={importInput} type="file" accept=".canvas,.json" hidden aria-label="Import canvas file" onChange={e => { importCanvas(e.target.files[0]); e.target.value = '' }} />
    <input ref={mediaInput} type="file" multiple hidden aria-label="Import media files" onChange={e => { const target = mediaTarget.current; mediaTarget.current = null; importFiles(e.target.files, center(), undefined, target); e.target.value = '' }} />
    <input ref={backgroundInput} type="file" accept="image/*" hidden aria-label="Group background file" onChange={e => { importFiles(e.target.files, center(), selectedNode.id); e.target.value = '' }} />
  </div>
}

export default function CanvasEditor(props) {
  const [parsed] = useState(() => { try { return { doc: parseCanvas(props.initialContent) } } catch (err) { return { error: err.message } } })
  if (parsed.error) return <div className="canvas-error" role="alert"><p>This canvas could not be opened: {parsed.error} The original content has been preserved.</p><button onClick={() => downloadFile(props.initialContent, canvasName(props.note.name))}>Download original content</button></div>
  return <ReactFlowProvider><CanvasEditorInner {...props} initial={parsed.doc} /></ReactFlowProvider>
}
