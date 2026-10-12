import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Authors from './Authors'
import { authorsApi } from '../services/api'

vi.mock('../services/api', () => ({ authorsApi: { list: vi.fn(), create: vi.fn() } }))
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => vi.useRealTimers())
const author = name => ({ id: name, name, paperCount: 0 })

it('debounces typing and ignores an older response', async () => {
  let resolveInitial
  authorsApi.list.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve }))
    .mockResolvedValue([author('Jane')])
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  const search = screen.getByPlaceholderText('Search authors...')
  fireEvent.change(search, { target: { value: 'J' } })
  fireEvent.change(search, { target: { value: 'Jane' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(299) })
  expect(authorsApi.list).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(authorsApi.list).toHaveBeenCalledTimes(2)
  expect(authorsApi.list).toHaveBeenLastCalledWith({ search: 'Jane' })
  expect(screen.getByText('Jane')).toBeInTheDocument()
  await act(async () => { resolveInitial([author('Old')]) })
  expect(screen.queryByText('Old')).not.toBeInTheDocument()
  expect(screen.getByText('Jane')).toBeInTheDocument()
})

it('shows request failures', async () => {
  authorsApi.list.mockRejectedValue(new Error('Authors unavailable'))
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('Authors unavailable')).toBeInTheDocument()
})


it('shows lab roles and opens the lab without triggering author card navigation', async () => {
  authorsApi.list.mockResolvedValue([{ ...author('Jane'), labs: [
    { id: 'lab 1', name: 'Language Lab', isMember: true, isPi: true },
    { id: 'lab_2', name: 'Vision Lab', isMember: false, isPi: true },
  ] }])
  render(<MemoryRouter initialEntries={['/authors']}><Routes>
    <Route path="/authors" element={<Authors />} />
    <Route path="/labs/:id" element={<p>Lab destination</p>} />
    <Route path="/authors/:id" element={<p>Author destination</p>} />
  </Routes></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('list', { name: 'Authors directory' })).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  const link = screen.getByRole('link', { name: 'Language Lab PI' })
  expect(link).toHaveAttribute('href', '/labs/lab%201')
  expect(screen.getByRole('link', { name: 'Vision Lab PI' })).toBeInTheDocument()
  fireEvent.click(link)
  expect(screen.getByText('Lab destination')).toBeInTheDocument()
  expect(screen.queryByText('Author destination')).not.toBeInTheDocument()
  expect(authorsApi.list).toHaveBeenCalledTimes(1)
})


it('renders compact cards with affiliations, counts and independent profile links', async () => {
  authorsApi.list.mockResolvedValue([{ ...author('Jane Smith'), id: 'author 1', paperCount: 1,
    affiliations: [{ institution: 'Old university', endDate: '2020' }, { institution: 'Current university' }],
    orcid: '0000-0001-2345-6789', websiteUrl: 'https://example.org/',
  }, author('Alex')])
  render(<MemoryRouter initialEntries={['/authors']}><Routes>
    <Route path="/authors" element={<Authors />} />
    <Route path="/authors/:id" element={<p>Author destination</p>} />
  </Routes></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('Current university')).toBeInTheDocument()
  expect(screen.queryByText('Old university')).not.toBeInTheDocument()
  expect(screen.getByText('1 paper')).toBeInTheDocument()
  expect(screen.getByText('0 papers')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Website for Jane Smith' })).toHaveAttribute('href', 'https://example.org/')
  expect(screen.getByRole('link', { name: 'ORCID for Jane Smith' })).toHaveAttribute('rel', 'noopener noreferrer')
  const card = screen.getByRole('link', { name: 'Open Jane Smith' })
  expect(card).toHaveAttribute('href', '/authors/author%201')
  fireEvent.click(card)
  expect(screen.getByText('Author destination')).toBeInTheDocument()
  expect(authorsApi.list).toHaveBeenCalledTimes(1)
})

it('retries failed loads and clears an empty search', async () => {
  authorsApi.list.mockRejectedValueOnce(new Error('Authors unavailable')).mockResolvedValueOnce([]).mockResolvedValue([author('Jane')])
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('No authors yet. Add one to get started.')).toBeInTheDocument()
  authorsApi.list.mockResolvedValueOnce([])
  fireEvent.change(screen.getByRole('textbox', { name: 'Search authors' }), { target: { value: 'Missing' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  expect(screen.getByText('No authors match your search')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('link', { name: 'Open Jane' })).toBeInTheDocument()
})

it('renders branded profile links including LinkedIn and legacy Twitter URLs', async () => {
  authorsApi.list.mockResolvedValue([{ ...author('Jane'), orcid: '0000-0001-2345-6789', githubUsername: 'jane', googleScholarUrl: 'https://scholar.google.com/citations?user=jane', openreviewUrl: 'https://openreview.net/profile?id=jane', linkedinUrl: 'https://www.linkedin.com/in/jane', twitterUrl: 'https://twitter.com/jane' }])
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  for (const label of ['ORCID', 'GitHub', 'Google Scholar', 'LinkedIn', 'X / Twitter']) {
    const link = screen.getByRole('link', { name: label + ' for Jane' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.querySelector('img')).toHaveAttribute('alt', '')
    expect(link.querySelector('.material-symbols-outlined')).toBeNull()
  }
  expect(screen.getByRole('link', { name: 'OpenReview for Jane' })).toHaveTextContent('rate_review')
  expect(screen.getByRole('link', { name: 'LinkedIn for Jane' })).toHaveAttribute('href', 'https://www.linkedin.com/in/jane')
  expect(screen.getByRole('link', { name: 'X / Twitter for Jane' })).toHaveAttribute('href', 'https://twitter.com/jane')
})

it('creates an author with social profiles and retains values after failure', async () => {
  authorsApi.list.mockResolvedValue([])
  authorsApi.create.mockRejectedValueOnce(new Error('Save failed')).mockResolvedValueOnce({ id: 'a1', name: 'Jane' })
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  fireEvent.click(screen.getByRole('button', { name: 'Add Author' }))
  fireEvent.change(screen.getByPlaceholderText('e.g. John Smith'), { target: { value: 'Jane' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'LinkedIn' }), { target: { value: 'https://www.linkedin.com/in/jane' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'X / Twitter' }), { target: { value: 'https://x.com/jane' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true })) })
  expect(screen.getByRole('alert')).toHaveTextContent('Failed to create author: Save failed')
  expect(screen.getByRole('textbox', { name: 'X / Twitter' })).toHaveValue('https://x.com/jane')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true })) })
  expect(authorsApi.create).toHaveBeenLastCalledWith({ name: 'Jane', orcid: null, linkedinUrl: 'https://www.linkedin.com/in/jane', twitterUrl: 'https://x.com/jane' })
  expect(screen.queryByRole('textbox', { name: 'LinkedIn' })).not.toBeInTheDocument()
})
