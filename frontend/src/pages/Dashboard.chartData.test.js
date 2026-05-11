import { describe, expect, it } from 'vitest'

import { buildItemsOverTimeChartData } from './Dashboard'

describe('buildItemsOverTimeChartData', () => {
  it('fills daily chart gaps with zero-addition dates', () => {
    const chartData = buildItemsOverTimeChartData({
      papers: [{ id: 'p_1', createdAt: '2026-03-01T00:00:00Z' }],
      githubRepos: [],
      websites: [{ id: 'w_1', createdAt: '2026-03-04T00:00:00Z' }],
    })

    expect(chartData).toEqual([
      expect.objectContaining({ label: expect.stringMatching(/Mar 1|1 Mar/), papers: 1, repos: 0, websites: 0, added: 1, total: 1 }),
      expect.objectContaining({ label: expect.stringMatching(/Mar 2|2 Mar/), papers: 0, repos: 0, websites: 0, added: 0, total: 1 }),
      expect.objectContaining({ label: expect.stringMatching(/Mar 3|3 Mar/), papers: 0, repos: 0, websites: 0, added: 0, total: 1 }),
      expect.objectContaining({ label: expect.stringMatching(/Mar 4|4 Mar/), papers: 0, repos: 0, websites: 1, added: 1, total: 2 }),
    ])
  })
})
