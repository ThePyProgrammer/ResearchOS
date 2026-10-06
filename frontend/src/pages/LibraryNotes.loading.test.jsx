import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import LibraryNotes from './LibraryNotes'
import { notesApi, papersApi, websitesApi, githubReposApi } from '../services/api'

const library = vi.hoisted(() => ({ activeLibraryId: 'lib1', collections: [], loading: false }))
vi.mock('../context/LibraryContext', () => ({ useLibrary: () => library }))
vi.mock('../services/api', () => ({
  notesApi: { listForItems: vi.fn(), listForLibrary: vi.fn(), list: vi.fn(), listForWebsite: vi.fn(), listForGitHubRepo: vi.fn() },
  papersApi: { list: vi.fn() }, websitesApi: { list: vi.fn() }, githubReposApi: { list: vi.fn() },
}))
vi.mock('@tiptap/react', () => ({ useEditor: () => null, EditorContent: () => null }))
vi.mock('../components/NoteGraphView', () => ({ default: () => null }))
vi.mock('../components/NotesCopilotPanel', () => ({ default: () => null, SuggestionTabView: () => null }))

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  library.activeLibraryId = 'lib1'
  library.loading = false
  papersApi.list.mockResolvedValue([{ id: 'p1', title: 'First paper', collections: [] }])
  websitesApi.list.mockResolvedValue([])
  githubReposApi.list.mockResolvedValue([])
  notesApi.listForLibrary.mockResolvedValue([])
  notesApi.listForItems.mockResolvedValue([{ id: 'p1', itemType: 'paper', notes: [
    { id: 'n1', name: 'Batched summary', type: 'file', content: '<p>Unique searchable content</p>' },
  ] }])
})

it('loads item notes together and makes their contents searchable', async () => {
  render(<LibraryNotes />)
  await waitFor(() => expect(screen.getByText('First paper')).toBeInTheDocument())
  expect(notesApi.listForItems).toHaveBeenCalledWith([{ id: 'p1', itemType: 'paper' }])
  fireEvent.change(screen.getByPlaceholderText('Search notes…'), { target: { value: 'Unique searchable' } })
  expect(screen.getByText('Batched summary')).toBeInTheDocument()
  expect(notesApi.list).not.toHaveBeenCalled()
})

it('allows retry after a failed note batch', async () => {
  notesApi.listForItems.mockRejectedValueOnce(new Error('Notes offline'))
  render(<LibraryNotes />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Notes offline'))
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading notes' }))
  await waitFor(() => expect(screen.getByText('First paper')).toBeInTheDocument())
  expect(notesApi.listForItems).toHaveBeenCalledTimes(2)
})

it('ignores the old library response after switching libraries', async () => {
  let resolveOld
  notesApi.listForItems.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
  const view = render(<LibraryNotes />)
  await waitFor(() => expect(notesApi.listForItems).toHaveBeenCalledTimes(1))
  library.activeLibraryId = 'lib2'
  papersApi.list.mockResolvedValue([{ id: 'p2', title: 'Second paper', collections: [] }])
  notesApi.listForItems.mockResolvedValue([{ id: 'p2', itemType: 'paper', notes: [] }])
  view.rerender(<LibraryNotes />)
  await waitFor(() => expect(screen.getByText('Second paper')).toBeInTheDocument())
  await act(async () => resolveOld([{ id: 'p1', itemType: 'paper', notes: [] }]))
  expect(screen.queryByText('First paper')).not.toBeInTheDocument()
})
