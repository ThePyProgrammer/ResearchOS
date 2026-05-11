import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Sidebar from './Sidebar'
import { useLibrary } from '../../context/LibraryContext'

vi.mock('../../context/LibraryContext', () => ({
  useLibrary: vi.fn(),
}))

vi.mock('../../services/api', () => ({
  proposalsApi: { list: vi.fn(() => Promise.resolve([])) },
  papersApi: { list: vi.fn(() => Promise.resolve([])) },
  websitesApi: { list: vi.fn(() => Promise.resolve([])) },
  githubReposApi: { list: vi.fn(() => Promise.resolve([])) },
  projectsApi: { list: vi.fn(() => Promise.resolve([])) },
}))

const libraries = [
  {
    id: 'lib_1',
    name: 'AI Papers',
    description: 'Foundation model research',
    createdAt: '2026-03-01T00:00:00Z',
  },
  {
    id: 'lib_2',
    name: 'Robotics Survey',
    description: 'Embodied AI references',
    createdAt: '2026-04-01T00:00:00Z',
  },
]

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderSidebar({ collapsed = false } = {}) {
  const switchLibrary = vi.fn()
  const createLibrary = vi.fn()

  useLibrary.mockReturnValue({
    libraries,
    activeLibrary: libraries[0],
    activeLibraryId: libraries[0].id,
    collections: [],
    createLibrary,
    switchLibrary,
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
    refreshCollections: vi.fn(),
  })

  const result = render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Sidebar collapsed={collapsed} onToggle={vi.fn()} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  )

  return { ...result, switchLibrary, createLibrary }
}

describe('Sidebar library switcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the modal from the expanded active library button and switches libraries without rendering the old popover', async () => {
    const { container, switchLibrary } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: /AI Papers/i }))

    expect(await screen.findByRole('dialog', { name: /switch library/i })).toBeInTheDocument()
    expect(container.querySelector('.absolute.left-3.right-3.top-full')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Robotics Survey/i }))

    expect(switchLibrary).toHaveBeenCalledWith('lib_2')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/library'))
  })

  it('opens the modal from the collapsed active library icon button', async () => {
    renderSidebar({ collapsed: true })

    fireEvent.click(screen.getByTitle('AI Papers'))

    expect(await screen.findByRole('dialog', { name: /switch library/i })).toBeInTheDocument()
  })

  it('keeps the library settings shortcut outside the modal', async () => {
    renderSidebar()

    fireEvent.click(screen.getByTitle('Library settings'))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/library/settings'))
    expect(screen.queryByRole('dialog', { name: /switch library/i })).not.toBeInTheDocument()
  })
})
