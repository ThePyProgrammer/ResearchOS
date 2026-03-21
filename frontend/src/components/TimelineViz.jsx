import { useState, useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import * as d3 from 'd3'
import { computeTimelinePositions, getNodeColor } from '../pages/ProjectReviewDashboard'

// Categorical palette for venue colors
const VENUE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
]

/**
 * TimelineViz — recharts scatter plot of papers on a year axis.
 *
 * Props:
 *   papers    — array of paper/website objects with year, title, authors, venue, id, itemType
 *   colorBy   — 'year' | 'venue' | 'type' | 'uniform'
 *   projectId — used for navigation (unused here, navigation is via window.location.href)
 */
export default function TimelineViz({ papers = [], colorBy = 'year', projectId }) {
  const [hoveredPaper, setHoveredPaper] = useState(null)

  // Separate papers with and without year data
  const { withYear, withoutYear } = useMemo(() => {
    const withYear = (papers || []).filter(p => p.year != null && p.year !== 0)
    const withoutYear = (papers || []).filter(p => p.year == null || p.year === 0)
    return { withYear, withoutYear }
  }, [papers])

  // Build color scales
  const scales = useMemo(() => {
    const years = withYear.map(p => p.year).filter(Boolean)
    const minYear = years.length ? Math.min(...years) : 2000
    const maxYear = years.length ? Math.max(...years) : 2024

    const yearScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([minYear, maxYear])

    const venues = [...new Set(withYear.map(p => p.venue).filter(Boolean))]
    const venueColorMap = {}
    venues.forEach((v, i) => {
      venueColorMap[v] = VENUE_PALETTE[i % VENUE_PALETTE.length]
    })

    return { yearScale, venueColorMap }
  }, [withYear])

  // Compute stacked positions
  const positions = useMemo(() => {
    const pos = computeTimelinePositions(withYear)
    return pos.map(p => ({
      ...p,
      fill: getNodeColor(p, colorBy, scales),
    }))
  }, [withYear, colorBy, scales])

  // Custom dot shape for the scatter plot
  // setHoveredPaper is captured via closure
  function CustomDot(props) {
    const { cx, cy, payload } = props
    if (cx == null || cy == null) return null
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={payload.fill || '#3b82f6'}
        stroke="white"
        strokeWidth={1.5}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHoveredPaper(payload)}
        onMouseLeave={() => setHoveredPaper(null)}
        onClick={() => {
          const prefix = payload.itemType === 'website' ? '/library/website/' : '/library/paper/'
          window.location.href = prefix + payload.id
        }}
      />
    )
  }

  if (!papers || papers.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-slate-400">
        No papers to display
      </div>
    )
  }

  return (
    <div className="relative">
      {withYear.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-slate-400">
          No papers with year data to display
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="_x"
              type="number"
              name="Year"
              domain={['dataMin - 1', 'dataMax + 1']}
              tickCount={8}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis dataKey="_y" hide />
            <Scatter data={positions} shape={<CustomDot />} />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {/* Hover tooltip */}
      {hoveredPaper && (
        <div
          className="absolute z-50 bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 pointer-events-none shadow-lg max-w-xs"
          style={{ bottom: 8, left: 8 }}
        >
          <div className="font-semibold truncate">{hoveredPaper.title}</div>
          <div className="text-slate-300 mt-0.5">
            {(hoveredPaper.authors || []).slice(0, 3).join(', ')}
          </div>
          <div className="text-slate-400 mt-0.5">
            {hoveredPaper.venue} ({hoveredPaper.year})
          </div>
        </div>
      )}

      {/* Note about excluded papers */}
      {withoutYear.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-1 text-center">
          ({withoutYear.length} paper{withoutYear.length !== 1 ? 's' : ''} without year data excluded)
        </p>
      )}
    </div>
  )
}
