import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
