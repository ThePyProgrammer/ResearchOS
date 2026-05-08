import { describe, expect, it, vi } from 'vitest'

import {
  buildLibrarySummary,
  buildSparklinePoints,
  formatLibraryDate,
  normalizeDate,
} from './librarySummaries'

describe('librarySummaries', () => {
  it('normalizes ISO strings with extra microseconds', () => {
    const date = normalizeDate('2026-03-09T10:11:12.123456+00:00')

    expect(date).toBeInstanceOf(Date)
    expect(date.toISOString()).toBe('2026-03-09T10:11:12.123Z')
  })

  it('returns null for invalid dates', () => {
    expect(normalizeDate(null)).toBeNull()
    expect(normalizeDate('not-a-date')).toBeNull()
  })

  it('formats and buckets API timestamps by UTC calendar date', async () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'

    try {
      vi.resetModules()
      const mod = await import(/* @vite-ignore */ `./librarySummaries.js?tz=${Date.now()}`)

      expect(mod.formatLibraryDate('2026-03-01T00:00:00Z')).toMatch(/Mar 1, 2026|1 Mar 2026/)

      const summary = mod.buildLibrarySummary(
        { id: 'lib_tz', name: 'TZ', createdAt: '2026-03-01T00:00:00Z' },
        {
          papers: [{ id: 'p_1', createdAt: '2026-03-01T00:30:00Z' }],
          websites: [],
          repos: [],
        }
      )

      expect(summary.createdLabel).toMatch(/Mar 1, 2026|1 Mar 2026/)
      expect(summary.updatedLabel).toMatch(/Mar 1, 2026|1 Mar 2026/)
      expect(summary.sparkline).toEqual([{ label: expect.stringMatching(/Mar 1|1 Mar/), value: 1 }])
    } finally {
      if (originalTz === undefined) delete process.env.TZ
      else process.env.TZ = originalTz
    }
  })

  it('formats valid dates and falls back for missing values', () => {
    expect(formatLibraryDate('2026-03-09T00:00:00Z')).toMatch(/Mar 9, 2026|9 Mar 2026/)
    expect(formatLibraryDate(null)).toBe('—')
  })

  it('builds counts, latest activity, and sparkline data for a library', () => {
    const library = {
      id: 'lib_1',
      name: 'AI Papers',
      createdAt: '2026-03-01T00:00:00Z',
    }
    const summary = buildLibrarySummary(library, {
      papers: [
        { id: 'p_1', createdAt: '2026-03-02T00:00:00Z' },
        { id: 'p_2', createdAt: '2026-03-04T00:00:00Z' },
      ],
      websites: [
        { id: 'w_1', createdAt: '2026-03-03T00:00:00Z' },
      ],
      repos: [
        { id: 'gh_1', createdAt: '2026-03-05T00:00:00Z' },
      ],
    })

    expect(summary.status).toBe('ready')
    expect(summary.counts).toEqual({ papers: 2, websites: 1, repos: 1, total: 4 })
    expect(summary.createdLabel).toMatch(/Mar 1, 2026|1 Mar 2026/)
    expect(summary.updatedLabel).toMatch(/Mar 5, 2026|5 Mar 2026/)
    expect(summary.sparkline).toEqual([
      { label: expect.stringMatching(/Mar 2|2 Mar/), value: 1 },
      { label: expect.stringMatching(/Mar 3|3 Mar/), value: 2 },
      { label: expect.stringMatching(/Mar 4|4 Mar/), value: 3 },
      { label: expect.stringMatching(/Mar 5|5 Mar/), value: 4 },
    ])
  })

  it('uses created date as latest activity when a library has no items', () => {
    const summary = buildLibrarySummary(
      { id: 'lib_empty', name: 'Empty', createdAt: '2026-04-01T00:00:00Z' },
      { papers: [], websites: [], repos: [] }
    )

    expect(summary.counts.total).toBe(0)
    expect(summary.empty).toBe(true)
    expect(summary.updatedLabel).toMatch(/Apr 1, 2026|1 Apr 2026/)
    expect(summary.sparkline).toEqual([])
  })

  it('maps cumulative sparkline points into SVG coordinates', () => {
    const points = buildSparklinePoints(
      [
        { label: 'Mar 1', value: 1 },
        { label: 'Mar 2', value: 3 },
        { label: 'Mar 3', value: 6 },
      ],
      120,
      36
    )

    expect(points).toBe('0,36 60,21.6 120,0')
  })
})
