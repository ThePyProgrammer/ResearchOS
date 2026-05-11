export function normalizeDate(raw) {
  if (!raw) return null
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw
  }

  const normalized = String(raw).replace(/(\.\d{3})\d+/, '$1')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatLibraryDate(raw) {
  const date = normalizeDate(raw)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function dayKey(raw) {
  const date = normalizeDate(raw)
  if (!date) return null
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function labelForDay(key) {
  const [year, month, day] = key.split('-')
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  })
}

function newestDate(...groups) {
  let latest = null
  for (const group of groups) {
    for (const item of group) {
      const date = normalizeDate(item.createdAt || item.created_at)
      if (date && (!latest || date > latest)) latest = date
    }
  }
  return latest
}

function nextDayKey(key) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function dayRange(startKey, endKey) {
  const days = []
  for (let key = startKey; key <= endKey; key = nextDayKey(key)) {
    days.push(key)
  }
  return days
}

function buildCumulativeSeries(items) {
  const counts = new Map()
  for (const item of items) {
    const key = dayKey(item.createdAt || item.created_at)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const sorted = [...counts.keys()].sort()
  if (!sorted.length) return []

  let total = 0
  return dayRange(sorted[0], sorted[sorted.length - 1]).map(key => {
    total += counts.get(key) || 0
    return { label: labelForDay(key), value: total }
  })
}

export function buildLibrarySummary(library, { papers = [], websites = [], repos = [] } = {}) {
  const createdDate = normalizeDate(library.createdAt || library.created_at)
  const latestItemDate = newestDate(papers, websites, repos)
  const updatedDate = latestItemDate || createdDate
  const allItems = [...papers, ...websites, ...repos]

  return {
    status: 'ready',
    libraryId: library.id,
    counts: {
      papers: papers.length,
      websites: websites.length,
      repos: repos.length,
      total: allItems.length,
    },
    empty: allItems.length === 0,
    createdLabel: formatLibraryDate(library.createdAt || library.created_at),
    updatedLabel: formatLibraryDate(updatedDate),
    sparkline: buildCumulativeSeries(allItems),
  }
}

export function buildSparklinePoints(series, width = 120, height = 36) {
  if (!series.length) return ''
  if (series.length === 1) return `0,${height}`

  const values = series.map(point => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const step = width / (series.length - 1)
  const range = Math.max(max - min, 1)

  return series
    .map((point, index) => {
      const x = Number((index * step).toFixed(2))
      const y = Number((height - ((point.value - min) / range) * height).toFixed(2))
      return `${x},${y}`
    })
    .join(' ')
}
