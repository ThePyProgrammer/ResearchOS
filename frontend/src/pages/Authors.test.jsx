import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Authors from './Authors'
import { authorsApi } from '../services/api'

vi.mock('../services/api', () => ({ authorsApi: { list: vi.fn() } }))
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


it('shows lab roles and opens the lab without triggering author row navigation', async () => {
  authorsApi.list.mockResolvedValue([{ ...author('Jane'), labs: [
    { id: 'lab 1', name: 'Language Lab', isMember: true, isPi: true },
    { id: 'lab_2', name: 'Vision Lab', isMember: false, isPi: true },
  ] }])
  render(<MemoryRouter initialEntries={['/authors']}><Routes>
    <Route path="/authors" element={<Authors />} />
    <Route path="/labs" element={<p>Lab destination</p>} />
    <Route path="/authors/:id" element={<p>Author destination</p>} />
  </Routes></MemoryRouter>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('columnheader', { name: 'Labs' })).toBeInTheDocument()
  const link = screen.getByRole('link', { name: /Language Lab PI.*Member/ })
  expect(link).toHaveAttribute('href', '/labs?lab=lab%201')
  expect(screen.getByRole('link', { name: 'Vision Lab PI' })).toBeInTheDocument()
  fireEvent.click(link)
  expect(screen.getByText('Lab destination')).toBeInTheDocument()
  expect(screen.queryByText('Author destination')).not.toBeInTheDocument()
  expect(authorsApi.list).toHaveBeenCalledTimes(1)
})
