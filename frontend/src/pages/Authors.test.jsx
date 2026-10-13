import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Authors from './Authors'
import { authorsApi } from '../services/api'

vi.mock('../services/api', () => ({ authorsApi: { list: vi.fn(), create: vi.fn(), suggestions: vi.fn() } }))
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); authorsApi.suggestions.mockResolvedValue([]) })
afterEach(() => vi.useRealTimers())
const author = name => ({ id: name, name, paperCount: 0 })

it('reaches authors beyond the first fifty and returns to the previous page', async () => {
  const firstPage = Array.from({ length: 51 }, (_, i) => author(`Author ${i}`))
  const lastPage = [...Array.from({ length: 7 }, (_, i) => author(`Later author ${i}`)), author('Yann LeCun')]
  authorsApi.list.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(lastPage).mockResolvedValue(firstPage)
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('Showing 1–50 authors')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Open Author 50' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(authorsApi.list).toHaveBeenLastCalledWith({ search: undefined, limit: 51, offset: 50 })
  expect(screen.getByRole('link', { name: 'Open Yann LeCun' })).toBeInTheDocument()
  expect(screen.getByText('Showing 51–58 authors')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('link', { name: 'Open Author 0' })).toBeInTheDocument()
})

it('retries a failed page and resets pagination when the search changes', async () => {
  const firstPage = Array.from({ length: 51 }, (_, i) => author(`Author ${i}`))
  authorsApi.list.mockResolvedValueOnce(firstPage).mockRejectedValueOnce(new Error('Page unavailable'))
    .mockResolvedValueOnce([author('Yann LeCun')]).mockResolvedValue([author('Jane')])
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('alert')).toHaveTextContent('Page unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(authorsApi.list).toHaveBeenLastCalledWith({ search: undefined, limit: 51, offset: 50 })
  expect(screen.getByRole('link', { name: 'Open Yann LeCun' })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search authors' }), { target: { value: 'Jane' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  expect(authorsApi.list).toHaveBeenLastCalledWith({ search: 'Jane', limit: 51, offset: 0 })
  expect(screen.getByRole('link', { name: 'Open Jane' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Author pages' })).not.toBeInTheDocument()
})

it('ignores an old page response after changing search', async () => {
  let resolvePage
  authorsApi.list.mockResolvedValueOnce(Array.from({ length: 51 }, (_, i) => author(`Author ${i}`)))
    .mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve }))
    .mockResolvedValue([author('Jane')])
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  fireEvent.change(screen.getByRole('textbox', { name: 'Search authors' }), { target: { value: 'Jane' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  await act(async () => { resolvePage([author('Old result')]) })
  expect(screen.getByRole('link', { name: 'Open Jane' })).toBeInTheDocument()
  expect(screen.queryByText('Old result')).not.toBeInTheDocument()
})

it('debounces typing and ignores an older response', async () => {
  let resolveInitial
  authorsApi.list.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve }))
    .mockResolvedValue([author('Jane')])
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  const search = screen.getByRole('textbox', { name: 'Search authors' })
  fireEvent.change(search, { target: { value: 'J' } })
  fireEvent.change(search, { target: { value: 'Jane' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(299) })
  expect(authorsApi.list).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(authorsApi.list).toHaveBeenCalledTimes(2)
  expect(authorsApi.list).toHaveBeenLastCalledWith({ search: 'Jane', limit: 51, offset: 0 })
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


it('shows frequent names immediately and supports filtering and keyboard selection', async () => {
  authorsApi.list.mockResolvedValue([])
  authorsApi.suggestions.mockResolvedValue([{ name: 'Jane Smith', paperCount: 5 }, { name: 'Alex Doe', paperCount: 2 }])
  authorsApi.create.mockResolvedValue({ id: 'a1', name: 'Alex Doe' })
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add Author' })) })
  const input = screen.getByRole('combobox', { name: 'Name *' })
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Jane Smith5 papers', 'Alex Doe2 papers'])
  fireEvent.change(input, { target: { value: '  alex  ' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option').id)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(input).toHaveValue('Alex Doe')
  expect(input).toHaveAttribute('aria-expanded', 'false')
  expect(authorsApi.create).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true })) })
  expect(authorsApi.create).toHaveBeenCalledWith({ name: 'Alex Doe', orcid: null, linkedinUrl: null, twitterUrl: null })
})

it('supports mouse selection, dismissing suggestions, and entering a custom name', async () => {
  authorsApi.list.mockResolvedValue([])
  authorsApi.suggestions.mockResolvedValue([{ name: 'Jane Smith', paperCount: 3 }])
  authorsApi.create.mockResolvedValue({ id: 'a1', name: 'Custom Name' })
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add Author' })) })
  const input = screen.getByRole('combobox')
  fireEvent.click(screen.getByRole('option'))
  expect(input).toHaveValue('Jane Smith')
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(input).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(input).toHaveValue('Jane Smith')
  expect(input).toHaveAttribute('aria-expanded', 'false')
  fireEvent.change(input, { target: { value: 'Custom Name' } })
  expect(screen.getByText('No matching suggestions. You can use this name.')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true })) })
  expect(authorsApi.create).toHaveBeenCalledWith({ name: 'Custom Name', orcid: null, linkedinUrl: null, twitterUrl: null })
})

it('allows manual creation when suggestions fail and can retry suggestions', async () => {
  authorsApi.list.mockResolvedValue([])
  authorsApi.suggestions.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce([])
  render(<MemoryRouter><Authors /></MemoryRouter>)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add Author' })) })
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load suggestions: Unavailable')
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'My Author' } })
  expect(screen.getByRole('button', { name: 'Create', exact: true })).toBeEnabled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry suggestions' })) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox')).toHaveValue('My Author')
  expect(screen.getByText('No new author suggestions from your papers. Type any name to add an author.')).toBeInTheDocument()
})
