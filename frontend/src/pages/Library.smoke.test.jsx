import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Library from './Library'

const libraryState = vi.hoisted(() => ({ activeLibraryId: 'lib_1', loading: false }))

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
    mutateItems: vi.fn(),
    tags: vi.fn(),
    embeddings: vi.fn(),
    notesPreview: vi.fn(),
  },
}))

vi.mock('../context/LibraryContext', () => ({
  useLibrary: () => ({
    collections: [{ id: 'c_1', name: 'Inbox', paperCount: 1 }],
    activeLibrary: { id: 'lib_1', autoNoteEnabled: true },
    ...libraryState,
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
    libraryState.activeLibraryId = 'lib_1'
    libraryState.loading = false
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
    batchApi.mutateItems.mockReset()
    batchApi.embeddings.mockReset()
    batchApi.notesPreview.mockReset()
    githubReposApi.list.mockResolvedValue([])
  })

  it('waits for library initialization and reuses data for status filters', async () => {
    libraryState.loading = true
    papersApi.list.mockResolvedValue([])
    websitesApi.list.mockResolvedValue([])
    const view = render(<MemoryRouter><Library /></MemoryRouter>)
    expect(papersApi.list).not.toHaveBeenCalled()
    libraryState.loading = false
    view.rerender(<MemoryRouter><Library /></MemoryRouter>)
    await waitFor(() => expect(papersApi.list).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    fireEvent.click(screen.getByRole('button', { name: /^To Read/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('1 active')
    expect(screen.queryByRole('button', { name: /^To Read/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(screen.getByRole('button', { name: /^Filters/ })).not.toHaveTextContent('active')
    expect(papersApi.list).toHaveBeenCalledTimes(1)
    expect(websitesApi.list).toHaveBeenCalledTimes(1)
    expect(githubReposApi.list).toHaveBeenCalledTimes(1)
    act(() => window.dispatchEvent(new CustomEvent('researchos:items-changed')))
    await waitFor(() => expect(papersApi.list).toHaveBeenCalledTimes(2))
  })

  it('ignores late results from the previous library', async () => {
    let resolveOld
    papersApi.list.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
    websitesApi.list.mockResolvedValue([])
    const view = render(<MemoryRouter><Library /></MemoryRouter>)
    libraryState.activeLibraryId = 'lib_2'
    papersApi.list.mockResolvedValue([])
    view.rerender(<MemoryRouter><Library /></MemoryRouter>)
    await waitFor(() => expect(papersApi.list).toHaveBeenCalledWith({ library_id: 'lib_2' }))
    await act(async () => {
      resolveOld([{ id: 'old', title: 'Stale paper', authors: [], tags: [], collections: [] }])
    })
    expect(screen.queryByText('Stale paper')).not.toBeInTheDocument()
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

  it('uses bulk status updates and retains only failed items for retry', async () => {
    papersApi.list.mockResolvedValue(['p_1', 'p_2'].map(id => ({
      id, title: id, authors: [], status: 'inbox', source: 'human', collections: [], tags: [],
    })))
    websitesApi.list.mockResolvedValue([])
    batchApi.mutateItems.mockImplementation(async (_items, _options, onResult) => {
      const result = { succeededIds: ['p_1'], failed: [{ id: 'p_2', detail: 'Please retry.' }] }
      onResult(result)
      return result
    })
    renderLibrary()
    await waitFor(() => expect(screen.getByText('p_1')).toBeInTheDocument())
    fireEvent.click(document.querySelector('thead input[type="checkbox"]'))
    fireEvent.click(screen.getByRole('button', { name: /Set Status/ }))
    fireEvent.click(screen.getByRole('button', { name: /^check_circle\s*Read$/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('1 succeeded; 1 could not be completed'))
    expect(batchApi.mutateItems).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'p_1' }), expect.objectContaining({ id: 'p_2' })]),
      { action: 'status', status: 'read', libraryId: 'lib_1' }, expect.any(Function),
    )
    expect(papersApi.update).not.toHaveBeenCalled()
    expect(document.querySelectorAll('tbody input:checked')).toHaveLength(1)
    expect(screen.getByText('1 item selected')).toBeInTheDocument()
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

  it('continues large AI selections after one chunk fails', async () => {
    papersApi.list.mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({
      id: `p_${i}`, title: `Large batch ${i}`, authors: [], status: 'inbox',
      source: 'human', collections: [], tags: [], abstract: 'Abstract',
    })))
    websitesApi.list.mockResolvedValue([])
    batchApi.tags.mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ updated: 1, skipped: 0, total: 1 })
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Large batch 0')).toBeInTheDocument())
    fireEvent.click(document.querySelector('thead input[type="checkbox"]'))
    fireEvent.click(screen.getByRole('button', { name: /Auto-Tag/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(batchApi.tags).toHaveBeenCalledTimes(2))
    expect(batchApi.tags.mock.calls.map(call => call[0].length)).toEqual([100, 1])
    expect(screen.getByRole('button', { name: /Retry 100 Failed/ })).toBeInTheDocument()
  })
})
