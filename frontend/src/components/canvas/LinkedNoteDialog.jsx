import { useState } from 'react'
import { notesApi } from '../../services/api'

export default function LinkedNoteDialog({ note, renderEditor, onSaved, onClose }) {
  const [content, setContent] = useState(note.content || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  function close() {
    if (!saving && (content === (note.content || '') || window.confirm('Discard unsaved changes to this note?'))) onClose()
  }
  async function save() {
    setSaving(true); setError('')
    try {
      const updated = await notesApi.update(note.id, { content })
      onSaved({ ...note, ...updated }); onClose()
    } catch (err) { setError(err.message); setSaving(false) }
  }
  return <div className="canvas-modal-backdrop"><div className="canvas-modal canvas-note-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${note.name}`}>
    <header><strong>{note.name}</strong><button onClick={close} disabled={saving} aria-label="Close note editor">×</button></header>
    {error && <p role="alert" className="canvas-error">{error}</p>}
    <div className="canvas-note-dialog-editor">{renderEditor({ content, onUpdate: setContent, onSave: () => {}, name: note.name })}</div>
    <footer><button onClick={close} disabled={saving}>Cancel</button><button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></footer>
  </div></div>
}
