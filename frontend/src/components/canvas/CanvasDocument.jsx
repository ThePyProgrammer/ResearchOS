import { useEffect, useRef, useState } from 'react'
import { notesApi } from '../../services/api'
import { EMPTY_CANVAS } from '../../utils/jsonCanvas'
import CanvasEditor from './CanvasEditor'

// Serialize writes per document, including when its editor unmounts during a
// tab switch. Keep failed drafts available for recovery on the next open.
const queues = new Map()
export function saveCanvas(id, content) {
  const prior = queues.get(id) || Promise.resolve()
  const next = prior.catch(() => {}).then(() => notesApi.update(id, { content }))
  queues.set(id, next)
  next.finally(() => { if (queues.get(id) === next) queues.delete(id) }).catch(() => {})
  return next
}

export default function CanvasDocument({ note, notes, onSaved, onOpen, onCreateNote, renderNoteEditor }) {
  const draftKey = `researchos.canvas.draft.${note.id}`
  const [recovery] = useState(() => { try { return localStorage.getItem(draftKey) } catch { return null } })
  const [initial] = useState(recovery ?? note.content ?? EMPTY_CANVAS)
  const [status, setStatus] = useState(recovery !== null ? 'Recovered unsaved draft' : 'Saved')
  const [error, setError] = useState('')
  const [backupAvailable, setBackupAvailable] = useState(true)
  const state = useRef({ content: initial, revision: 0, saved: recovery === null ? 0 : -1, timer: null, mounted: true, inFlight: false })
  const props = useRef({ note, onSaved }); props.current = { note, onSaved }

  function flush() {
    const s = state.current
    clearTimeout(s.timer)
    if (s.saved === s.revision || s.inFlight) return
    const revision = s.revision, content = s.content
    s.inFlight = true
    if (s.mounted) { setStatus('Saving…'); setError('') }
    saveCanvas(note.id, content).then(() => {
      s.saved = revision
      if (revision === s.revision) {
        try { if (localStorage.getItem(draftKey) === content) localStorage.removeItem(draftKey) } catch { /* storage unavailable */ }
        if (s.mounted) setStatus('Saved')
      }
    }).catch(err => {
      if (s.mounted) { setStatus('Unsaved'); setError(err.message || 'Could not save canvas.') }
    }).finally(() => {
      s.inFlight = false
      if (revision !== s.revision) flush()
    })
  }

  function change(content) {
    const s = state.current
    s.content = content; s.revision++
    try { localStorage.setItem(draftKey, content); setBackupAvailable(true) } catch { setBackupAvailable(false) }
    // Update the directory immediately so reopening a tab sees its latest draft.
    props.current.onSaved?.({ ...props.current.note, content })
    setStatus('Unsaved'); setError('')
    clearTimeout(s.timer); s.timer = setTimeout(flush, 600)
  }

  useEffect(() => {
    state.current.mounted = true
    const beforeUnload = e => {
      if (state.current.saved !== state.current.revision) { flush(); e.preventDefault(); e.returnValue = '' }
    }
    const hide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', hide)
    return () => {
      state.current.mounted = false
      flush()
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [])

  return <div className="canvas-document">
    <div className="canvas-document-header"><strong>{note.name}</strong><span role="status">{status}</span><button onClick={flush}>Save canvas</button></div>
    {error && <div role="alert" className="canvas-error">{error} {backupAvailable ? 'Your draft is retained on this device.' : 'Keep this tab open and retry, or export the canvas to preserve your changes.'} <button onClick={flush}>Retry save</button></div>}
    <CanvasEditor initialContent={initial} note={note} notes={notes} onChange={change} onOpen={onOpen} onCreateNote={onCreateNote} onSave={flush} renderNoteEditor={renderNoteEditor} onFileSaved={onSaved} />
  </div>
}
