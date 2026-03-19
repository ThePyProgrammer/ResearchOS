/**
 * Pure unit tests for task view helper functions (TASK-02, TASK-03, TASK-06).
 *
 * These tests define the CONTRACT that Plans 02-04 must implement.
 * Functions are imported from ProjectTasks.jsx — they do NOT exist yet.
 * Tests are intentionally in RED state. Plans 02-04 will implement and export them (GREEN phase).
 */
import { describe, it, expect } from 'vitest'
import { getMonthGrid, applyTaskFilter, sortTaskRows, isOverdue } from './ProjectTasks'

// ---------------------------------------------------------------------------
// getMonthGrid — Plan 04 (CalendarView)
// ---------------------------------------------------------------------------

describe('getMonthGrid', () => {
  it('returns a 42-element array for a standard month grid (6 weeks)', () => {
    // March 2026: year=2026, monthIndex=2
    const grid = getMonthGrid(2026, 2)
    expect(grid).toHaveLength(42)
  })

  it('March 1, 2026 is a Sunday — should be at index 0', () => {
    // March 2026 starts on Sunday, so day 1 is at index 0
    const grid = getMonthGrid(2026, 2)
    const march1 = grid[0]
    expect(march1).not.toBeNull()
    expect(march1).toBeInstanceOf(Date)
    expect(march1.getDate()).toBe(1)
    expect(march1.getMonth()).toBe(2)
    expect(march1.getFullYear()).toBe(2026)
  })

  it('Day 31 is present in March 2026', () => {
    const grid = getMonthGrid(2026, 2)
    const march31 = grid.find(d => d && d.getDate() === 31 && d.getMonth() === 2)
    expect(march31).toBeDefined()
    expect(march31).toBeInstanceOf(Date)
  })

  it('Day 32 is never present (out-of-month cells are null)', () => {
    const grid = getMonthGrid(2026, 2)
    const day32 = grid.find(d => d && d.getDate() === 32)
    expect(day32).toBeUndefined()
  })

  it('all non-null elements are Date objects', () => {
    const grid = getMonthGrid(2026, 2)
    const nonNull = grid.filter(d => d !== null)
    for (const d of nonNull) {
      expect(d).toBeInstanceOf(Date)
    }
  })

  it('February 2026 (not a leap year) has 28 days, padded to 42 with nulls', () => {
    // Feb 2026 starts on Sunday (index 0), ends on day 28 at index 27
    // Remaining 14 cells are null
    const grid = getMonthGrid(2026, 1)
    expect(grid).toHaveLength(42)
    const monthDays = grid.filter(d => d && d.getMonth() === 1)
    expect(monthDays).toHaveLength(28)
  })
})

// ---------------------------------------------------------------------------
// applyTaskFilter — Plan 03 (ListView)
// ---------------------------------------------------------------------------

describe('applyTaskFilter', () => {
  const tasks = [
    {
      id: 't1',
      title: 'Write tests',
      column_id: 'col_todo',
      priority: 'high',
      due_date: '2020-01-01', // overdue
      tags: ['testing', 'dev'],
    },
    {
      id: 't2',
      title: 'Review PR',
      column_id: 'col_inprogress',
      priority: 'medium',
      due_date: '2099-12-31', // future
      tags: ['review'],
    },
    {
      id: 't3',
      title: 'Deploy release',
      column_id: 'col_done',
      priority: 'low',
      due_date: null,
      tags: [],
    },
    {
      id: 't4',
      title: 'Plan sprint',
      column_id: 'col_todo',
      priority: 'none',
      due_date: null,
      tags: [],
    },
  ]

  it('returns all tasks when filters array is empty', () => {
    const result = applyTaskFilter(tasks, [])
    expect(result).toHaveLength(4)
  })

  it('filters by status (column_id match)', () => {
    const filters = [{ type: 'status', value: 'col_todo' }]
    const result = applyTaskFilter(tasks, filters)
    expect(result).toHaveLength(2)
    expect(result.every(t => t.column_id === 'col_todo')).toBe(true)
  })

  it('filters by priority — high only', () => {
    const filters = [{ type: 'priority', value: 'high' }]
    const result = applyTaskFilter(tasks, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })

  it('filters by priority — low only', () => {
    const filters = [{ type: 'priority', value: 'low' }]
    const result = applyTaskFilter(tasks, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t3')
  })

  it('filters by priority — none only', () => {
    const filters = [{ type: 'priority', value: 'none' }]
    const result = applyTaskFilter(tasks, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t4')
  })

  it('filters by overdue — returns only tasks with due_date < today', () => {
    const filters = [{ type: 'overdue', value: true }]
    const result = applyTaskFilter(tasks, filters)
    expect(result.length).toBeGreaterThanOrEqual(1)
    // t1 has due_date 2020-01-01 which is definitely overdue
    expect(result.some(t => t.id === 't1')).toBe(true)
    // t2 has due_date 2099-12-31 which is never overdue
    expect(result.some(t => t.id === 't2')).toBe(false)
    // tasks with null due_date are not overdue
    expect(result.some(t => t.id === 't3')).toBe(false)
    expect(result.some(t => t.id === 't4')).toBe(false)
  })

  it('multiple filters are ANDed together (status AND priority)', () => {
    const filters = [
      { type: 'status', value: 'col_todo' },
      { type: 'priority', value: 'high' },
    ]
    const result = applyTaskFilter(tasks, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })

  it('multiple filters AND produces empty set when no task matches all criteria', () => {
    const filters = [
      { type: 'status', value: 'col_done' },
      { type: 'priority', value: 'high' },
    ]
    const result = applyTaskFilter(tasks, filters)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// sortTaskRows — Plan 03 (ListView)
// ---------------------------------------------------------------------------

describe('sortTaskRows', () => {
  const rows = [
    { id: 't1', title: 'Bravo', priority: 'low', due_date: '2026-06-15' },
    { id: 't2', title: 'Alpha', priority: 'high', due_date: '2026-03-01' },
    { id: 't3', title: 'Charlie', priority: 'medium', due_date: '2026-12-31' },
    { id: 't4', title: 'Delta', priority: 'none', due_date: null },
  ]

  it('sorts by title alphabetically ascending', () => {
    const sort = { field: 'title', direction: 'asc' }
    const sorted = sortTaskRows(rows, sort)
    const titles = sorted.map(r => r.title)
    expect(titles).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
  })

  it('sorts by title alphabetically descending', () => {
    const sort = { field: 'title', direction: 'desc' }
    const sorted = sortTaskRows(rows, sort)
    const titles = sorted.map(r => r.title)
    expect(titles).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha'])
  })

  it('sorts by priority by rank (high=0, medium=1, low=2, none=3)', () => {
    const sort = { field: 'priority', direction: 'asc' }
    const sorted = sortTaskRows(rows, sort)
    const priorities = sorted.map(r => r.priority)
    expect(priorities).toEqual(['high', 'medium', 'low', 'none'])
  })

  it('sorts by priority descending (none first)', () => {
    const sort = { field: 'priority', direction: 'desc' }
    const sorted = sortTaskRows(rows, sort)
    const priorities = sorted.map(r => r.priority)
    expect(priorities).toEqual(['none', 'low', 'medium', 'high'])
  })

  it('sorts by due_date chronologically ascending (nulls last)', () => {
    const sort = { field: 'due_date', direction: 'asc' }
    const sorted = sortTaskRows(rows, sort)
    // 2026-03-01, 2026-06-15, 2026-12-31, null
    expect(sorted[0].id).toBe('t2')  // 2026-03-01
    expect(sorted[1].id).toBe('t1')  // 2026-06-15
    expect(sorted[2].id).toBe('t3')  // 2026-12-31
    expect(sorted[3].id).toBe('t4')  // null — always last
  })

  it('sorts by due_date descending with nulls still last', () => {
    const sort = { field: 'due_date', direction: 'desc' }
    const sorted = sortTaskRows(rows, sort)
    // 2026-12-31, 2026-06-15, 2026-03-01, null
    expect(sorted[0].id).toBe('t3')  // 2026-12-31
    expect(sorted[1].id).toBe('t1')  // 2026-06-15
    expect(sorted[2].id).toBe('t2')  // 2026-03-01
    expect(sorted[3].id).toBe('t4')  // null — always last
  })

  it('returns original array when sort is null', () => {
    const sorted = sortTaskRows(rows, null)
    expect(sorted).toEqual(rows)
  })
})

// ---------------------------------------------------------------------------
// isOverdue — Plans 02/04 (Kanban/Calendar)
// ---------------------------------------------------------------------------

describe('isOverdue', () => {
  it('returns true when dueDate is in the past (2020-01-01)', () => {
    expect(isOverdue('2020-01-01')).toBe(true)
  })

  it('returns true when dueDate is clearly before today (2000-06-15)', () => {
    expect(isOverdue('2000-06-15')).toBe(true)
  })

  it('returns false when dueDate is far in the future (2099-12-31)', () => {
    expect(isOverdue('2099-12-31')).toBe(false)
  })

  it('returns false when dueDate is today (YYYY-MM-DD string comparison)', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(isOverdue(today)).toBe(false)
  })

  it('returns false when dueDate is null', () => {
    expect(isOverdue(null)).toBe(false)
  })

  it('returns false when dueDate is undefined', () => {
    expect(isOverdue(undefined)).toBe(false)
  })

  it('returns false when dueDate is an empty string', () => {
    expect(isOverdue('')).toBe(false)
  })
})
