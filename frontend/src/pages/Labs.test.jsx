import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Labs from './Labs'
import { labsApi } from '../services/api'

vi.mock('../services/api', () => ({ labsApi: {
  list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  members: vi.fn(), memberOptions: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(), papers: vi.fn(),
} }))

const lab = { id: 'lab_1', name: 'Language Lab', description: 'Language research', createdAt: '2026-10-07' }
const member = { authorId: 'a_1', name: 'Jane Smith', orcid: null }
const paper = { id: 'p_1', title: 'Shared research', authors: ['Jane Smith'], year: 2026, venue: 'ICLR', status: 'read', libraryName: 'Research' }
const page = (items, limit = 25, total = items.length, offset = 0) => ({ items, limit, total, offset })
const mount = (path = '/labs?lab=lab_1') => render(<MemoryRouter initialEntries={[path]}><Labs /></MemoryRouter>)

beforeEach(() => {
  vi.resetAllMocks()
  labsApi.list.mockResolvedValue(page([lab], 30))
  labsApi.get.mockResolvedValue(lab)
  labsApi.members.mockResolvedValue(page([member], 50))
  labsApi.papers.mockResolvedValue(page([paper]))
  labsApi.memberOptions.mockResolvedValue([{ authorId: 'a_2', name: 'John Smith' }])
  labsApi.addMember.mockResolvedValue({ authorId: 'a_2', name: 'John Smith' })
  labsApi.removeMember.mockResolvedValue(null)
})

describe('Labs', () => {
  it('loads one bounded resource per section and links papers and authors', async () => {
    mount()
    expect(await screen.findByRole('link', { name: 'Shared research' })).toHaveAttribute('href', '/library/paper/p_1')
    expect(screen.getByRole('link', { name: 'Jane Smith' })).toHaveAttribute('href', '/authors/a_1')
    expect(screen.getByText('Research')).toBeInTheDocument()
    for (const method of ['list', 'get', 'members', 'papers']) expect(labsApi[method]).toHaveBeenCalledTimes(1)
    expect(labsApi.memberOptions).not.toHaveBeenCalled()
  })

  it('creates a lab from the empty state and opens it', async () => {
    labsApi.list.mockResolvedValue(page([], 30))
    labsApi.create.mockResolvedValue(lab)
    mount('/labs')
    expect(await screen.findByText('No labs yet. Create your first lab to get started.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create lab' }))
    fireEvent.change(screen.getByLabelText('Lab name'), { target: { value: ' Language Lab ' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Create lab' }).at(-1))
    await screen.findByRole('heading', { name: lab.name })
    expect(labsApi.create).toHaveBeenCalledWith({ name: 'Language Lab', description: null })
  })

  it('debounces paper search and refreshes only the paper section', async () => {
    mount()
    await screen.findByRole('link', { name: paper.title })
    const search = screen.getByRole('textbox', { name: 'Search lab papers' })
    fireEvent.change(search, { target: { value: 'Sh' } })
    fireEvent.change(search, { target: { value: 'Shared' } })
    await waitFor(() => expect(labsApi.papers).toHaveBeenCalledTimes(2))
    expect(labsApi.papers).toHaveBeenLastCalledWith('lab_1', { search: 'Shared', offset: 0, limit: 25 })
    expect(labsApi.members).toHaveBeenCalledTimes(1)
    expect(labsApi.list).toHaveBeenCalledTimes(1)
    expect(labsApi.get).toHaveBeenCalledTimes(1)
  })

  it('shows member errors, allows retry, and refreshes only affected sections after adding', async () => {
    labsApi.addMember.mockRejectedValueOnce(new Error('Could not add author'))
    mount()
    await screen.findByRole('button', { name: 'Add members' })
    fireEvent.click(screen.getByRole('button', { name: 'Add members' }))
    expect(labsApi.memberOptions).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Search authors'), { target: { value: 'John' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Add John Smith' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add author')
    fireEvent.click(screen.getByRole('button', { name: 'Add John Smith' }))
    await screen.findByText('John Smith added.')
    await waitFor(() => expect(labsApi.papers).toHaveBeenCalledTimes(2))
    expect(labsApi.members).toHaveBeenCalledTimes(2)
    expect(labsApi.get).toHaveBeenCalledTimes(1)
    expect(labsApi.list).toHaveBeenCalledTimes(1)
  })

  it('paginates papers independently and resets to the first page after member removal', async () => {
    labsApi.papers.mockResolvedValueOnce(page([paper], 25, 26)).mockResolvedValueOnce(page([paper], 25, 26, 25)).mockResolvedValue(page([], 25))
    mount()
    await screen.findByRole('link', { name: paper.title })
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Papers pagination' })).getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(labsApi.papers).toHaveBeenLastCalledWith('lab_1', { search: '', offset: 25, limit: 25 }))
    await screen.findByText('26–26 of 26')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Jane Smith' }))
    await waitFor(() => expect(labsApi.papers).toHaveBeenLastCalledWith('lab_1', { search: '', offset: 0, limit: 25 }))
    expect(labsApi.removeMember).toHaveBeenCalledWith('lab_1', 'a_1')
  })

  it('keeps edit form values on error and updates metadata without reloading papers', async () => {
    labsApi.update.mockRejectedValueOnce(new Error('Save failed')).mockResolvedValue({ ...lab, name: 'Renamed lab', description: null })
    mount()
    await screen.findByRole('link', { name: paper.title })
    fireEvent.click(screen.getByRole('button', { name: 'Edit lab' }))
    fireEvent.change(screen.getByLabelText('Lab name'), { target: { value: 'Renamed lab' } })
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
    expect(screen.getByLabelText('Lab name')).toHaveValue('Renamed lab')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { name: 'Renamed lab' })
    expect(labsApi.update).toHaveBeenLastCalledWith('lab_1', { name: 'Renamed lab', description: null })
    expect(labsApi.papers).toHaveBeenCalledTimes(1)
  })

  it('ignores late responses from a previously selected lab', async () => {
    let resolveOld
    labsApi.list.mockResolvedValue(page([lab, { ...lab, id: 'lab_2', name: 'Vision Lab' }], 30))
    labsApi.papers.mockImplementation(id => id === 'lab_1' ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve(page([{ ...paper, id: 'p_2', title: 'Vision paper' }])))
    labsApi.get.mockImplementation(id => Promise.resolve(id === 'lab_1' ? lab : { ...lab, id, name: 'Vision Lab' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Vision Lab' }))
    await screen.findByRole('link', { name: 'Vision paper' })
    await act(async () => resolveOld(page([paper])))
    expect(screen.queryByRole('link', { name: paper.title })).not.toBeInTheDocument()
  })

  it('retries a failed section and confirms deletion before removing a lab', async () => {
    labsApi.papers.mockRejectedValueOnce(new Error('Paper load failed')).mockResolvedValue(page([paper]))
    labsApi.remove.mockResolvedValue(null)
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Paper load failed')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('link', { name: paper.title })
    fireEvent.click(screen.getByRole('button', { name: 'Delete lab' }))
    expect(labsApi.remove).not.toHaveBeenCalled()
    expect(screen.getByText(/Author profiles and papers will be kept/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await screen.findByText('Select a lab to explore its work')
    expect(labsApi.remove).toHaveBeenCalledWith('lab_1')
  })
})
