import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LibrarySwitcherModal from './LibrarySwitcherModal'
import { papersApi, websitesApi, githubReposApi } from '../../services/api'

vi.mock('../../services/api', () => ({
  papersApi: { list: vi.fn() },
  websitesApi: { list: vi.fn() },
  githubReposApi: { list: vi.fn() },
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

function renderModal(overrides = {}) {
  const props = {
    open: true,
    libraries,
    activeLibrary: libraries[0],
    switchLibrary: vi.fn(),
    createLibrary: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }

  const result = render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LibrarySwitcherModal {...props} />} />
        <Route path="/library" element={<div data-testid="library-route">Library route</div>} />
      </Routes>
    </MemoryRouter>
  )

  return { ...result, props }
}

function resolveSummaries() {
  papersApi.list.mockImplementation(({ library_id }) => Promise.resolve(
    library_id === 'lib_1'
      ? [
        { id: 'p_1', createdAt: '2026-03-02T00:00:00Z' },
        { id: 'p_2', createdAt: '2026-03-04T00:00:00Z' },
      ]
      : []
  ))
  websitesApi.list.mockImplementation(({ library_id }) => Promise.resolve(
    library_id === 'lib_1'
      ? [{ id: 'w_1', createdAt: '2026-03-03T00:00:00Z' }]
      : []
  ))
  githubReposApi.list.mockResolvedValue([])
}

describe('LibrarySwitcherModal', () => {
  beforeEach(() => {
    papersApi.list.mockReset()
    websitesApi.list.mockReset()
    githubReposApi.list.mockReset()
    resolveSummaries()
  })

  it('renders the switcher with focused search, active row, metadata, counts, and sparkline', async () => {
    renderModal()

    expect(screen.getByRole('dialog', { name: /switch library/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/find a library/i)).toHaveFocus()

    const activeRow = screen.getByRole('button', { name: /AI Papers/i })
    expect(activeRow).toHaveAttribute('aria-current', 'true')
    expect(within(activeRow).getByText('Foundation model research')).toBeInTheDocument()

    await waitFor(() => expect(within(activeRow).getByText('3 items')).toBeInTheDocument())
    expect(within(activeRow).getByText('2 papers')).toBeInTheDocument()
    expect(within(activeRow).getByText('1 website')).toBeInTheDocument()
    expect(within(activeRow).getByText(/Created on/i)).toBeInTheDocument()
    expect(within(activeRow).getByText(/Last Updated on/i)).toBeInTheDocument()
    expect(within(activeRow).getByLabelText(/items added over time for AI Papers/i)).toBeInTheDocument()
  })

  it('shows an empty summary and no-activity sparkline for a library with no items', async () => {
    renderModal()

    const emptyRow = screen.getByRole('button', { name: /Robotics Survey/i })
    await waitFor(() => expect(within(emptyRow).getByText('No items yet')).toBeInTheDocument())

    expect(within(emptyRow).getByText(/Created on/i)).toBeInTheDocument()
    expect(within(emptyRow).getByText(/Last Updated on/i)).toBeInTheDocument()
    expect(within(emptyRow).getByLabelText(/No activity for Robotics Survey/i)).toHaveTextContent('No activity')
  })

  it('filters libraries by name or description', async () => {
    renderModal()
    await waitFor(() => expect(screen.getByText('3 items')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/find a library/i), { target: { value: 'embodied' } })

    expect(screen.queryByRole('button', { name: /AI Papers/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Robotics Survey/i })).toBeInTheDocument()
  })

  it('selects a library, closes the modal, and navigates to library route', async () => {
    const switchLibrary = vi.fn()
    const onClose = vi.fn()
    renderModal({ switchLibrary, onClose })
    await waitFor(() => expect(screen.getByText('3 items')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Robotics Survey/i }))

    expect(switchLibrary).toHaveBeenCalledWith('lib_2')
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByTestId('library-route')).toBeInTheDocument()
  })

  it('creates a new library inline, switches to it, closes the modal, and navigates to library route', async () => {
    const switchLibrary = vi.fn()
    const onClose = vi.fn()
    const createLibrary = vi.fn().mockResolvedValue({
      id: 'lib_3',
      name: 'New Library',
      createdAt: '2026-05-01T00:00:00Z',
    })
    renderModal({ createLibrary, switchLibrary, onClose })

    fireEvent.click(screen.getByRole('button', { name: /new library/i }))
    fireEvent.change(screen.getByLabelText(/library name/i), { target: { value: 'New Library' } })
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(createLibrary).toHaveBeenCalledWith('New Library'))
    expect(switchLibrary).toHaveBeenCalledWith('lib_3')
    expect(onClose).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('library-route')).toBeInTheDocument())
  })

  it('shows loading placeholders while keeping rows selectable', () => {
    papersApi.list.mockImplementation(() => new Promise(() => {}))
    websitesApi.list.mockImplementation(() => new Promise(() => {}))
    githubReposApi.list.mockImplementation(() => new Promise(() => {}))
    const switchLibrary = vi.fn()
    const onClose = vi.fn()
    renderModal({ switchLibrary, onClose })

    expect(screen.getAllByLabelText('Loading library activity')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /Robotics Survey/i }))
    expect(switchLibrary).toHaveBeenCalledWith('lib_2')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows summary errors while keeping rows selectable', async () => {
    papersApi.list.mockRejectedValue(new Error('papers failed'))
    websitesApi.list.mockRejectedValue(new Error('websites failed'))
    githubReposApi.list.mockRejectedValue(new Error('repos failed'))
    const switchLibrary = vi.fn()
    const onClose = vi.fn()
    renderModal({ switchLibrary, onClose })

    await waitFor(() => expect(screen.getAllByText(/Activity unavailable/i)).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: /Robotics Survey/i }))
    expect(switchLibrary).toHaveBeenCalledWith('lib_2')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows an empty state with inline creation when no libraries exist', () => {
    renderModal({ libraries: [], activeLibrary: null })

    const emptyState = screen.getByTestId('empty-library-state')
    expect(within(emptyState).getByText(/No libraries yet/i)).toBeInTheDocument()
    expect(within(emptyState).getByRole('button', { name: /new library/i })).toBeInTheDocument()
  })
})
