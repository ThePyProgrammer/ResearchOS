import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Dashboard from './Dashboard'
import { activityApi, collectionsApi, githubReposApi, papersApi, runsApi, usageApi, websitesApi } from '../services/api'

vi.mock('../context/LibraryContext', () => ({
  useLibrary: () => ({
    activeLibrary: {
      id: 'lib_1',
      name: 'AI Papers',
      createdAt: '2026-03-01T00:00:00Z',
    },
  }),
}))

vi.mock('../services/api', () => ({
  activityApi: { list: vi.fn() },
  collectionsApi: { list: vi.fn() },
  githubReposApi: { list: vi.fn() },
  papersApi: { list: vi.fn() },
  runsApi: { list: vi.fn() },
  usageApi: { get: vi.fn() },
  websitesApi: { list: vi.fn() },
}))

vi.mock('recharts', () => ({
  Area: (props) => <div data-testid="chart-area" data-dot={String(props.dot)} data-active-dot={JSON.stringify(props.activeDot)} />,
  AreaChart: ({ children }) => (
    <div>{Array.isArray(children) ? children.filter(child => child?.type !== 'defs') : children}</div>
  ),
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))

describe('Dashboard chart styling', () => {
  beforeEach(() => {
    activityApi.list.mockResolvedValue([])
    runsApi.list.mockResolvedValue([])
    papersApi.list.mockResolvedValue([{ id: 'p_1', createdAt: '2026-03-02T00:00:00Z' }])
    collectionsApi.list.mockResolvedValue([])
    githubReposApi.list.mockResolvedValue([])
    websitesApi.list.mockResolvedValue([])
    usageApi.get.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the dot-free separate chart style for the combined items chart', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    const area = await screen.findByTestId('chart-area')

    await waitFor(() => expect(area).toHaveAttribute('data-dot', 'false'))
    expect(area).toHaveAttribute('data-active-dot', JSON.stringify({ r: 4 }))
  })
})
