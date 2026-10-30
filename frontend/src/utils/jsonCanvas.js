export const EMPTY_CANVAS = '{"nodes":[],"edges":[]}'
export const CANVAS_COLORS = { '1': '#dc4c4c', '2': '#df8b36', '3': '#b89b21', '4': '#42995a', '5': '#329ba5', '6': '#9762c7' }
export const canvasColor = color => CANVAS_COLORS[color] || (/^#[\da-f]{6}$/i.test(color || '') ? color : '#94a3b8')
export const canvasId = () => crypto.randomUUID().replaceAll('-', '')
export const canvasName = name => name.toLowerCase().endsWith('.canvas') ? name : `${name}.canvas`

// Never round-trip through a graph library's schema: extensions and optional
// JSON Canvas fields must survive import, editing, and export unchanged.
export function parseCanvas(content) {
  let doc
  try { doc = typeof content === 'string' ? JSON.parse(content || EMPTY_CANVAS) : structuredClone(content) }
  catch { throw new Error('Canvas content must be valid JSON.') }
  const fail = message => { throw new Error(message) }
  if (!doc || Array.isArray(doc) || typeof doc !== 'object') fail('Canvas must be a JSON object.')
  const nodes = doc.nodes ?? [], edges = doc.edges ?? []
  if (!Array.isArray(nodes) || !Array.isArray(edges) || doc.nodes === null || doc.edges === null) fail('Nodes and edges must be arrays.')
  const ids = new Set()
  function identity(item) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) fail('Every canvas element needs a unique ID.')
    ids.add(item.id)
    if (item.color !== undefined && (typeof item.color !== 'string' || !/^([1-6]|#[\da-f]{6})$/i.test(item.color))) fail('Invalid canvas color.')
  }
  function string(item, key, required = false) {
    if ((required || key in item) && typeof item[key] !== 'string') fail(`${key} must be a string.`)
  }
  for (const n of nodes) {
    identity(n)
    if (!['text', 'file', 'link', 'group'].includes(n.type)) fail('Unknown canvas node type.')
    for (const key of ['x', 'y', 'width', 'height']) {
      if (!Number.isSafeInteger(n[key]) || (['width', 'height'].includes(key) && n[key] <= 0)) fail(`Invalid node ${key}.`)
    }
    if (n.type === 'text') string(n, 'text', true)
    if (n.type === 'link') string(n, 'url', true)
    if (n.type === 'file') {
      string(n, 'file', true); string(n, 'subpath')
      if (n.subpath !== undefined && !n.subpath.startsWith('#')) fail('File subpaths must start with #.')
    }
    if (n.type === 'group') {
      string(n, 'label'); string(n, 'background')
      if (n.backgroundStyle !== undefined && !['cover', 'ratio', 'repeat'].includes(n.backgroundStyle)) fail('Invalid group background style.')
    }
  }
  const nodeIds = new Set(ids)
  for (const edge of edges) {
    identity(edge)
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) fail('A connection refers to a missing node.')
    for (const key of ['fromSide', 'toSide']) if (edge[key] !== undefined && !['top', 'right', 'bottom', 'left'].includes(edge[key])) fail('Invalid connection side.')
    for (const key of ['fromEnd', 'toEnd']) if (edge[key] !== undefined && !['none', 'arrow'].includes(edge[key])) fail('Invalid connection endpoint.')
    string(edge, 'label')
  }
  return { ...doc, nodes, edges }
}

export function notePath(note, notes) {
  const parts = [note.type === 'canvas' ? canvasName(note.name) : /\.[\w]+$/.test(note.name) ? note.name : `${note.name}.md`]
  const seen = new Set([note.id])
  let parent = notes.find(n => n.id === note.parentId)
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id); parts.unshift(parent.name)
    parent = notes.find(n => n.id === parent.parentId)
  }
  return parts.join('/')
}

export function fileNode(note, notes) {
  return { file: notePath(note, notes), researchos: { noteId: note.id } }
}

export function resolveFile(node, notes, sourceKey) {
  if (node.researchos?.noteId) return notes.find(n => n.id === node.researchos.noteId && n.type !== 'folder') || null
  const path = node.file.replaceAll('\\', '/').replace(/^\.\//, '')
  const candidates = notes.filter(n => n.type !== 'folder' && (notePath(n, notes) === path || n.name === path))
  const local = candidates.filter(n => n.sourceKey === sourceKey)
  // Ambiguous paths must be explicitly relinked instead of silently choosing.
  return local.length === 1 ? local[0] : candidates.length === 1 ? candidates[0] : null
}

export function exportCanvas(doc, notes, sourceKey) {
  return JSON.stringify({ ...doc, nodes: doc.nodes.map(node => {
    if (node.type !== 'file') return node
    const note = resolveFile(node, notes, sourceKey)
    return note ? { ...node, file: notePath(note, notes) } : node
  }) }, null, 2)
}

export function canvasReferences(note, notes) {
  try {
    return parseCanvas(note.content).nodes.filter(n => n.type === 'file').map(n => resolveFile(n, notes, note.sourceKey)).filter(Boolean).map(n => ({ name: n.name, noteId: n.id }))
  } catch { return [] }
}

export function safeUrl(url, media = false) {
  if (typeof url !== 'string') return null
  if (media && /^data:(image\/(png|jpeg|gif|webp|avif)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf);base64,[a-z\d+/=\s]+$/i.test(url)) return url
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null } catch { return null }
}

export function bounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, width: 600, height: 400 }
  const x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y))
  return { x, y, width: Math.max(...nodes.map(n => n.x + n.width)) - x, height: Math.max(...nodes.map(n => n.y + n.height)) - y }
}

export function containedNodes(group, nodes) {
  return nodes.filter(n => n.id !== group.id && n.x >= group.x && n.y >= group.y && n.x + n.width <= group.x + group.width && n.y + n.height <= group.y + group.height)
}

export function duplicateSelection(doc, selected, offset = 40) {
  const ids = new Map(doc.nodes.filter(n => selected.has(n.id)).map(n => [n.id, canvasId()]))
  return { ...doc,
    nodes: [...doc.nodes, ...doc.nodes.filter(n => ids.has(n.id)).map(n => ({ ...n, id: ids.get(n.id), x: n.x + offset, y: n.y + offset }))],
    edges: [...doc.edges, ...doc.edges.filter(e => ids.has(e.fromNode) && ids.has(e.toNode)).map(e => ({ ...e, id: canvasId(), fromNode: ids.get(e.fromNode), toNode: ids.get(e.toNode) }))],
  }
}

export function arrangeNodes(nodes, selected, mode) {
  const items = nodes.filter(n => selected.has(n.id))
  if (items.length < 2) return nodes
  const box = bounds(items), updates = new Map()
  const sorted = [...items].sort((a, b) => mode.includes('vertical') ? a.y - b.y : a.x - b.x)
  let cursor = mode.includes('vertical') ? box.y : box.x
  const total = sorted.reduce((sum, n) => sum + (mode.includes('vertical') ? n.height : n.width), 0)
  const gap = ((mode.includes('vertical') ? box.height : box.width) - total) / (items.length - 1)
  items.forEach((n, i) => {
    const patch = {}
    if (mode === 'left') patch.x = box.x
    if (mode === 'center') patch.x = box.x + (box.width - n.width) / 2
    if (mode === 'right') patch.x = box.x + box.width - n.width
    if (mode === 'top') patch.y = box.y
    if (mode === 'middle') patch.y = box.y + (box.height - n.height) / 2
    if (mode === 'bottom') patch.y = box.y + box.height - n.height
    if (mode === 'justify-horizontal') { patch.x = box.x; patch.width = box.width }
    if (mode === 'justify-vertical') { patch.y = box.y; patch.height = box.height }
    if (['row', 'column', 'grid'].includes(mode)) {
      const cols = mode === 'column' ? 1 : mode === 'row' ? items.length : Math.ceil(Math.sqrt(items.length))
      patch.x = box.x + (i % cols) * (Math.max(...items.map(n => n.width)) + 40)
      patch.y = box.y + Math.floor(i / cols) * (Math.max(...items.map(n => n.height)) + 40)
    }
    updates.set(n.id, patch)
  })
  if (mode.startsWith('distribute-')) sorted.forEach(n => {
    updates.set(n.id, { [mode.includes('vertical') ? 'y' : 'x']: cursor })
    cursor += (mode.includes('vertical') ? n.height : n.width) + gap
  })
  return nodes.map(n => updates.has(n.id) ? { ...n, ...Object.fromEntries(Object.entries(updates.get(n.id)).map(([k, v]) => [k, Math.round(v)])) } : n)
}

export function downloadFile(content, name, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
