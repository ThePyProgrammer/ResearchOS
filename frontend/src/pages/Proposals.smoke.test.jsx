import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Proposals from './Proposals'

vi.mock('../services/api', () => ({
  proposalsApi: {
    list: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    batch: vi.fn(),
  },
  runsApi: {
    get: vi.fn(),
  },
}))
import { proposalsApi, runsApi } from '../services/api'


describe('Proposals page smoke', () => {
  beforeEach(() => {
    proposalsApi.list.mockReset()
    runsApi.get.mockReset()
  })

  it('renders fetched proposals and run details', async () => {
    proposalsApi.list.mockResolvedValue([
      {
        id: 'pp_1',
        checked: true,
        status: 'pending',
        paper: {
          title: 'Attention Is All You Need',
          authors: ['A. Vaswani'],
          venue: 'NeurIPS',
          year: 2017,
          relevanceScore: 97,
          agentReasoning: 'Core transformer paper.',
          tags: ['transformers'],
          doi: '10.0000/example',
          arxivId: '1706.03762',
        },
      },
    ])
    runsApi.get.mockResolvedValue({
      id: 'wrk_7a9b2c',
      prompt: 'Find papers on multi-agent systems',
      targetCollection: 'Multi-Agent Systems',
      constraints: ['Year >= 2023'],
      cost: { total: '$0.16' },
      trace: [],
    })

    render(
      <MemoryRouter>
        <Proposals />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Review Proposal/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument()
    expect(screen.getByText(/Run Details/i)).toBeInTheDocument()
  })
})
