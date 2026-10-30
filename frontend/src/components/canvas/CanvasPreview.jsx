import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DOMPurify from 'dompurify'
import { bounds, canvasColor, parseCanvas, resolveFile, safeUrl } from '../../utils/jsonCanvas'

export function MarkdownCard({ text }) {
  return <div className="canvas-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={safeUrl(href) || undefined} target="_blank" rel="noopener noreferrer">{children}</a>,
  }}>{text || ''}</ReactMarkdown></div>
}

export function noteExcerpt(content, subpath) {
  if (!subpath) return content
  const heading = subpath.replace(/^#/, '')
  if (/<[a-z][\s\S]*>/i.test(content)) {
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(content), 'text/html')
    const block = heading.startsWith('^')
    const target = [...doc.body.querySelectorAll(block ? '[id], p, li' : 'h1,h2,h3,h4,h5,h6')].find(el =>
      block ? el.id === heading.slice(1) || el.textContent.trim().endsWith(heading) : el.textContent.trim().toLowerCase() === heading.toLowerCase())
    if (!target) return 'Heading or block not found.'
    if (block) return target.outerHTML
    let result = target.outerHTML, next = target.nextElementSibling
    while (next && !(/^H[1-6]$/.test(next.tagName) && next.tagName <= target.tagName)) { result += next.outerHTML; next = next.nextElementSibling }
    return result
  }
  const lines = content.split('\n')
  if (heading.startsWith('^')) return lines.find(line => line.trim().endsWith(heading)) || 'Block not found.'
  const start = lines.findIndex(line => line.replace(/^#+\s+/, '').trim().toLowerCase() === heading.toLowerCase() && /^#+\s/.test(line))
  if (start < 0) return 'Heading not found.'
  const level = lines[start].match(/^#+/)[0].length
  let end = start + 1
  while (end < lines.length && !(new RegExp(`^#{1,${level}}\\s`).test(lines[end]))) end++
  return lines.slice(start, end).join('\n')
}

export function NotePreview({ content, subpath }) {
  const text = noteExcerpt(content || '', subpath)
  return /<[a-z][\s\S]*>/i.test(text)
    ? <div className="canvas-markdown" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text, { ADD_ATTR: ['target'], FORBID_TAGS: ['iframe', 'style', 'form', 'input'] }) }} />
    : <MarkdownCard text={text} />
}

export function MediaPreview({ path, data, interactive = false }) {
  const url = safeUrl(data || path, true)
  if (!url) return <p className="canvas-placeholder">File unavailable. Use “Swap file” to relink it.</p>
  const kind = data?.match(/^data:([^;]+)/)?.[1] || path.split(/[?#]/)[0]
  if (/^image\/|\.(png|jpe?g|gif|webp|avif|svg)$/i.test(kind)) return <img src={url} alt={path} draggable={false} />
  if (/^audio\/|\.(mp3|wav|ogg|m4a|flac)$/i.test(kind)) return <audio src={url} controls={interactive} />
  if (/^video\/|\.(mp4|webm|mov)$/i.test(kind)) return <video src={url} controls={interactive} />
  if (/application\/pdf|\.pdf$/i.test(kind)) return interactive ? <iframe title={path} src={url} sandbox="" /> : <p>PDF: {path}</p>
  return <a href={url} target="_blank" rel="noopener noreferrer">Open {path}</a>
}

export function FilePreview({ node, notes, sourceKey, visited = [], interactive = false }) {
  const note = resolveFile(node, notes, sourceKey)
  if (!note) {
    if (node.researchos?.textContent !== undefined) return <NotePreview content={node.researchos.textContent} subpath={node.subpath} />
    return <MediaPreview path={node.file} data={node.researchos?.mediaData} interactive={interactive} />
  }
  if (note.type === 'canvas') {
    if (visited.includes(note.id)) return <p className="canvas-placeholder">Circular canvas reference — open the canvas to explore it.</p>
    if (visited.length >= 4) return <p className="canvas-placeholder">Nested canvas: {note.name}</p>
    return <CanvasPreview content={note.content} notes={notes} sourceKey={note.sourceKey} visited={[...visited, note.id]} />
  }
  return <NotePreview content={note.content} subpath={node.subpath} />
}

export default function CanvasPreview({ content, notes = [], sourceKey, visited = [] }) {
  let doc
  try { doc = parseCanvas(content) } catch (err) { return <p className="canvas-placeholder">{err.message}</p> }
  const box = bounds(doc.nodes), width = Math.max(box.width + 40, 1), height = Math.max(box.height + 40, 1)
  const byId = new Map(doc.nodes.map(n => [n.id, n]))
  return <svg className="canvas-preview" viewBox={`${box.x - 20} ${box.y - 20} ${width} ${height}`} role="img" aria-label="Nested canvas preview">
    {doc.nodes.map(n => <g key={n.id}>
      <rect x={n.x} y={n.y} width={n.width} height={n.height} rx="8" fill={n.type === 'group' ? '#e2e8f0' : 'white'} stroke={canvasColor(n.color)} strokeWidth="3" />
      <foreignObject x={n.x + 10} y={n.y + 10} width={Math.max(n.width - 20, 1)} height={Math.max(n.height - 20, 1)}>
        <div className="canvas-preview-content">
          {n.type === 'text' && <MarkdownCard text={n.text} />}
          {n.type === 'group' && <strong>{n.label}</strong>}
          {n.type === 'link' && <span>{n.url}</span>}
          {n.type === 'file' && <FilePreview node={n} notes={notes} sourceKey={sourceKey} visited={visited} />}
        </div>
      </foreignObject>
    </g>)}
    {doc.edges.map(e => {
      const a = byId.get(e.fromNode), b = byId.get(e.toNode)
      const point = (n, side) => ({ x: n.x + (side === 'left' ? 0 : side === 'right' ? n.width : n.width / 2), y: n.y + (side === 'top' ? 0 : side === 'bottom' ? n.height : n.height / 2) })
      const start = point(a, e.fromSide || 'right'), end = point(b, e.toSide || 'left')
      return <g key={e.id}><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={canvasColor(e.color)} strokeWidth="3" /><text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2} fontSize="14">{e.label}</text></g>
    })}
  </svg>
}
