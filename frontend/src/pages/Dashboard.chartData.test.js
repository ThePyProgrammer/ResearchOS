import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildItemsOverTimeChartData } from './Dashboard'

describe('buildItemsOverTimeChartData', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-06T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fills daily chart gaps from the library creation date through today', () => {
    const chartData = buildItemsOverTimeChartData({
      createdAt: '2026-03-01T00:00:00Z',
      papers: [{ id: 'p_1', createdAt: '2026-03-02T00:00:00Z' }],
      githubRepos: [],
      websites: [{ id: 'w_1', createdAt: '2026-03-04T00:00:00Z' }],
    })

    expect(chartData).toEqual([
      expect.objectContaining({ label: expect.stringMatching(/Mar 1|1 Mar/), papers: 0, repos: 0, websites: 0, added: 0, total: 0 }),
      expect.objectContaining({ label: expect.stringMatching(/Mar 2|2 Mar/), papers: 1, repos: 0, websites: 0, added: 1, total: 1 }),
      expect.objectContaining({ label: expect.stringMatching(/Mar 3|3 Mar/), papers: 0, repos: 0, websites: 0, added: 0, total: 1 }),
      expect.objectContaining({ label: expect.stringMatching(/Mar 4|4 Mar/), papers: 0, repos: 0, websites: 1, added: 1, total: 2 }),
      expect.objectContaining({ label: expect.stringMatching(/Mar 5|5 Mar/), papers: 0, repos: 0, websites: 0, added: 0, total: 2 }),
      expect.objectContaining({ label: expect.stringMatching(/Mar 6|6 Mar/), papers: 0, repos: 0, websites: 0, added: 0, total: 2 }),
    ])
  })
})
