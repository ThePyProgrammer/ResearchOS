import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import NotesPanel from './NotesPanel'

vi.mock('@tiptap/react', () => ({ useEditor: () => null, EditorContent: () => null, NodeViewWrapper: () => null, ReactNodeViewRenderer: vi.fn() }))
vi.mock('./canvas/CanvasDocument', () => ({ default: ({ note }) => <div data-testid="canvas-document">{note.name}</div> }))

it('creates canvas documents through the supplied notes-scope API and opens the canvas editor', async () => {
  const create = vi.fn(async data => ({ id: 'canvas1', ...data }))
  function Harness() {
    const [notes, setNotes] = useState([])
    return <NotesPanel notes={notes} setNotes={setNotes} createFn={create} />
  }
  render(<Harness />)
  fireEvent.click(screen.getByTitle('New canvas'))
  fireEvent.change(screen.getByPlaceholderText('File name'), { target: { value: 'Research map' } })
  fireEvent.submit(screen.getByPlaceholderText('File name').closest('form'))
  await waitFor(() => expect(screen.getByTestId('canvas-document')).toHaveTextContent('Research map.canvas'))
  expect(create).toHaveBeenCalledWith({ name: 'Research map.canvas', type: 'canvas', content: '{"nodes":[],"edges":[]}', parentId: null })
})
