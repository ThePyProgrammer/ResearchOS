/**
 * @vitest-environment jsdom
 */

/**
 * Smoke test for ProjectReviewDashboard component (REV-06).
 *
 * Verifies the component renders without crashing and shows the three
 * collapsible section headers: Citation Network, Publication Timeline,
 * Coverage Heatmap.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock react-router-dom useOutletContext (used by wrapper, not the component itself)
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useOutletContext: () => ({ project: { id: 'test-proj', libraryId: 'test-lib' } }),
  }
})

// Mock the API module
vi.mock('../services/api', () => ({
  projectPapersApi: {
    list: vi.fn(),
  },
  papersApi: {
    list: vi.fn(),
  },
  websitesApi: {
    list: vi.fn(),
  },
}))

import { projectPapersApi, papersApi, websitesApi } from '../services/api'
import ProjectReviewDashboard from './ProjectReviewDashboard'

const MOCK_PAPERS = [
  {
    id: 'p1',
    title: 'Attention Is All You Need',
    authors: ['Vaswani, Ashish'],
    year: 2017,
    venue: 'NeurIPS',
    tags: ['transformers'],
    itemType: 'paper',
  },
  {
    id: 'p2',
    title: 'BERT',
    authors: ['Devlin, Jacob'],
    year: 2019,
    venue: 'NAACL',
    tags: ['bert'],
    itemType: 'paper',
  },
]

function renderDashboard(props = {}) {
  return render(
    <MemoryRouter>
      <ProjectReviewDashboard projectId="test-proj" libraryId="test-lib" {...props} />
    </MemoryRouter>
  )
}

describe('ProjectReviewDashboard smoke test', () => {
  beforeEach(() => {
    // Return linked IDs matching p1, p2
    projectPapersApi.list.mockResolvedValue([
      { paperId: 'p1' },
      { paperId: 'p2' },
    ])
    papersApi.list.mockResolvedValue(MOCK_PAPERS)
    websitesApi.list.mockResolvedValue([])
  })

  it('renders without crashing', async () => {
    expect(() => renderDashboard()).not.toThrow()
  })

  it('shows three collapsible section headers', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Citation Network')).toBeInTheDocument()
      expect(screen.getByText('Publication Timeline')).toBeInTheDocument()
      expect(screen.getByText('Coverage Heatmap')).toBeInTheDocument()
    })
  })

  it('renders all three sections without crashing after load', async () => {
    renderDashboard()

    await waitFor(() => {
      // Sections render their headers — the actual visualizations (d3/recharts)
      // may not fully render in jsdom but the section containers should be present
      expect(screen.getByText('Citation Network')).toBeInTheDocument()
      expect(screen.getByText('Publication Timeline')).toBeInTheDocument()
      expect(screen.getByText('Coverage Heatmap')).toBeInTheDocument()
    })
  })

  it('handles empty paper list without crashing', async () => {
    projectPapersApi.list.mockResolvedValue([])
    papersApi.list.mockResolvedValue([])
    websitesApi.list.mockResolvedValue([])

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Citation Network')).toBeInTheDocument()
    })
  })
})
