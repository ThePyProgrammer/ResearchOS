/**
 * Smoke test for ProjectReviewDashboard utility exports.
 *
 * The React component has been merged into LiteratureTab (ProjectDetail.jsx).
 * This test verifies that all utility functions are still properly exported
 * from ProjectReviewDashboard.jsx for use by other components and tests.
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

describe('ProjectReviewDashboard exports', () => {
  it('exports normalizeAuthor as a function', () => {
    expect(typeof normalizeAuthor).toBe('function')
  })

  it('exports buildCitationEdges as a function', () => {
    expect(typeof buildCitationEdges).toBe('function')
  })

  it('exports getNodeColor as a function', () => {
    expect(typeof getNodeColor).toBe('function')
  })

  it('exports getNodeSize as a function', () => {
    expect(typeof getNodeSize).toBe('function')
  })

  it('exports computeTimelinePositions as a function', () => {
    expect(typeof computeTimelinePositions).toBe('function')
  })

  it('exports parsePublishedDate as a function', () => {
    expect(typeof parsePublishedDate).toBe('function')
  })

  it('exports buildHeatmapMatrix as a function', () => {
    expect(typeof buildHeatmapMatrix).toBe('function')
  })

  it('does not export a default component', async () => {
    const mod = await import('./ProjectReviewDashboard')
    expect(mod.default).toBeUndefined()
  })
})
