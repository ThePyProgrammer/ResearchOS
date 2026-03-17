/**
 * Pure unit tests for table view helper functions (TABLE-04, TABLE-05, TABLE-06).
 *
 * These tests define the CONTRACT that Plan 07-01 must implement.
 * Functions are imported from ProjectDetail.jsx — they do NOT exist yet.
 * Tests are intentionally in RED state. Plan 01 will implement and export them (GREEN phase).
 */
import { describe, it, expect } from 'vitest'
import { buildColumns, applyFilter, sortRows } from './ProjectDetail'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockExperiments = [
  {
    id: '1',
    name: 'Run A',
    status: 'completed',
    config: { lr: 0.01, batch_size: 32 },
    metrics: { loss: 0.5, accuracy: 0.92 },
    parent_id: null,
    created_at: '2026-01-01',
  },
  {
    id: '2',
    name: 'Run B',
    status: 'running',
    config: { lr: 0.001 },
    metrics: { loss: 0.3 },
    parent_id: null,
    created_at: '2026-01-02',
  },
  {
    id: '3',
    name: 'Group',
    status: 'planned',
    config: {},
    metrics: {},
    parent_id: null,
    created_at: '2026-01-03',
    children: [],
  },
]

// ---------------------------------------------------------------------------
// buildColumns
// ---------------------------------------------------------------------------

describe('buildColumns', () => {
  it('returns 5 fixed columns + config cols + metric cols from experiment data', () => {
    const cols = buildColumns(mockExperiments)
    // 5 fixed: id, name, status, parent_id, created_at
    const fixed = cols.filter(c => c.type === 'fixed')
    const config = cols.filter(c => c.type === 'config')
    const metric = cols.filter(c => c.type === 'metric')

    expect(fixed).toHaveLength(5)
    expect(config).toHaveLength(2) // lr, batch_size
    expect(metric).toHaveLength(2) // loss, accuracy
  })

  it('config column ids are namespaced as config::key', () => {
    const cols = buildColumns(mockExperiments)
    const configIds = cols.filter(c => c.type === 'config').map(c => c.id)
    expect(configIds).toContain('config::lr')
    expect(configIds).toContain('config::batch_size')
  })

  it('metric column ids are namespaced as metric::key', () => {
    const cols = buildColumns(mockExperiments)
    const metricIds = cols.filter(c => c.type === 'metric').map(c => c.id)
    expect(metricIds).toContain('metric::loss')
    expect(metricIds).toContain('metric::accuracy')
  })

  it('each column has id, label, type, and field properties', () => {
    const cols = buildColumns(mockExperiments)
    for (const col of cols) {
      expect(col).toHaveProperty('id')
      expect(col).toHaveProperty('label')
      expect(col).toHaveProperty('type')
      expect(col).toHaveProperty('field')
    }
  })

  it('empty experiment list returns only the 5 fixed columns', () => {
    const cols = buildColumns([])
    expect(cols).toHaveLength(5)
    expect(cols.every(c => c.type === 'fixed')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyFilter
// ---------------------------------------------------------------------------

describe('applyFilter', () => {
  const row = {
    id: '1',
    name: 'Run A',
    status: 'completed',
    config: { lr: 0.01, batch_size: 32 },
    metrics: { loss: 0.5, accuracy: 0.92 },
    parent_id: null,
    created_at: '2026-01-01',
  }

  it('gt operator returns true when cell value > filter value', () => {
    const filter = { column: 'metric::loss', operator: 'gt', value: '0.4' }
    expect(applyFilter(row, filter)).toBe(true)
  })

  it('gt operator returns false when cell value <= filter value', () => {
    const filter = { column: 'metric::loss', operator: 'gt', value: '0.6' }
    expect(applyFilter(row, filter)).toBe(false)
  })

  it('lt operator returns true when cell value < filter value', () => {
    const filter = { column: 'metric::loss', operator: 'lt', value: '0.6' }
    expect(applyFilter(row, filter)).toBe(true)
  })

  it('lt operator returns false when cell value >= filter value', () => {
    const filter = { column: 'metric::loss', operator: 'lt', value: '0.4' }
    expect(applyFilter(row, filter)).toBe(false)
  })

  it('eq operator matches string equality on a fixed column', () => {
    const filter = { column: 'name', operator: 'eq', value: 'Run A' }
    expect(applyFilter(row, filter)).toBe(true)
  })

  it('eq operator returns false on mismatch', () => {
    const filter = { column: 'name', operator: 'eq', value: 'Run B' }
    expect(applyFilter(row, filter)).toBe(false)
  })

  it('between operator matches value within [low, high] range', () => {
    const filter = { column: 'metric::loss', operator: 'between', value: ['0.4', '0.6'] }
    expect(applyFilter(row, filter)).toBe(true)
  })

  it('between operator returns false when value is outside range', () => {
    const filter = { column: 'metric::loss', operator: 'between', value: ['0.6', '0.9'] }
    expect(applyFilter(row, filter)).toBe(false)
  })

  it('empty operator returns true for undefined values', () => {
    const rowMissing = { ...row, config: {}, metrics: {} }
    const filter = { column: 'metric::loss', operator: 'empty', value: null }
    expect(applyFilter(rowMissing, filter)).toBe(true)
  })

  it('empty operator returns false for defined non-empty values', () => {
    const filter = { column: 'metric::loss', operator: 'empty', value: null }
    expect(applyFilter(row, filter)).toBe(false)
  })

  it('notempty operator returns true for defined non-empty values', () => {
    const filter = { column: 'metric::loss', operator: 'notempty', value: null }
    expect(applyFilter(row, filter)).toBe(true)
  })

  it('notempty operator returns false for undefined values', () => {
    const rowMissing = { ...row, config: {}, metrics: {} }
    const filter = { column: 'metric::loss', operator: 'notempty', value: null }
    expect(applyFilter(rowMissing, filter)).toBe(false)
  })

  it('is operator with array value matches if cellVal is in array (status multi-select)', () => {
    const filter = { column: 'status', operator: 'is', value: ['completed', 'running'] }
    expect(applyFilter(row, filter)).toBe(true)
  })

  it('is operator returns false if cellVal is not in array', () => {
    const filter = { column: 'status', operator: 'is', value: ['planned'] }
    expect(applyFilter(row, filter)).toBe(false)
  })

  it('config column resolution extracts key from config::keyname column id', () => {
    const filter = { column: 'config::lr', operator: 'eq', value: '0.01' }
    expect(applyFilter(row, filter)).toBe(true)
  })

  it('metric column resolution extracts key from metric::keyname column id', () => {
    const filter = { column: 'metric::accuracy', operator: 'gt', value: '0.9' }
    expect(applyFilter(row, filter)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// sortRows
// ---------------------------------------------------------------------------

describe('sortRows', () => {
  const rows = [
    { id: '1', name: 'Bravo', metrics: { loss: 0.5 }, config: {} },
    { id: '2', name: 'Alpha', metrics: { loss: 0.1 }, config: {} },
    { id: '3', name: 'Charlie', metrics: { loss: 0.9 }, config: {} },
    { id: '4', name: 'Delta', metrics: {}, config: {} }, // null metric
  ]

  it('ascending sort on numeric metric column', () => {
    const sort = { columnId: 'metric::loss', direction: 'asc' }
    const sorted = sortRows(rows, sort)
    const losses = sorted.filter(r => r.metrics.loss !== undefined).map(r => r.metrics.loss)
    expect(losses).toEqual([0.1, 0.5, 0.9])
  })

  it('descending sort on string name column', () => {
    const sort = { columnId: 'name', direction: 'desc' }
    const sorted = sortRows(rows, sort)
    const names = sorted.map(r => r.name).filter(n => n !== 'Delta')
    expect(names[0]).toBe('Charlie')
    expect(names[names.length - 1]).toBe('Alpha')
  })

  it('null/undefined values sort last regardless of direction (ascending)', () => {
    const sort = { columnId: 'metric::loss', direction: 'asc' }
    const sorted = sortRows(rows, sort)
    expect(sorted[sorted.length - 1].id).toBe('4') // Delta has no loss
  })

  it('null/undefined values sort last regardless of direction (descending)', () => {
    const sort = { columnId: 'metric::loss', direction: 'desc' }
    const sorted = sortRows(rows, sort)
    expect(sorted[sorted.length - 1].id).toBe('4') // Delta has no loss
  })

  it('returns original array when sort is null', () => {
    const sorted = sortRows(rows, null)
    expect(sorted).toEqual(rows)
  })
})
