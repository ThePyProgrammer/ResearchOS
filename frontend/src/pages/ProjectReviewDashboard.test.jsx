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
  venue: 'NeurIPS',
  tags: ['transformers', 'attention'],
  itemType: 'paper',
}

const paperB = {
  id: 'p2',
  title: 'BERT: Pre-training',
  authors: ['Ashish Vaswani', 'Devlin, Jacob'],
  year: 2019,
  venue: 'NeurIPS',
  tags: ['transformers', 'bert'],
  itemType: 'paper',
}

const paperC = {
  id: 'p3',
  title: 'GPT-3',
  authors: ['Brown, Tom'],
  year: 2020,
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

  it('produces a venueEdge when two papers share the same venue', () => {
    const { venueEdges } = buildCitationEdges([paperA, paperB])
    // Both venue = NeurIPS
    expect(venueEdges).toHaveLength(1)
    expect(venueEdges[0].type).toBe('venue')
  })

  it('returns no edges when papers share nothing', () => {
    const { authorEdges, venueEdges } = buildCitationEdges([paperA, paperC])
    // paperA: Vaswani + NeurIPS; paperC: Brown + ICML — no overlap
    expect(authorEdges).toHaveLength(0)
    expect(venueEdges).toHaveLength(0)
  })

  it('handles an empty paper list', () => {
    const { authorEdges, venueEdges } = buildCitationEdges([])
    expect(authorEdges).toHaveLength(0)
    expect(venueEdges).toHaveLength(0)
  })

  it('handles a single paper without crashing', () => {
    const { authorEdges, venueEdges } = buildCitationEdges([paperA])
    expect(authorEdges).toHaveLength(0)
    expect(venueEdges).toHaveLength(0)
  })

  it('does not produce a venueEdge when one paper has empty venue', () => {
    const { venueEdges } = buildCitationEdges([paperA, websiteD])
    // websiteD has venue = '' — should not match
    expect(venueEdges).toHaveLength(0)
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
// computeTimelinePositions
// ---------------------------------------------------------------------------

describe('computeTimelinePositions', () => {
  it('assigns _y=0 and _y=1 for two papers in same year', () => {
    const p1 = { ...paperA, id: 'p1', year: 2020 }
    const p2 = { ...paperB, id: 'p2', year: 2020 }
    const result = computeTimelinePositions([p1, p2])
    const positions = result.map(p => p._y).sort()
    expect(positions).toEqual([0, 1])
  })

  it('assigns _y=0 for a paper in a unique year', () => {
    const p3 = { ...paperC, id: 'p3', year: 2021 }
    const result = computeTimelinePositions([p3])
    expect(result[0]._y).toBe(0)
  })

  it('assigns _x equal to year', () => {
    const result = computeTimelinePositions([paperA])
    expect(result[0]._x).toBe(2017)
  })

  it('handles papers with year=0 without crashing', () => {
    const p = { ...paperA, year: 0 }
    expect(() => computeTimelinePositions([p])).not.toThrow()
    const result = computeTimelinePositions([p])
    expect(result[0]._x).toBe(0)
  })

  it('handles papers with year=null without crashing', () => {
    const p = { ...paperA, year: null }
    expect(() => computeTimelinePositions([p])).not.toThrow()
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
