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
  searchApi: { query: vi.fn() },
  notesApi: { generate: vi.fn() },
}))

vi.mock('../context/LibraryContext', () => ({
  useLibrary: () => ({
    collections: [{ id: 'c_1', name: 'Inbox', paperCount: 1 }],
    activeLibrary: { id: 'lib_1', autoNoteEnabled: true },
    activeLibraryId: 'lib_1',
    refreshCollections: vi.fn(),
  }),
}))

import { papersApi, websitesApi } from '../services/api'


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
    papersApi.update.mockReset()
    websitesApi.update.mockReset()
    papersApi.remove.mockReset()
    websitesApi.remove.mockReset()
    papersApi.fetchPdf.mockReset()
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

    renderLibrary()

    await waitFor(() => expect(screen.getByText('Paper Alpha')).toBeInTheDocument())
    expect(screen.getByText('Website Beta')).toBeInTheDocument()

    const rows = document.querySelectorAll('tbody tr')
    fireEvent.doubleClick(rows[0])
    await waitFor(() => expect(screen.getByTestId('paper-route')).toBeInTheDocument())
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
})
