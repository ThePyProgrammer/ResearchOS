import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Library from './Library'

vi.mock('../services/api', () => ({
  papersApi: {
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    fetchPdf: vi.fn(),
  },
  websitesApi: {
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  githubReposApi: {
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  searchApi: { query: vi.fn() },
  notesApi: { generate: vi.fn() },
  collectionsApi: { topAuthors: vi.fn() },
  batchApi: {
    tags: vi.fn(),
    embeddings: vi.fn(),
    notesPreview: vi.fn(),
  },
}))

vi.mock('../context/LibraryContext', () => ({
  useLibrary: () => ({
    collections: [{ id: 'c_1', name: 'Inbox', paperCount: 1 }],
    activeLibrary: { id: 'lib_1', autoNoteEnabled: true },
    activeLibraryId: 'lib_1',
    refreshCollections: vi.fn(),
  }),
}))

import { papersApi, websitesApi, githubReposApi, batchApi } from '../services/api'


function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route path="/library" element={<Library />} />
        <Route path="/library/paper/:id" element={<div data-testid="paper-route">paper route</div>} />
        <Route path="/library/website/:id" element={<div data-testid="website-route">website route</div>} />
      </Routes>
    </MemoryRouter>
  )
}


describe('Library page smoke', () => {
  beforeEach(() => {
    papersApi.list.mockReset()
    websitesApi.list.mockReset()
    githubReposApi.list.mockReset()
    papersApi.update.mockReset()
    websitesApi.update.mockReset()
    githubReposApi.update.mockReset()
    papersApi.remove.mockReset()
    websitesApi.remove.mockReset()
    githubReposApi.remove.mockReset()
    papersApi.fetchPdf.mockReset()
    batchApi.tags.mockReset()
    batchApi.embeddings.mockReset()
    batchApi.notesPreview.mockReset()
    githubReposApi.list.mockResolvedValue([])
  })

  it('loads mixed items and supports row double-click navigation', async () => {
    papersApi.list.mockResolvedValue([
      {
        id: 'p_1',
        title: 'Paper Alpha',
        authors: ['Jane Smith'],
        status: 'inbox',
        year: 2024,
        venue: 'NeurIPS',
        source: 'human',
        collections: [],
      },
    ])
    websitesApi.list.mockResolvedValue([
      {
        id: 'w_1',
        title: 'Website Beta',
        authors: ['Alice'],
        status: 'inbox',
        itemType: 'website',
        url: 'https://example.com',
        collections: [],
      },
    ])

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderLibrary()

    await waitFor(() => expect(screen.getByText('Paper Alpha')).toBeInTheDocument())
    expect(screen.getByText('Website Beta')).toBeInTheDocument()

    const rows = document.querySelectorAll('tbody tr')
    fireEvent.doubleClick(rows[0])
    expect(openSpy).toHaveBeenCalledWith('/library/paper/p_1', '_blank')

    openSpy.mockRestore()
  })

  it('shows bulk action bar when selecting rows', async () => {
    papersApi.list.mockResolvedValue([
      {
        id: 'p_1',
        title: 'Paper Alpha',
        authors: ['Jane Smith'],
        status: 'inbox',
        year: 2024,
        venue: 'NeurIPS',
        source: 'human',
        collections: [],
      },
    ])
    websitesApi.list.mockResolvedValue([])

    renderLibrary()

    await waitFor(() => expect(screen.getByText('Paper Alpha')).toBeInTheDocument())
    const checkbox = document.querySelector('tbody input[type="checkbox"]')
    fireEvent.click(checkbox)

    expect(screen.getByText(/1 item selected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete All/i })).toBeInTheDocument()
  })

  it('skips auto-tag items that already have tags or no source text', async () => {
    papersApi.list.mockResolvedValue([
      {
        id: 'p_tagged',
        title: 'Already Tagged',
        authors: ['Jane Smith'],
        status: 'inbox',
        year: 2024,
        venue: 'NeurIPS',
        source: 'human',
        abstract: 'Has text',
        tags: ['ml'],
        collections: [],
      },
      {
        id: 'p_no_text',
        title: 'Paper Without Abstract',
        authors: ['Jane Smith'],
        status: 'inbox',
        year: 2024,
        venue: 'NeurIPS',
        source: 'human',
        abstract: '   ',
        tags: [],
        collections: [],
      },
      {
        id: 'p_ready',
        title: 'Ready Paper',
        authors: ['Jane Smith'],
        status: 'inbox',
        year: 2024,
        venue: 'ICML',
        source: 'human',
        abstract: 'Useful abstract',
        tags: [],
        collections: [],
      },
    ])
    websitesApi.list.mockResolvedValue([
      {
        id: 'w_no_text',
        title: 'Website Without Description',
        authors: ['Alice'],
        status: 'inbox',
        itemType: 'website',
        description: '   ',
        tags: [],
        url: 'https://example.com',
        collections: [],
      },
    ])

    renderLibrary()

    await waitFor(() => expect(screen.getByText('Already Tagged')).toBeInTheDocument())
    const selectAll = document.querySelector('thead input[type="checkbox"]')
    fireEvent.click(selectAll)
    fireEvent.click(screen.getByRole('button', { name: /Auto-Tag/i }))

    await waitFor(() => expect(screen.getByText('3 items will be skipped (already have tags)')).toBeInTheDocument())
    expect(screen.getByText('1 items will be processed')).toBeInTheDocument()
  })

  it('starts auto-tagging with the active library id without showing unavailable cancellation controls', async () => {
    let resolveTags
    batchApi.tags.mockImplementation(() => new Promise(r => { resolveTags = r }))
    papersApi.list.mockResolvedValue([
      {
        id: 'p_ready',
        title: 'Ready Paper',
        authors: ['Jane Smith'],
        status: 'inbox',
        year: 2024,
        venue: 'ICML',
        source: 'human',
        abstract: 'Useful abstract',
        tags: [],
        collections: [],
      },
    ])
    websitesApi.list.mockResolvedValue([])

    renderLibrary()

    await waitFor(() => expect(screen.getByText('Ready Paper')).toBeInTheDocument())
    const checkbox = document.querySelector('tbody input[type="checkbox"]')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /Auto-Tag/i }))

    await waitFor(() => expect(screen.getByText('1 items will be processed')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(batchApi.tags).toHaveBeenCalledWith(['p_ready'], 'lib_1'))
    expect(screen.getByText('0 of 1 processed...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()

    resolveTags({ updated: 1, skipped: 0, total: 1 })
    await waitFor(() => expect(screen.getByText('Complete — 1 succeeded')).toBeInTheDocument())
  })
})
