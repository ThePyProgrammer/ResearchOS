import { describe, expect, it } from 'vitest'
import { arrangeNodes, containedNodes, duplicateSelection, exportCanvas, fileNode, notePath, parseCanvas, resolveFile, safeUrl } from './jsonCanvas'

const node = (id, extra = {}) => ({ id, type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Hello', ...extra })

describe('JSON Canvas interchange', () => {
  it('accepts optional arrays and retains extension data and node order', () => {
    expect(parseCanvas('{}')).toEqual({ nodes: [], edges: [] })
    const doc = { nodes: [node('z', { extension: { a: 1 } }), node('a')], edges: [{ id: 'edge', fromNode: 'z', toNode: 'a', fromEnd: 'arrow', toEnd: 'none', label: 'relates', extension: true }], vendor: { enabled: true } }
    expect(parseCanvas(exportCanvas(doc, []))).toEqual(doc)
  })
  it.each([
    'null', '[]', '{"nodes":null}', '{"edges":{}}', '{',
    JSON.stringify({ nodes: [node('a'), node('a')] }),
    JSON.stringify({ nodes: [node('a', { width: -1 })] }),
    JSON.stringify({ nodes: [node('a', { x: 0.5 })] }),
    JSON.stringify({ nodes: [node('a', { color: 'url(javascript:bad)' })] }),
    JSON.stringify({ nodes: [node('a')], edges: [{ id: 'b', fromNode: 'a', toNode: 'missing' }] }),
    JSON.stringify({ nodes: [node('a', { type: 'file', file: 'note.md', subpath: 'invalid' })] }),
  ])('rejects invalid input without mutating it: %s', input => {
    expect(() => parseCanvas(input)).toThrow()
  })
  it('uses stable IDs across renames and updates portable paths during export', () => {
    const notes = [{ id: 'folder', type: 'folder', name: 'Research' }, { id: 'n', type: 'canvas', name: 'New name.canvas', parentId: 'folder' }]
    const ref = { id: 'ref', type: 'file', file: 'Old name.canvas', researchos: { noteId: 'n' } }
    expect(resolveFile(ref, notes)).toEqual(notes[1])
    expect(fileNode(notes[1], notes).file).toBe('Research/New name.canvas')
    expect(JSON.parse(exportCanvas({ nodes: [ref], edges: [] }, notes)).nodes[0].file).toBe('Research/New name.canvas')
  })
  it('does not silently relink deleted IDs or ambiguous paths', () => {
    const notes = [{ id: '1', type: 'file', name: 'Summary', sourceKey: 'paper:1' }, { id: '2', type: 'file', name: 'Summary', sourceKey: 'paper:2' }]
    expect(resolveFile({ file: 'Summary.md' }, notes)).toBeNull()
    expect(resolveFile({ file: 'Summary.md' }, notes, 'paper:2').id).toBe('2')
    expect(resolveFile({ file: 'Summary.md', researchos: { noteId: 'deleted' } }, notes, 'paper:2')).toBeNull()
  })
  it('terminates path lookup even with corrupt folder cycles', () => {
    const notes = [{ id: 'a', name: 'A', parentId: 'b', type: 'folder' }, { id: 'b', name: 'B', parentId: 'a', type: 'folder' }]
    expect(notePath({ id: 'n', name: 'Note', type: 'file', parentId: 'a' }, notes)).toBe('B/A/Note.md')
  })
  it('duplicates internal edges and omits links outside the selection', () => {
    const doc = { nodes: [node('a'), node('b'), node('c')], edges: [{ id: 'ab', fromNode: 'a', toNode: 'b' }, { id: 'bc', fromNode: 'b', toNode: 'c' }] }
    const copy = duplicateSelection(doc, new Set(['a', 'b']))
    expect(copy.nodes).toHaveLength(5)
    expect(copy.edges).toHaveLength(3)
    expect(copy.edges[2].fromNode).toBe(copy.nodes[3].id)
    expect(copy.edges[2].toNode).toBe(copy.nodes[4].id)
    expect(copy.nodes[3].x).toBe(40)
    expect(doc.nodes).toHaveLength(3)
  })
  it('arranges selected cards without moving unselected cards', () => {
    const nodes = [node('a', { x: 10 }), node('b', { x: 50, y: 200 }), node('c', { x: 300 })]
    const next = arrangeNodes(nodes, new Set(['a', 'b']), 'left')
    expect(next.map(n => n.x)).toEqual([10, 10, 300])
    expect(containedNodes({ id: 'group', x: 0, y: 0, width: 300, height: 400 }, nodes).map(n => n.id)).toEqual(['a', 'b'])
  })
  it('blocks active URLs and SVG data while allowing supported media', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('file:///etc/passwd')).toBeNull()
    expect(safeUrl('data:text/html;base64,PHNjcmlwdD4=', true)).toBeNull()
    expect(safeUrl('data:image/svg+xml;base64,PHN2Zz4=', true)).toBeNull()
    expect(safeUrl('data:image/png;base64,aGVsbG8=', true)).toContain('data:image/png')
    expect(safeUrl('https://example.com')).toBe('https://example.com/')
  })
})
