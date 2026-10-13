import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PaperLabs from './PaperLabs'
import { labsApi, papersApi } from '../services/api'

vi.mock('../services/api', () => ({ papersApi: { labs: vi.fn() }, labsApi: { list: vi.fn(), addPapers: vi.fn() } }))
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

const linkedLab = { id: 'lab_1', name: 'Language Lab' }
const availableLab = { id: 'lab_2', name: 'Vision Lab' }
const labPage = (items, total = items.length, offset = 0) => ({ items, total, offset, limit: 10 })

it('adds to existing labs, preserves links, and prevents duplicate submissions', async () => {
  papersApi.labs.mockResolvedValue([linkedLab])
  labsApi.list.mockResolvedValue(labPage([linkedLab, availableLab]))
  let finishAdd
  labsApi.addPapers.mockReturnValue(new Promise(resolve => { finishAdd = resolve }))
  render(<MemoryRouter><PaperLabs paperId="p1" /></MemoryRouter>)
  await screen.findByRole('link', { name: linkedLab.name })
  expect(labsApi.list).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Add to lab' }))
  const add = await screen.findByRole('button', { name: 'Add to Vision Lab' })
  expect(screen.getByText('Already linked')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add to Language Lab' })).not.toBeInTheDocument()
  fireEvent.click(add)
  expect(add).toBeDisabled()
  expect(labsApi.addPapers).toHaveBeenCalledWith('lab_2', ['p1'])
  await act(async () => finishAdd({ addedCount: 1 }))
  expect(screen.getByRole('link', { name: availableLab.name })).toHaveAttribute('href', '/labs/lab_2')
  expect(screen.getByRole('link', { name: linkedLab.name })).toBeInTheDocument()
  expect(screen.getAllByText('Already linked')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(screen.queryByRole('textbox', { name: 'Search existing labs' })).not.toBeInTheDocument()
})

it('retries directory and save errors without displaying an unsaved link', async () => {
  papersApi.labs.mockResolvedValue([])
  labsApi.list.mockRejectedValueOnce(new Error('Directory unavailable')).mockResolvedValue(labPage([availableLab]))
  labsApi.addPapers.mockRejectedValueOnce(new Error('Link failed')).mockResolvedValue({ addedCount: 1 })
  render(<MemoryRouter><PaperLabs paperId="p1" /></MemoryRouter>)
  await screen.findByText('No labs linked to this paper.')
  fireEvent.click(screen.getByRole('button', { name: 'Add to lab' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Directory unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Add to Vision Lab' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Link failed')
  expect(screen.queryByRole('link', { name: availableLab.name })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add to Vision Lab' }))
  expect(await screen.findByRole('link', { name: availableLab.name })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('paginates labs and resets the page when searching', async () => {
  papersApi.labs.mockResolvedValue([])
  labsApi.list.mockResolvedValueOnce(labPage([linkedLab], 11)).mockResolvedValueOnce(labPage([availableLab], 11, 10)).mockResolvedValueOnce(labPage([]))
  render(<MemoryRouter><PaperLabs paperId="p1" /></MemoryRouter>)
  await screen.findByText('No labs linked to this paper.')
  fireEvent.click(screen.getByRole('button', { name: 'Add to lab' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
  await screen.findByRole('button', { name: 'Add to Vision Lab' })
  expect(labsApi.list).toHaveBeenLastCalledWith({ search: '', offset: 10, limit: 10 })
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search existing labs' }), { target: { value: ' missing ' } })
  await screen.findByText('No labs match this search.')
  expect(labsApi.list).toHaveBeenLastCalledWith({ search: 'missing', offset: 0, limit: 10 })
})

it('resets the picker and ignores a pending addition when switching papers', async () => {
  papersApi.labs.mockResolvedValue([])
  labsApi.list.mockResolvedValue(labPage([availableLab]))
  let finishAdd
  labsApi.addPapers.mockReturnValue(new Promise(resolve => { finishAdd = resolve }))
  const view = render(<MemoryRouter><PaperLabs paperId="p1" /></MemoryRouter>)
  await screen.findByText('No labs linked to this paper.')
  fireEvent.click(screen.getByRole('button', { name: 'Add to lab' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Add to Vision Lab' }))
  view.rerender(<MemoryRouter><PaperLabs paperId="p2" /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add to lab' })).toBeEnabled())
  await act(async () => finishAdd({ addedCount: 1 }))
  expect(screen.queryByRole('link', { name: availableLab.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Search existing labs' })).not.toBeInTheDocument()
})
