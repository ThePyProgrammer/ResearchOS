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

  it('copies BibTeX from the context menu and reports clipboard failures', async () => {
    papersApi.list.mockResolvedValue([{ id: 'p_1', title: 'Context paper', authors: ['Jane Smith'], year: 2024, collections: [] }])
    websitesApi.list.mockResolvedValue([])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    renderLibrary()
    await screen.findByText('Context paper')
    fireEvent.contextMenu(document.querySelector('tbody tr'), { clientX: 100, clientY: 120 })
    expect(screen.getByRole('menu', { name: 'Context paper' })).toBeInTheDocument()
    expect(document.querySelector('tbody input[type="checkbox"]')).not.toBeChecked()
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Copy & export' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy BibTeX citation' }))
    await screen.findByText('BibTeX copied to clipboard.')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Context paper'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    writeText.mockRejectedValueOnce(new Error('Permission denied'))
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Context paper' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy & export' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy title' }))
    await screen.findByText('Could not copy to clipboard: Permission denied')
  })

  it('preserves checked targets but isolates an unchecked context row for deletion', async () => {
    papersApi.list.mockResolvedValue(['p_1', 'p_2', 'p_3'].map(id => ({ id, title: id, authors: [], collections: [], status: 'inbox' })))
    websitesApi.list.mockResolvedValue([])
    renderLibrary()
    await screen.findByText('p_1')
    const rows = document.querySelectorAll('tbody tr')
    fireEvent.click(rows[0].querySelector('input'))
    fireEvent.click(rows[1].querySelector('input'))
    fireEvent.contextMenu(rows[0])
    expect(screen.getByRole('menu', { name: '2 selected items' })).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    fireEvent.contextMenu(rows[2])
    expect(screen.getByRole('menu', { name: 'p_3' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete item…' }))
    expect(screen.getByRole('button', { name: 'Delete 1 item' })).toBeInTheDocument()
    expect(batchApi.mutateItems).not.toHaveBeenCalled()
    expect(rows[0].querySelector('input')).toBeChecked()
    expect(rows[1].querySelector('input')).toBeChecked()
    expect(rows[2].querySelector('input')).not.toBeChecked()
    batchApi.mutateItems.mockResolvedValue({ succeededIds: ['p_3'], failed: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1 item' }))
    await waitFor(() => expect(batchApi.mutateItems).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'p_3' })],
      { action: 'delete', libraryId: 'lib_1' }, expect.any(Function),
    ))
  })

  it('applies context status actions to an unchecked paper without changing checkbox selection', async () => {
    papersApi.list.mockResolvedValue(['p_1', 'p_2'].map(id => ({ id, title: id, authors: [], collections: [], status: 'inbox' })))
    websitesApi.list.mockResolvedValue([])
    batchApi.mutateItems.mockResolvedValue({ succeededIds: ['p_2'], failed: [] })
    renderLibrary()
    await screen.findByText('p_1')
    const rows = document.querySelectorAll('tbody tr')
    fireEvent.click(rows[0].querySelector('input'))
    fireEvent.contextMenu(rows[1])
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Organize' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as Read' }))
    await waitFor(() => expect(batchApi.mutateItems).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'p_2' })],
      { action: 'status', status: 'read', libraryId: 'lib_1' }, expect.any(Function),
    ))
    expect(rows[0].querySelector('input')).toBeChecked()
    expect(rows[1].querySelector('input')).not.toBeChecked()
  })

  it('supports keyboard menu navigation and hides paper-only actions for websites', async () => {
    papersApi.list.mockResolvedValue([])
    websitesApi.list.mockResolvedValue([{ id: 'w_1', title: 'Context website', itemType: 'website', url: 'https://example.com', authors: [], collections: [] }])
    renderLibrary()
    await screen.findByText('Context website')
    const row = document.querySelector('tbody tr')
    row.focus()
    fireEvent.keyDown(row, { key: 'F10', shiftKey: true })
    expect(screen.queryByRole('menuitem', { name: 'Copy BibTeX citation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Fetch PDFs…' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open & edit' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' })
    expect(screen.getByRole('menuitem', { name: 'Open in new tab' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Edit details, tags & collections' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' })
    expect(screen.getByRole('menuitem', { name: 'Open & edit' })).toHaveFocus()
    expect(screen.queryByRole('menu', { name: 'Open & edit' })).not.toBeInTheDocument()
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(row).toHaveFocus()
    fireEvent.contextMenu(row)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
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
    fireEvent.contextMenu(document.querySelector('tbody tr'))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Organize' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as Read' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('1 succeeded; 1 could not be completed'))
    expect(batchApi.mutateItems).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'p_1' }), expect.objectContaining({ id: 'p_2' })]),
      { action: 'status', status: 'read', libraryId: 'lib_1' }, expect.any(Function),
    )
    expect(papersApi.update).not.toHaveBeenCalled()
    expect(document.querySelectorAll('tbody input:checked')).toHaveLength(1)
    expect(screen.getByText('1 item selected')).toBeInTheDocument()
  })

  it('shows selection in the footer with all bulk actions available in the context menu', async () => {
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
    expect(screen.queryByRole('button', { name: /Delete All/i })).not.toBeInTheDocument()
    const footer = screen.getByText('Showing 1 of 1 item').parentElement.parentElement
    expect(footer).toContainElement(screen.getByText('1 item selected'))
    fireEvent.contextMenu(document.querySelector('tbody tr'))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Organize' }))
    for (const name of [/Add to collection/, 'Mark as Inbox', 'Mark as To Read', 'Mark as Read']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Process' }))
    for (const name of [/Generate notes/, /Auto-tag/, /Fetch PDFs/, /Generate embeddings/]) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Copy & export' }))
    expect(screen.getByRole('menuitem', { name: /Export BibTeX/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Delete item/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(checkbox).not.toBeChecked()
    expect(screen.queryByText('1 item selected')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
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
    fireEvent.contextMenu(document.querySelector('tbody tr'))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Process' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Auto-tag/ }))

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
    fireEvent.contextMenu(document.querySelector('tbody tr'))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Process' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Auto-tag/ }))

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
    fireEvent.contextMenu(document.querySelector('tbody tr'))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Process' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Auto-tag/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(batchApi.tags).toHaveBeenCalledTimes(2))
    expect(batchApi.tags.mock.calls.map(call => call[0].length)).toEqual([100, 1])
    expect(screen.getByRole('button', { name: /Retry 100 Failed/ })).toBeInTheDocument()
  })
})
