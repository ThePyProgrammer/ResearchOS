import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import AuthorDetail from './AuthorDetail'
import { authorsApi } from '../services/api'

vi.mock('../services/api', () => ({ authorsApi: { get: vi.fn(), papers: vi.fn() }, papersApi: {} }))
vi.mock('../context/LibraryContext', () => ({ useLibrary: () => ({ libraries: [], switchLibrary: vi.fn() }) }))
beforeEach(() => { vi.clearAllMocks(); authorsApi.papers.mockResolvedValue([]) })
const mount = () => render(<MemoryRouter initialEntries={['/authors/a1']}><Routes><Route path="/authors/:id" element={<AuthorDetail />} /></Routes></MemoryRouter>)

it('shows linked labs and both roles using the existing profile response', async () => {
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', paperCount: 0, labs: [
    { id: 'l1', name: 'Language Lab', isMember: true, isPi: true },
    { id: 'l2', name: 'Vision Lab', isMember: true, isPi: false },
  ] })
  mount()
  const labs = within(await screen.findByRole('region', { name: 'Author labs' }))
  expect(labs.getByRole('link', { name: /Language Lab PI.*Member/ })).toHaveAttribute('href', '/labs?lab=l1')
  expect(labs.getByRole('link', { name: 'Vision Lab Member' })).toHaveAttribute('href', '/labs?lab=l2')
  expect(authorsApi.get).toHaveBeenCalledTimes(1)
  expect(authorsApi.papers).toHaveBeenCalledTimes(1)
})

it('shows an explicit empty state for authors without labs', async () => {
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', paperCount: 0, labs: [] })
  mount()
  expect(await screen.findByText('No labs associated.')).toBeInTheDocument()
})
