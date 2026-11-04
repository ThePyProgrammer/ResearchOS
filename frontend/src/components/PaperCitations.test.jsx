import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PaperCitations from './PaperCitations'
import { papersApi } from '../services/api'

vi.mock('../services/api', () => ({ papersApi: { citations: vi.fn(), reindexCitations: vi.fn(), reindexPdfCitations: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())
const page = (overrides = {}) => ({ items: [], total: 0, limit: 10, offset: 0, direction: 'outgoing',
  jobs: [], runs: [], unresolvedCount: 0, indexedPapers: 0, libraryPapers: 2, pendingJobs: 0, ...overrides })
const target = { id: 'p_b', title: 'Target paper', authors: ['A Writer'], year: 2024,
  evidence: [{ provider: 'openalex', method: 'exact_identifier', indexedAt: '2026-11-03T00:00:00Z',
    reference: { source_work: 'W1', target_work: 'W2' } }] }
function view(paperId = 'p_a') { return <MemoryRouter><PaperCitations paperId={paperId} libraryId="lib" /></MemoryRouter> }

it('shows direction and local navigation', async () => {
  papersApi.citations.mockResolvedValue(page({ items: [target], total: 1 }))
  render(view())
  expect(await screen.findByRole('link', { name: 'Target paper' })).toHaveAttribute('href', '/library/paper/p_b')
  expect(screen.getByRole('heading', { name: 'References in this library (1)' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cited by' }))
  await screen.findByRole('heading', { name: 'Cited by in this library (1)' })
  expect(papersApi.citations).toHaveBeenLastCalledWith('p_a', { direction: 'incoming', offset: 0, limit: 10 })
})

it('distinguishes unindexed, failed refresh, and previous evidence', async () => {
  papersApi.citations.mockResolvedValueOnce(page()).mockResolvedValue(page({
    items: [target], total: 1, jobs: [{ status: 'failed' }],
    runs: [{ active: true, indexedAt: '2026-11-03T00:00:00Z' }],
  }))
  const result = render(view())
  await screen.findByText('Not indexed yet.')
  result.rerender(view('p_other'))
  await screen.findByText('Indexing failed. Showing previous results.')
  expect(screen.getByRole('link', { name: 'Target paper' })).toBeInTheDocument()
  expect(screen.queryByText('Not indexed yet.')).not.toBeInTheDocument()
})

it('retries read failures without automatically indexing', async () => {
  papersApi.citations.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(page())
  render(view())
  expect(await screen.findByRole('alert')).toHaveTextContent('Citation data could not be loaded.')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('No linked references in this library yet.')
  expect(papersApi.reindexCitations).not.toHaveBeenCalled()
})

it('distinguishes retrieved references from missing library links', async () => {
  papersApi.citations.mockResolvedValue(page({ unresolvedCount: 175,
    jobs: [{ provider: 'crossref', status: 'not_found', error: 'No DOI available' }],
    runs: [{ active: true, provider: 'openalex', indexedAt: '2026-11-03T00:00:00Z' }],
  }))
  render(view())
  await screen.findByText('References were found, but none are linked to papers in this library yet.')
  expect(screen.getByText('175 references not linked to a paper in this library.')).toBeInTheDocument()
  expect(screen.queryByText('Some references could not be found.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cited by' }))
  await screen.findByText('No papers in this library are linked as citing this paper yet.')
  expect(screen.queryByText('175 references not linked to a paper in this library.')).not.toBeInTheDocument()
})

it('keeps the paper usable when a server returns a malformed citation response', async () => {
  papersApi.citations.mockResolvedValue([])
  render(view())
  expect(await screen.findByRole('alert')).toHaveTextContent('Citation data could not be loaded.')
  expect(screen.getByRole('heading', { name: 'Citations', exact: true })).toBeInTheDocument()
})

it('ignores a response from a previous paper', async () => {
  let resolveOld
  papersApi.citations.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValue(page())
  const result = render(view())
  result.rerender(view('p_other'))
  await screen.findByText('Not indexed yet.')
  await act(async () => resolveOld(page({ items: [target], total: 1 })))
  expect(screen.queryByText('Target paper')).not.toBeInTheDocument()
})

it('refreshes after source metadata changes on the same paper', async () => {
  papersApi.citations.mockResolvedValueOnce(page({ items: [target], total: 1 })).mockResolvedValue(page({ jobs: [{ status: 'pending' }] }))
  const result = render(<MemoryRouter><PaperCitations paperId="p_a" sourceVersion="old" /></MemoryRouter>)
  await screen.findByText('Target paper')
  result.rerender(<MemoryRouter><PaperCitations paperId="p_a" sourceVersion="new" /></MemoryRouter>)
  await screen.findByText('Indexing queued or in progress.')
  expect(screen.queryByText('Target paper')).not.toBeInTheDocument()
  expect(papersApi.citations).toHaveBeenCalledTimes(2)
})

it('paginates without mixing directions', async () => {
  papersApi.citations.mockImplementation((id, { offset }) => Promise.resolve(page({
    total: 11, offset, items: [{ ...target, id: `p_${offset}`, title: `Page ${offset}` }],
  })))
  render(view())
  await screen.findByText('Page 0')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Page 10')
  expect(screen.queryByText('Page 0')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cited by' }))
  await waitFor(() => expect(papersApi.citations).toHaveBeenLastCalledWith('p_a', { direction: 'incoming', offset: 0, limit: 10 }))
})

it('queues explicitly and preserves visible links while awaiting the worker', async () => {
  papersApi.citations.mockResolvedValueOnce(page({ items: [target], total: 1 })).mockResolvedValue(page({
    items: [target], total: 1, jobs: [{ status: 'pending' }], pendingJobs: 1,
  }))
  papersApi.reindexCitations.mockResolvedValue([{ id: 'job1', status: 'pending' }])
  render(view())
  await screen.findByText('Target paper')
  fireEvent.click(screen.getByRole('button', { name: 'Index', exact: true }))
  await screen.findByText('Indexing queued or in progress.')
  expect(papersApi.reindexCitations).toHaveBeenCalledWith('p_a')
  expect(screen.getByRole('button', { name: 'Indexing…' })).toBeDisabled()
  expect(screen.getByRole('link', { name: 'Target paper' })).toBeInTheDocument()
})

it('the single index action starts providers and reports queue failures', async () => {
  papersApi.citations.mockResolvedValue(page())
  papersApi.reindexCitations.mockRejectedValue(new Error('Indexing unavailable'))
  render(<MemoryRouter><PaperCitations paperId="p_a" /></MemoryRouter>)
  await screen.findByText('Not indexed yet.')
  expect(papersApi.reindexPdfCitations).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Index', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not start indexing. Please try again.')
  expect(papersApi.reindexCitations).toHaveBeenCalledWith('p_a')
  expect(papersApi.reindexPdfCitations).not.toHaveBeenCalled()
})

it('shows PDF-linked papers without an evidence dropdown', async () => {
  papersApi.citations.mockResolvedValue(page({ items: [{ ...target, evidence: [{ provider: 'pymupdf',
    method: 'exact_identifier', indexedAt: '2026-11-03T00:00:00Z',
    reference: { unstructured: 'A. Writer, Target paper, 2024.', pdf_sha256: 'a'.repeat(64) },
  }] }], total: 1 }))
  render(view())
  await screen.findByText('Target paper')
  expect(screen.queryByText('Citation evidence')).not.toBeInTheDocument()
  expect(screen.queryByText('A. Writer, Target paper, 2024.')).not.toBeInTheDocument()
  expect(screen.queryByTitle('a'.repeat(64))).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Index PDF bibliography' })).not.toBeInTheDocument()
})
