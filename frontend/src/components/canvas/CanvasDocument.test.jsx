import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CanvasDocument from './CanvasDocument'
import { notesApi } from '../../services/api'

vi.mock('../../services/api', () => ({ notesApi: { update: vi.fn() } }))
vi.mock('./CanvasEditor', () => ({ default: ({ onChange, initialContent }) => <div><span>{initialContent}</span><button onClick={() => onChange('{"nodes":[],"edges":[],"edited":true}')}>Edit canvas</button></div> }))
const note = { id: 'test-canvas', type: 'canvas', name: 'Map.canvas', content: '{"nodes":[],"edges":[]}' }
beforeEach(() => { localStorage.clear(); notesApi.update.mockReset(); notesApi.update.mockImplementation(async (id, data) => ({ id, ...data })) })
afterEach(() => { vi.useRealTimers() })

it('flushes the correct document on a tab switch and updates the local directory immediately', async () => {
  const onSaved = vi.fn()
  const view = render(<CanvasDocument note={note} notes={[]} onSaved={onSaved} />)
  fireEvent.click(screen.getByText('Edit canvas'))
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: note.id, content: expect.stringContaining('edited') }))
  view.unmount()
  await waitFor(() => expect(notesApi.update).toHaveBeenCalledWith(note.id, { content: '{"nodes":[],"edges":[],"edited":true}' }))
})

it('keeps failed drafts and allows retry without losing the document', async () => {
  notesApi.update.mockRejectedValueOnce(new Error('Offline'))
  render(<CanvasDocument note={note} notes={[]} />)
  fireEvent.click(screen.getByText('Edit canvas'))
  fireEvent.click(screen.getByText('Save canvas'))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Offline'))
  expect(localStorage.getItem(`researchos.canvas.draft.${note.id}`)).toContain('edited')
  fireEvent.click(screen.getByText('Retry save'))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'))
  expect(localStorage.getItem(`researchos.canvas.draft.${note.id}`)).toBeNull()
})

it('serializes changes made during an in-flight save', async () => {
  let resolve
  notesApi.update.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  render(<CanvasDocument note={{ ...note, id: 'serial-canvas' }} notes={[]} />)
  fireEvent.click(screen.getByText('Edit canvas'))
  fireEvent.click(screen.getByText('Save canvas'))
  await waitFor(() => expect(notesApi.update).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByText('Edit canvas'))
  fireEvent.click(screen.getByText('Save canvas'))
  expect(notesApi.update).toHaveBeenCalledTimes(1)
  await act(async () => resolve({}))
  await waitFor(() => expect(notesApi.update).toHaveBeenCalledTimes(2))
})

it('does not claim a durable backup when browser storage is full', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
  notesApi.update.mockRejectedValue(new Error('Offline'))
  const view = render(<CanvasDocument note={{ ...note, id: 'large-canvas' }} notes={[]} />)
  try {
    fireEvent.click(screen.getByText('Edit canvas'))
    fireEvent.click(screen.getByText('Save canvas'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Keep this tab open'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('retained on this device')
  } finally { view.unmount(); storage.mockRestore() }
})
