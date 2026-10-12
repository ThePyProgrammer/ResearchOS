import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PaperLabs from './PaperLabs'
import { papersApi } from '../services/api'

vi.mock('../services/api', () => ({ papersApi: { labs: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())

it('shows linked labs and an explicit empty state', async () => {
  papersApi.labs.mockResolvedValueOnce([{ id: 'lab_1', name: 'Language Lab' }, { id: 'lab_2', name: 'Vision Lab' }]).mockResolvedValueOnce([])
  const view = render(<MemoryRouter><PaperLabs paperId="p1" /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: 'Language Lab' })).toHaveAttribute('href', '/labs/lab_1')
  expect(screen.getByRole('link', { name: 'Vision Lab' })).toHaveAttribute('href', '/labs/lab_2')
  view.rerender(<MemoryRouter><PaperLabs paperId="p2" /></MemoryRouter>)
  expect(await screen.findByText('No labs linked to this paper.')).toBeInTheDocument()
  expect(screen.queryByText('Language Lab')).not.toBeInTheDocument()
})

it('surfaces failures and retries', async () => {
  papersApi.labs.mockRejectedValueOnce(new Error('Labs unavailable')).mockResolvedValueOnce([])
  render(<MemoryRouter><PaperLabs paperId="p1" /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Labs unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No labs linked to this paper.')).toBeInTheDocument()
  expect(papersApi.labs).toHaveBeenCalledTimes(2)
})

it('ignores responses from a previously selected paper', async () => {
  let resolveOld
  papersApi.labs.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce([{ id: 'new', name: 'Current Lab' }])
  const view = render(<MemoryRouter><PaperLabs paperId="p1" /></MemoryRouter>)
  view.rerender(<MemoryRouter><PaperLabs paperId="p2" /></MemoryRouter>)
  await screen.findByText('Current Lab')
  await act(async () => resolveOld([{ id: 'old', name: 'Old Lab' }]))
  expect(screen.queryByText('Old Lab')).not.toBeInTheDocument()
  expect(screen.getByText('Current Lab')).toBeInTheDocument()
})
