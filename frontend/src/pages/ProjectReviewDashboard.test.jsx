/**
 * Pure unit tests for ProjectReviewDashboard utility functions (REV-01 through REV-08).
 *
 * All functions are imported as named exports from ProjectReviewDashboard.jsx.
 * These tests are pure JS — no React rendering, no d3, no DOM.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeAuthor,
  buildCitationEdges,
  getNodeColor,
  getNodeSize,
  computeTimelinePositions,
  parsePublishedDate,
  buildHeatmapMatrix,
} from './ProjectReviewDashboard'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const paperA = {
  id: 'p1',
  title: 'Attention Is All You Need',
  authors: ['Vaswani, Ashish', 'Shazeer, Noam'],
  year: 2017,
  publishedDate: '2017-06-12',
  venue: 'NeurIPS',
  tags: ['transformers', 'attention'],
  itemType: 'paper',
}

const paperB = {
  id: 'p2',
  title: 'BERT: Pre-training',
  authors: ['Ashish Vaswani', 'Devlin, Jacob'],
  year: 2019,
  publishedDate: '2019-05-24',
  venue: 'NeurIPS',
  tags: ['transformers', 'bert'],
  itemType: 'paper',
}

const paperC = {
  id: 'p3',
  title: 'GPT-3',
  authors: ['Brown, Tom'],
  year: 2020,
  publishedDate: '2020-06',
  venue: 'ICML',
  tags: [],
  itemType: 'paper',
}

const websiteD = {
  id: 'w1',
  title: 'OpenAI Blog',
  authors: ['OpenAI'],
  year: 2021,
  venue: '',
  tags: ['blog'],
  itemType: 'website',
}

// ---------------------------------------------------------------------------
// normalizeAuthor
// ---------------------------------------------------------------------------

describe('normalizeAuthor', () => {
  it('normalizes "Last, First" format', () => {
    expect(normalizeAuthor('Vaswani, Ashish')).toBe('vaswani a')
  })

  it('normalizes "First Last" format to same key as "Last, First"', () => {
    expect(normalizeAuthor('Ashish Vaswani')).toBe(normalizeAuthor('Vaswani, Ashish'))
  })

  it('normalizes abbreviated "A. Vaswani" format', () => {
    expect(normalizeAuthor('A. Vaswani')).toBe('vaswani a')
  })

  it('handles single-name authors without crashing', () => {
    expect(() => normalizeAuthor('Madonna')).not.toThrow()
    expect(normalizeAuthor('Madonna')).toBe('madonna')
  })

  it('is case-insensitive', () => {
    expect(normalizeAuthor('SMITH, JOHN')).toBe(normalizeAuthor('john smith'))
  })

  it('strips punctuation', () => {
    expect(normalizeAuthor('Smith, J.')).toBe(normalizeAuthor('J. Smith'))
  })
})

// ---------------------------------------------------------------------------
// buildCitationEdges
// ---------------------------------------------------------------------------

describe('buildCitationEdges', () => {
  it('produces an authorEdge when two papers share an author', () => {
    const { authorEdges } = buildCitationEdges([paperA, paperB])
    // Both have Vaswani
    expect(authorEdges).toHaveLength(1)
    const edge = authorEdges[0]
    expect(edge.source).toBe('p1')
    expect(edge.target).toBe('p2')
    expect(edge.type).toBe('author')
    expect(Array.isArray(edge.sharedAuthors)).toBe(true)
    expect(edge.sharedAuthors.length).toBeGreaterThan(0)
  })

  it('does not return venueEdges (venue logic removed)', () => {
    const result = buildCitationEdges([paperA, paperB])
    expect(result).not.toHaveProperty('venueEdges')
  })

  it('returns no edges when papers share nothing', () => {
    const { authorEdges } = buildCitationEdges([paperA, paperC])
    // paperA: Vaswani; paperC: Brown — no overlap
    expect(authorEdges).toHaveLength(0)
  })

  it('handles an empty paper list', () => {
    const { authorEdges } = buildCitationEdges([])
    expect(authorEdges).toHaveLength(0)
  })

  it('handles a single paper without crashing', () => {
    const { authorEdges } = buildCitationEdges([paperA])
    expect(authorEdges).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getNodeColor
// ---------------------------------------------------------------------------

describe('getNodeColor', () => {
  const scales = {
    yearScale: (year) => `year-color-${year}`,
    venueColorMap: { NeurIPS: '#ff0000' },
    typeColorMap: {},
  }

  it('returns yearScale result for colorBy="year"', () => {
    expect(getNodeColor(paperA, 'year', scales)).toBe('year-color-2017')
  })

  it('returns venueColorMap entry for colorBy="venue"', () => {
    expect(getNodeColor(paperA, 'venue', scales)).toBe('#ff0000')
  })

  it('returns fallback color for unknown venue', () => {
    expect(getNodeColor(paperC, 'venue', scales)).toBe('#94a3b8')
  })

  it('returns teal for website with colorBy="type"', () => {
    expect(getNodeColor(websiteD, 'type', scales)).toBe('#14b8a6')
  })

  it('returns blue for paper with colorBy="type"', () => {
    expect(getNodeColor(paperA, 'type', scales)).toBe('#3b82f6')
  })

  it('returns fixed blue for colorBy="uniform"', () => {
    expect(getNodeColor(paperA, 'uniform', scales)).toBe('#3b82f6')
  })
})

// ---------------------------------------------------------------------------
// getNodeSize
// ---------------------------------------------------------------------------

describe('getNodeSize', () => {
  it('returns size proportional to degree for sizeBy="connections"', () => {
    const degreeMap = { p1: 5 }
    const size = getNodeSize(paperA, 'connections', degreeMap)
    expect(size).toBeGreaterThan(6)
    expect(size).toBeLessThanOrEqual(20)
  })

  it('returns minimum size 6 for node with no connections', () => {
    expect(getNodeSize(paperA, 'connections', {})).toBe(6)
  })

  it('returns fixed 8 for sizeBy="uniform"', () => {
    expect(getNodeSize(paperA, 'uniform', {})).toBe(8)
  })

  it('returns size proportional to recency for sizeBy="year"', () => {
    const recentPaper = { ...paperA, year: 2024 }
    const oldPaper = { ...paperA, year: 1990 }
    const recentSize = getNodeSize(recentPaper, 'year', {})
    const oldSize = getNodeSize(oldPaper, 'year', {})
    expect(recentSize).toBeGreaterThanOrEqual(oldSize)
  })

  it('clamps maximum size to 20', () => {
    const futurePaper = { ...paperA, year: 2100 }
    expect(getNodeSize(futurePaper, 'year', {})).toBeLessThanOrEqual(20)
  })
})

// ---------------------------------------------------------------------------
// parsePublishedDate
// ---------------------------------------------------------------------------

describe('parsePublishedDate', () => {
  it('parses a full date "2023-06-15"', () => {
    const { ts, key } = parsePublishedDate({ publishedDate: '2023-06-15', year: 2023 })
    expect(key).toBe('2023-06')
    expect(ts).toBeGreaterThan(0)
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2023)
    expect(d.getMonth()).toBe(5) // June = 5 (0-indexed)
  })

  it('parses a year-month date "2023-06"', () => {
    const { ts, key } = parsePublishedDate({ publishedDate: '2023-06', year: 2023 })
    expect(key).toBe('2023-06')
  })

  it('parses a year-only date "2023"', () => {
    const { ts, key } = parsePublishedDate({ publishedDate: '2023', year: 2023 })
    expect(key).toBe('2023-01')
  })

  it('falls back to year when publishedDate is missing', () => {
    const { ts, key } = parsePublishedDate({ year: 2020 })
    expect(key).toBe('2020-01')
    expect(ts).toBeGreaterThan(0)
  })

  it('returns ts=0 when both publishedDate and year are missing', () => {
    const { ts, key } = parsePublishedDate({})
    expect(ts).toBe(0)
    expect(key).toBe('0000-00')
  })

  it('returns ts=0 when year is 0 and no publishedDate', () => {
    const { ts } = parsePublishedDate({ year: 0 })
    expect(ts).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeTimelinePositions
// ---------------------------------------------------------------------------

describe('computeTimelinePositions', () => {
  it('assigns _y=0 and _y=1 for two papers in same month', () => {
    const p1 = { ...paperA, id: 'p1', publishedDate: '2020-06-01' }
    const p2 = { ...paperB, id: 'p2', publishedDate: '2020-06-15' }
    const result = computeTimelinePositions([p1, p2])
    const positions = result.map(p => p._y).sort()
    expect(positions).toEqual([0, 1])
  })

  it('assigns _y=0 for a paper in a unique month', () => {
    const p3 = { ...paperC, id: 'p3', publishedDate: '2021-03-01' }
    const result = computeTimelinePositions([p3])
    expect(result[0]._y).toBe(0)
  })

  it('assigns _x as a timestamp', () => {
    const result = computeTimelinePositions([paperA])
    // _x should be a timestamp (large number), not a year integer
    expect(result[0]._x).toBeGreaterThan(10000)
  })

  it('uses publishedDate for _x positioning', () => {
    const p1 = { id: 'p1', publishedDate: '2020-01-01', year: 2020 }
    const p2 = { id: 'p2', publishedDate: '2020-06-01', year: 2020 }
    const result = computeTimelinePositions([p1, p2])
    // June should have a later timestamp than January
    expect(result[1]._x).toBeGreaterThan(result[0]._x)
  })

  it('falls back to year when publishedDate is absent', () => {
    const p = { id: 'p1', year: 2020 }
    const result = computeTimelinePositions([p])
    const expected = new Date(2020, 0, 1).getTime()
    expect(result[0]._x).toBe(expected)
  })

  it('handles papers with no date data (ts=0)', () => {
    const p = { id: 'p1' }
    expect(() => computeTimelinePositions([p])).not.toThrow()
    const result = computeTimelinePositions([p])
    expect(result[0]._x).toBe(0)
  })

  it('handles empty array', () => {
    expect(computeTimelinePositions([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildHeatmapMatrix
// ---------------------------------------------------------------------------

describe('buildHeatmapMatrix', () => {
  it('returns { rows, cols, cells } for venue x year', () => {
    const result = buildHeatmapMatrix([paperA, paperB, paperC], 'venue', 'year')
    expect(result).toHaveProperty('rows')
    expect(result).toHaveProperty('cols')
    expect(result).toHaveProperty('cells')
  })

  it('counts correctly for venue x year', () => {
    // paperA: NeurIPS/2017, paperB: NeurIPS/2019, paperC: ICML/2020
    const result = buildHeatmapMatrix([paperA, paperB, paperC], 'venue', 'year')
    const neuripsRow = result.rows.includes('NeurIPS')
    expect(neuripsRow).toBe(true)
    const neurips2017 = result.cells.find(c => c.row === 'NeurIPS' && c.col === '2017')
    expect(neurips2017).toBeDefined()
    expect(neurips2017.count).toBe(1)
  })

  it('explodes multi-tag papers into multiple cells for tags axis', () => {
    // paperA has tags: ['transformers', 'attention']
    const result = buildHeatmapMatrix([paperA], 'tags', 'year')
    // Should have one cell per tag
    const transformersCell = result.cells.find(c => c.row === 'transformers')
    const attentionCell = result.cells.find(c => c.row === 'attention')
    expect(transformersCell).toBeDefined()
    expect(attentionCell).toBeDefined()
  })

  it('buckets empty tags as "(no tags)"', () => {
    // paperC has tags: []
    const result = buildHeatmapMatrix([paperC], 'tags', 'year')
    const noTagsCell = result.cells.find(c => c.row === '(no tags)')
    expect(noTagsCell).toBeDefined()
  })

  it('handles empty papers array', () => {
    const result = buildHeatmapMatrix([], 'venue', 'year')
    expect(result.rows).toHaveLength(0)
    expect(result.cols).toHaveLength(0)
    expect(result.cells).toHaveLength(0)
  })

  it('treats empty venue as "(no venue)"', () => {
    const result = buildHeatmapMatrix([websiteD], 'venue', 'year')
    const noVenueCell = result.cells.find(c => c.row === '(no venue)')
    expect(noVenueCell).toBeDefined()
  })
})
