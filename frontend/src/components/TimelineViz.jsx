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
import { computeTimelinePositions, getNodeColor, parsePublishedDate } from '../pages/ProjectReviewDashboard'

// Categorical palette for venue colors
const VENUE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
]

/**
 * Format a timestamp to "MMM YYYY" for axis ticks.
 */
function formatMonthYear(ts) {
  if (ts == null || ts === 0) return ''
  const d = new Date(ts)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * TimelineViz — recharts scatter plot of papers on a date axis (month granularity).
 *
 * Props:
 *   papers    — array of paper/website objects with publishedDate, year, title, authors, venue, id, itemType
 *   colorBy   — 'year' | 'venue' | 'type' | 'uniform'
 *   projectId — used for navigation (unused here, navigation is via window.location.href)
 */
export default function TimelineViz({ papers = [], colorBy = 'year', projectId }) {
  const [hoveredPaper, setHoveredPaper] = useState(null)

  // Separate papers with and without date data
  const { withDate, withoutDate } = useMemo(() => {
    const withDate = (papers || []).filter(p => {
      const { ts } = parsePublishedDate(p)
      return ts !== 0
    })
    const withoutDate = (papers || []).filter(p => {
      const { ts } = parsePublishedDate(p)
      return ts === 0
    })
    return { withDate, withoutDate }
  }, [papers])

  // Build color scales
  const scales = useMemo(() => {
    const years = withDate.map(p => p.year).filter(Boolean)
    const minYear = years.length ? Math.min(...years) : 2000
    const maxYear = years.length ? Math.max(...years) : 2024

    const yearScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([minYear, maxYear])

    const venues = [...new Set(withDate.map(p => p.venue).filter(Boolean))]
    const venueColorMap = {}
    venues.forEach((v, i) => {
      venueColorMap[v] = VENUE_PALETTE[i % VENUE_PALETTE.length]
    })

    return { yearScale, venueColorMap }
  }, [withDate])

  // Compute stacked positions (now uses timestamps for _x)
  const positions = useMemo(() => {
    const pos = computeTimelinePositions(withDate)
    return pos.map(p => ({
      ...p,
      fill: getNodeColor(p, colorBy, scales),
    }))
  }, [withDate, colorBy, scales])

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

  // Compute a domain with one-month padding on each side
  const ONE_MONTH = 30 * 24 * 60 * 60 * 1000
  const timestamps = positions.map(p => p._x)
  const domainMin = timestamps.length ? Math.min(...timestamps) - ONE_MONTH : 0
  const domainMax = timestamps.length ? Math.max(...timestamps) + ONE_MONTH : ONE_MONTH

  return (
    <div className="relative">
      {withDate.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-slate-400">
          No papers with date data to display
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="_x"
              type="number"
              name="Date"
              domain={[domainMin, domainMax]}
              tickCount={8}
              tickFormatter={formatMonthYear}
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
            {hoveredPaper.venue} {hoveredPaper.publishedDate ? `(${hoveredPaper.publishedDate})` : hoveredPaper.year ? `(${hoveredPaper.year})` : ''}
          </div>
        </div>
      )}

      {/* Note about excluded papers */}
      {withoutDate.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-1 text-center">
          ({withoutDate.length} paper{withoutDate.length !== 1 ? 's' : ''} without date data excluded)
        </p>
      )}
    </div>
  )
}
