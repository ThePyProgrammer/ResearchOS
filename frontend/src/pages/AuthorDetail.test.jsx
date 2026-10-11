import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import AuthorDetail from './AuthorDetail'
import { authorsApi, papersApi, labsApi } from '../services/api'

vi.mock('../services/api', () => ({ authorsApi: { get: vi.fn(), papers: vi.fn(), update: vi.fn(), potentialPapers: vi.fn() }, papersApi: { linkAuthor: vi.fn(), unlinkAuthor: vi.fn() }, labsApi: { list: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(), addPi: vi.fn(), removePi: vi.fn() } }))
vi.mock('../context/LibraryContext', () => ({ useLibrary: () => ({ libraries: [], switchLibrary: vi.fn() }) }))
beforeEach(() => { vi.clearAllMocks(); authorsApi.papers.mockResolvedValue([]) })
const mount = () => render(<MemoryRouter initialEntries={['/authors/a1']}><Routes><Route path="/authors/:id" element={<AuthorDetail />} /></Routes></MemoryRouter>)

it('shows linked labs with the PI role taking precedence using the existing profile response', async () => {
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', paperCount: 0, labs: [
    { id: 'l1', name: 'Language Lab', isMember: true, isPi: true },
    { id: 'l2', name: 'Vision Lab', isMember: true, isPi: false },
  ] })
  mount()
  const labs = within(await screen.findByRole('region', { name: 'Author labs' }))
  expect(labs.getByRole('link', { name: 'Language Lab PI' })).toHaveAttribute('href', '/labs/l1')
  expect(labs.getByRole('link', { name: 'Vision Lab Member' })).toHaveAttribute('href', '/labs/l2')
  expect(authorsApi.get).toHaveBeenCalledTimes(1)
  expect(authorsApi.papers).toHaveBeenCalledTimes(1)
})

it('shows an explicit empty state for authors without labs', async () => {
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', paperCount: 0, labs: [] })
  mount()
  expect(await screen.findByText('No labs associated.')).toBeInTheDocument()
})


it('links potential papers from the modal with the matched author position and supports unlinking', async () => {
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', labs: [] })
  const paper = { id: 'p1', title: 'Shared research', authors: ['Alex', 'J. Smith'], year: 2026 }
  authorsApi.potentialPapers.mockResolvedValue([{ paper, rawName: 'J. Smith', confidence: 'likely' }])
  papersApi.linkAuthor.mockRejectedValueOnce(new Error('Link failed')).mockResolvedValueOnce({})
  papersApi.unlinkAuthor.mockResolvedValue(undefined)
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Link paper', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Link Shared research' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Link failed')
  fireEvent.click(screen.getByRole('button', { name: 'Link Shared research' }))
  await screen.findByText('Linked “Shared research”.')
  expect(papersApi.linkAuthor).toHaveBeenLastCalledWith('p1', 'a1', 1, 'J. Smith')
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  const table = within(screen.getByRole('region', { name: 'Author papers' }))
  expect(table.getByRole('link', { name: 'Shared research' })).toHaveAttribute('href', '/library/paper/p1')
  expect(table.getByRole('columnheader', { name: 'Year' })).toBeInTheDocument()
  fireEvent.click(table.getByRole('button', { name: 'Unlink paper Shared research' }))
  await waitFor(() => expect(table.queryByRole('link', { name: 'Shared research' })).not.toBeInTheDocument())
  expect(papersApi.unlinkAuthor).toHaveBeenCalledWith('p1', 'a1')
})

it('shows a retryable potential-paper loading error', async () => {
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', labs: [] })
  authorsApi.potentialPapers.mockRejectedValueOnce(new Error('Matches unavailable')).mockResolvedValueOnce([])
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Link paper', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Matches unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading matches' }))
  expect(await screen.findByText('No potential matches found.')).toBeInTheDocument()
})

it('persists reordered affiliations including their dates and keeps the old order on failure', async () => {
  const first = { institution: 'First University', role: 'Professor', startDate: '2020', endDate: null }
  const second = { institution: 'Second University', role: 'Researcher', startDate: '2016', endDate: '2020' }
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', labs: [], affiliations: [first, second] })
  authorsApi.update.mockRejectedValueOnce(new Error('Save failed')).mockResolvedValueOnce({ affiliations: [second, first] })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Move Second University up' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
  const affiliations = within(screen.getByRole('region', { name: 'Author affiliations' }))
  expect(affiliations.getAllByRole('listitem')[0]).toHaveTextContent('First University')
  fireEvent.click(screen.getByRole('button', { name: 'Move Second University up' }))
  await waitFor(() => expect(affiliations.getAllByRole('listitem')[0]).toHaveTextContent('Second University'))
  expect(authorsApi.update).toHaveBeenLastCalledWith('a1', { affiliations: [second, first] })
  expect(screen.getByRole('button', { name: 'Move Second University up' })).toBeDisabled()
})

it('keeps the profile editor open after a failed save and saves only on submit', async () => {
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', labs: [], websiteUrl: 'https://old.example' })
  authorsApi.update.mockRejectedValueOnce(new Error('Profile save failed')).mockResolvedValueOnce({ websiteUrl: 'https://new.example' })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Website' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Website' }), { target: { value: 'https://new.example' } })
  fireEvent.blur(screen.getByRole('textbox', { name: 'Website' }))
  expect(authorsApi.update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Profile save failed')
  expect(screen.getByRole('textbox', { name: 'Website' })).toHaveValue('https://new.example')
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  expect(await screen.findByRole('link', { name: 'new.example' })).toHaveAttribute('href', 'https://new.example')
})

it('manages membership and PI roles without replacing other PIs or leaving the author page', async () => {
  authorsApi.get.mockResolvedValue({ id: 'a1', name: 'Jane', labs: [] })
  labsApi.list.mockResolvedValue({ items: [{ id: 'l1', name: 'Language Lab' }], total: 1, offset: 0, limit: 20 })
  labsApi.addMember.mockRejectedValueOnce(new Error('Membership failed')).mockResolvedValueOnce({})
  labsApi.addPi.mockResolvedValue({})
  labsApi.removePi.mockResolvedValue({})
  labsApi.removeMember.mockResolvedValue(undefined)
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Manage labs' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Join Language Lab' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Membership failed')
  fireEvent.click(screen.getByRole('button', { name: 'Join Language Lab' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Make PI in Language Lab' }))
  await screen.findByRole('button', { name: 'Remove PI role in Language Lab' })
  expect(labsApi.addPi).toHaveBeenCalledWith('l1', 'a1')
  expect(screen.getByRole('link', { name: 'Language Lab PI' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove PI role in Language Lab' }))
  await screen.findByRole('button', { name: 'Make PI in Language Lab' })
  expect(labsApi.removePi).toHaveBeenCalledWith('l1', 'a1')
  expect(screen.getByRole('link', { name: 'Language Lab Member' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove membership in Language Lab' }))
  await screen.findByRole('button', { name: 'Join Language Lab' })
  expect(labsApi.removeMember).toHaveBeenCalledWith('l1', 'a1')
})
