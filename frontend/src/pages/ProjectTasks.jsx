import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { tasksApi, taskColumnsApi, taskFieldDefsApi } from '../services/api'
import { useLocalStorage } from '../hooks/useLocalStorage'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// ─── Priority config ──────────────────────────────────────────────────────────

const priorityConfig = {
  high:   { label: 'High',   class: 'bg-red-100 text-red-700' },
  medium: { label: 'Medium', class: 'bg-amber-100 text-amber-700' },
  low:    { label: 'Low',    class: 'bg-blue-100 text-blue-700' },
  none:   { label: 'None',   class: 'bg-slate-100 text-slate-500' },
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 }

function isDoneColumn(col) {
  if (!col) return false
  const n = col.name?.toLowerCase()
  return n === 'done' || n === 'complete' || n === 'completed' || n === 'closed'
}

// ─── Exported pure helpers (tested in ProjectTasks.tasks.test.jsx) ────────────

/**
 * Returns true if dueDate string (YYYY-MM-DD) is strictly before today.
 * Returns false for null, undefined, or empty string.
 */
export function isOverdue(dueDate) {
  if (!dueDate) return false
  const today = new Date().toISOString().slice(0, 10)
  return dueDate.slice(0, 10) < today
}

/**
 * Filters a task array by an array of filter descriptors.
 * Each filter has { type, value }.
 * Supported types: 'status' (matches column_id), 'priority', 'overdue'.
 * Multiple filters are ANDed together.
 * Tasks may have snake_case fields (column_id, due_date) or camelCase (columnId, dueDate).
 */
export function applyTaskFilter(tasks, filters) {
  if (!filters || filters.length === 0) return tasks
  return tasks.filter(task => {
    return filters.every(filter => {
      const { type, value } = filter
      if (type === 'status') {
        const taskColId = task.column_id ?? task.columnId
        return taskColId === value
      }
      if (type === 'priority') {
        return task.priority === value
      }
      if (type === 'overdue') {
        const due = task.due_date ?? task.dueDate
        return value ? isOverdue(due) : !isOverdue(due)
      }
      if (type === 'tags') {
        const tags = task.tags ?? []
        return Array.isArray(value)
          ? value.some(v => tags.includes(v))
          : tags.includes(value)
      }
      if (type === 'title') {
        const title = task.title ?? ''
        return title.toLowerCase().includes(String(value).toLowerCase())
      }
      if (type === 'custom') {
        // filter.defId, filter.operator, filter.value
        const defId = filter.defId
        const customFields = task.customFields ?? task.custom_fields ?? {}
        const cellVal = customFields[defId]
        const { operator } = filter
        if (operator === 'empty') return cellVal === undefined || cellVal === null || cellVal === ''
        if (operator === 'notempty') return cellVal !== undefined && cellVal !== null && cellVal !== ''
        if (operator === 'eq') return String(cellVal ?? '') === String(value)
        if (operator === 'contains') return String(cellVal ?? '').toLowerCase().includes(String(value).toLowerCase())
        if (operator === 'gt') return Number(cellVal) > Number(value)
        if (operator === 'lt') return Number(cellVal) < Number(value)
        return true
      }
      return true
    })
  })
}

/**
 * Sorts a task array by sort config { field, direction }.
 * Returns original array when sort is null.
 * Nulls are always sorted last regardless of direction.
 * Supports: title (alphabetical), priority (by rank), due_date (chronological), custom fields.
 */
export function sortTaskRows(tasks, sort) {
  if (!sort) return tasks
  const { field, direction } = sort
  const sorted = [...tasks]
  sorted.sort((a, b) => {
    let aVal, bVal
    if (field === 'priority') {
      aVal = PRIORITY_RANK[a.priority] ?? 3
      bVal = PRIORITY_RANK[b.priority] ?? 3
      return direction === 'asc' ? aVal - bVal : bVal - aVal
    }
    if (field === 'due_date' || field === 'dueDate') {
      aVal = a.due_date ?? a.dueDate ?? null
      bVal = b.due_date ?? b.dueDate ?? null
      // Nulls always last
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return 1
      if (bVal === null) return -1
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return direction === 'asc' ? cmp : -cmp
    }
    if (field === 'title') {
      aVal = (a.title ?? '').toLowerCase()
      bVal = (b.title ?? '').toLowerCase()
      const cmp = aVal.localeCompare(bVal)
      return direction === 'asc' ? cmp : -cmp
    }
    if (field === 'status') {
      // Sort by column_id string (or columnId)
      aVal = a.column_id ?? a.columnId ?? ''
      bVal = b.column_id ?? b.columnId ?? ''
      const cmp = aVal.localeCompare(bVal)
      return direction === 'asc' ? cmp : -cmp
    }
    // Custom field: field is the def ID
    const aFields = a.customFields ?? a.custom_fields ?? {}
    const bFields = b.customFields ?? b.custom_fields ?? {}
    aVal = aFields[field] ?? null
    bVal = bFields[field] ?? null
    if (aVal === null && bVal === null) return 0
    if (aVal === null) return 1
    if (bVal === null) return -1
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal
    }
    const cmp = String(aVal).localeCompare(String(bVal))
    return direction === 'asc' ? cmp : -cmp
  })
  return sorted
}

/**
 * Returns a 42-element array for a 6-week calendar grid.
 * Year and monthIndex are 0-based month index (0=Jan, 2=March, etc.).
 * Cells before the 1st of month are null; cells from day 1 onward are Date objects.
 * Grid always has exactly 42 cells (6 weeks × 7 days).
 */
export function getMonthGrid(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1)
  const startDow = firstDay.getDay() // 0=Sun
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const grid = []
  // Pre-month nulls
  for (let i = 0; i < startDow; i++) grid.push(null)
  // Month days
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, monthIndex, d))
  // Post-month nulls to fill 42 cells
  while (grid.length < 42) grid.push(null)
  return grid
}

// ─── TaskFilterBar (task-specific simplified filter bar) ─────────────────────

function TaskFilterBar({ filters, setFilters, columns, fieldDefs }) {
  const [addingFilter, setAddingFilter] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const addRef = useRef(null)

  // All filterable columns
  const filterColumns = useMemo(() => [
    { id: 'status',   label: 'Status',   fieldType: 'select' },
    { id: 'priority', label: 'Priority', fieldType: 'select' },
    { id: 'overdue',  label: 'Overdue',  fieldType: 'boolean' },
    { id: 'title',    label: 'Title',    fieldType: 'text' },
    ...fieldDefs.map(fd => ({ id: `custom:${fd.id}`, label: fd.name, fieldType: fd.fieldType, defId: fd.id })),
  ], [fieldDefs])

  useEffect(() => {
    if (!addingFilter) return
    function handleClick(e) {
      if (addRef.current && !addRef.current.contains(e.target)) setAddingFilter(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [addingFilter])

  function addFilter(colId) {
    const col = filterColumns.find(c => c.id === colId)
    let type = colId
    let defId
    if (colId.startsWith('custom:')) {
      type = 'custom'
      defId = col.defId
    }
    const newFilter = {
      id: Date.now().toString(),
      type,
      defId,
      operator: col?.fieldType === 'text' ? 'contains' : 'eq',
      value: type === 'overdue' ? true : type === 'status' ? (columns[0]?.id ?? '') : type === 'priority' ? 'high' : '',
      label: col?.label ?? colId,
    }
    setFilters(prev => [...prev, newFilter])
    setEditingId(newFilter.id)
    setAddingFilter(false)
  }

  function updateFilter(id, updates) {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  function removeFilter(id) {
    setFilters(prev => prev.filter(f => f.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map(f => (
        <TaskFilterChip
          key={f.id}
          filter={f}
          columns={columns}
          isEditing={editingId === f.id}
          onEdit={() => setEditingId(f.id)}
          onUpdate={updates => updateFilter(f.id, updates)}
          onRemove={() => removeFilter(f.id)}
          onClose={() => setEditingId(null)}
        />
      ))}
      <div className="relative" ref={addRef}>
        <button
          onClick={() => setAddingFilter(o => !o)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 rounded px-2 py-1"
        >
          <Icon name="add" className="text-[12px]" /> Filter
        </button>
        {addingFilter && (
          <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-44 max-h-48 overflow-y-auto p-1">
            {filterColumns.map(col => (
              <button
                key={col.id}
                onClick={() => addFilter(col.id)}
                className="block w-full text-left px-2 py-1 text-xs hover:bg-slate-50 rounded text-slate-700"
              >
                {col.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {filters.length > 0 && (
        <button
          onClick={() => setFilters([])}
          className="text-xs text-slate-400 hover:text-red-500 ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

// ─── TaskFilterChip ───────────────────────────────────────────────────────────

function TaskFilterChip({ filter, columns, isEditing, onEdit, onUpdate, onRemove, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!isEditing) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isEditing, onClose])

  function renderChipLabel() {
    if (filter.type === 'overdue') return `Overdue: ${filter.value ? 'Yes' : 'No'}`
    if (filter.type === 'status') {
      const col = columns.find(c => c.id === filter.value)
      return `Status: ${col?.name ?? filter.value}`
    }
    if (filter.type === 'priority') return `Priority: ${priorityConfig[filter.value]?.label ?? filter.value}`
    if (filter.type === 'title') return `Title ${filter.operator === 'contains' ? 'contains' : '='} "${filter.value}"`
    if (filter.type === 'custom') return `${filter.label}: ${filter.value}`
    return filter.label ?? filter.type
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onEdit}
        className="flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 hover:bg-slate-200 group"
      >
        <span className="text-slate-700">{renderChipLabel()}</span>
        <span
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="text-slate-300 hover:text-red-400 ml-0.5 cursor-pointer leading-none"
        >&times;</span>
      </button>
      {isEditing && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-56 p-3 space-y-2">
          {filter.type === 'status' && (
            <div className="space-y-1">
              <p className="text-xs text-slate-400 mb-1">Status</p>
              {columns.map(col => (
                <label key={col.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={filter.value === col.id}
                    onChange={() => onUpdate({ value: col.id })}
                  />
                  <span className="px-1.5 py-0.5 rounded-full text-white text-xs" style={{ backgroundColor: col.color }}>{col.name}</span>
                </label>
              ))}
            </div>
          )}
          {filter.type === 'priority' && (
            <div className="space-y-1">
              <p className="text-xs text-slate-400 mb-1">Priority</p>
              {['high', 'medium', 'low', 'none'].map(p => (
                <label key={p} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={filter.value === p}
                    onChange={() => onUpdate({ value: p })}
                  />
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityConfig[p]?.class}`}>
                    {priorityConfig[p]?.label}
                  </span>
                </label>
              ))}
            </div>
          )}
          {filter.type === 'overdue' && (
            <div className="space-y-1">
              <p className="text-xs text-slate-400 mb-1">Overdue</p>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" checked={filter.value === true} onChange={() => onUpdate({ value: true })} />
                Yes
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" checked={filter.value === false} onChange={() => onUpdate({ value: false })} />
                No
              </label>
            </div>
          )}
          {filter.type === 'title' && (
            <input
              type="text"
              value={filter.value ?? ''}
              onChange={e => onUpdate({ value: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              placeholder="Search..."
              autoFocus
            />
          )}
          {filter.type === 'custom' && (
            <input
              type="text"
              value={filter.value ?? ''}
              onChange={e => onUpdate({ value: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              placeholder="Value..."
              autoFocus
            />
          )}
          <button onClick={onClose} className="text-xs text-blue-600 hover:text-blue-700">Done</button>
        </div>
      )}
    </div>
  )
}

// ─── AddCustomFieldPopover ────────────────────────────────────────────────────

function AddCustomFieldPopover({ projectId, onCreated, onClose }) {
  const ref = useRef(null)
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState('text')
  const [optionsStr, setOptionsStr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const options = ['select', 'multi_select'].includes(fieldType)
        ? optionsStr.split(',').map(o => o.trim()).filter(Boolean)
        : []
      await taskFieldDefsApi.create(projectId, { name: name.trim(), field_type: fieldType, options })
      onCreated()
      onClose()
    } catch (err) {
      console.error('Failed to create field def:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-56 p-3"
      onClick={e => e.stopPropagation()}
    >
      <form onSubmit={handleCreate} className="space-y-2">
        <p className="text-xs font-medium text-slate-600">New field</p>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Field name"
          className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
        />
        <select
          value={fieldType}
          onChange={e => setFieldType(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 bg-white"
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
          <option value="select">Select</option>
          <option value="multi_select">Multi-select</option>
        </select>
        {['select', 'multi_select'].includes(fieldType) && (
          <input
            type="text"
            value={optionsStr}
            onChange={e => setOptionsStr(e.target.value)}
            placeholder="Options (comma-separated)"
            className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
          />
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-500"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── TaskListView ─────────────────────────────────────────────────────────────

function TaskListView({ tasks, columns, fieldDefs, selectedTaskId, onSelectTask, onRefresh, projectId }) {
  const [sort, setSort] = useState(null)          // { field, direction }
  const [filters, setFilters] = useLocalStorage(`task-filters-${projectId}`, [])
  const [colVisibility, setColVisibility] = useLocalStorage(`task-col-visibility-${projectId}`, {})
  const [showAddField, setShowAddField] = useState(false)
  const [hoveredRowId, setHoveredRowId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [editingFieldId, setEditingFieldId] = useState(null)
  const [editingFieldName, setEditingFieldName] = useState('')
  const addFieldRef = useRef(null)
  const colPickerRef = useRef(null)
  const [showColPicker, setShowColPicker] = useState(false)

  // Close col picker on outside click
  useEffect(() => {
    if (!showColPicker) return
    function handleClick(e) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target)) setShowColPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showColPicker])

  // Build column map for status lookup
  const colMap = useMemo(() => Object.fromEntries(columns.map(c => [c.id, c])), [columns])

  // Default columns definition
  const defaultColumns = useMemo(() => [
    { id: 'title',    label: 'Title',    field: 'title',    type: 'default', sortable: true },
    { id: 'status',   label: 'Status',   field: 'columnId', type: 'default', sortable: true },
    { id: 'priority', label: 'Priority', field: 'priority', type: 'default', sortable: true },
    { id: 'dueDate',  label: 'Due Date', field: 'dueDate',  type: 'default', sortable: true },
    { id: 'tags',     label: 'Tags',     field: 'tags',     type: 'default', sortable: false },
  ], [])

  // Custom field columns
  const customColumns = useMemo(() =>
    fieldDefs.map(fd => ({
      id: `custom:${fd.id}`,
      label: fd.name,
      field: fd.id,
      type: 'custom',
      fieldDef: fd,
      sortable: true,
    })),
    [fieldDefs]
  )

  const allColumns = useMemo(() => [...defaultColumns, ...customColumns], [defaultColumns, customColumns])
  const visibleColumns = useMemo(() => allColumns.filter(c => !colVisibility[c.id]), [allColumns, colVisibility])

  // Filter + sort pipeline
  const filteredTasks = useMemo(() => {
    // Convert camelCase tasks to snake_case for filter function
    const normalized = tasks.map(t => ({
      ...t,
      column_id: t.columnId,
      due_date: t.dueDate,
    }))
    const filtered = applyTaskFilter(normalized, filters)
    // Map back to camelCase (find original task by id)
    const filteredIds = new Set(filtered.map(t => t.id))
    return tasks.filter(t => filteredIds.has(t.id))
  }, [tasks, filters])

  const sortedTasks = useMemo(() => {
    if (!sort) return filteredTasks
    // Convert to snake_case for sort function
    const normalized = filteredTasks.map(t => ({
      ...t,
      due_date: t.dueDate,
    }))
    // Map sort field from camelCase to snake_case if needed
    const snakeField = sort.field === 'dueDate' ? 'due_date' : sort.field
    const sorted = sortTaskRows(normalized, { ...sort, field: snakeField })
    // Remap back to camelCase originals preserving order
    const sortedIds = sorted.map(t => t.id)
    const byId = Object.fromEntries(filteredTasks.map(t => [t.id, t]))
    return sortedIds.map(id => byId[id])
  }, [filteredTasks, sort])

  function handleSort(fieldId) {
    setSort(prev => {
      if (!prev || prev.field !== fieldId) return { field: fieldId, direction: 'asc' }
      if (prev.direction === 'asc') return { field: fieldId, direction: 'desc' }
      return null // third click clears sort
    })
  }

  function getSortIcon(fieldId) {
    if (!sort || sort.field !== fieldId) return null
    return sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'
  }

  async function handleDeleteRow(e, taskId) {
    e.stopPropagation()
    if (confirmDeleteId !== taskId) {
      setConfirmDeleteId(taskId)
      return
    }
    try {
      await tasksApi.remove(taskId)
      await onRefresh()
    } catch (err) {
      console.error('Failed to delete task:', err)
    } finally {
      setConfirmDeleteId(null)
    }
  }

  async function handleRenameField(fd) {
    const trimmed = editingFieldName.trim()
    if (!trimmed || trimmed === fd.name) {
      setEditingFieldId(null)
      return
    }
    try {
      await taskFieldDefsApi.update(fd.id, { name: trimmed })
      await onRefresh()
    } catch (err) {
      console.error('Failed to rename field:', err)
    } finally {
      setEditingFieldId(null)
    }
  }

  async function handleDeleteField(fd) {
    if (!window.confirm(`Delete field "${fd.name}"? This cannot be undone.`)) return
    try {
      await taskFieldDefsApi.remove(fd.id)
      await onRefresh()
    } catch (err) {
      console.error('Failed to delete field:', err)
    }
  }

  function renderCell(task, col) {
    if (col.type === 'default') {
      if (col.id === 'title') {
        const taskCol = colMap[task.columnId]
        const done = isDoneColumn(taskCol)
        return (
          <span className={`font-medium flex items-center gap-1.5 ${done ? 'text-slate-400' : 'text-slate-800'}`}>
            {done && <Icon name="check_circle" className="text-[14px] text-green-500 flex-shrink-0" />}
            <span className={done ? 'line-through' : ''}>{task.title}</span>
          </span>
        )
      }
      if (col.id === 'status') {
        const column = colMap[task.columnId]
        if (!column) return <span className="text-slate-400 text-xs">--</span>
        const done = isDoneColumn(column)
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: column.color }}
          >
            {done && <span className="material-symbols-outlined text-[11px]">check</span>}
            {column.name}
          </span>
        )
      }
      if (col.id === 'priority') {
        const p = task.priority ?? 'none'
        return (
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityConfig[p]?.class ?? priorityConfig.none.class}`}>
            {priorityConfig[p]?.label ?? 'None'}
          </span>
        )
      }
      if (col.id === 'dueDate') {
        if (!task.dueDate) return <span className="text-slate-400 text-xs">--</span>
        const taskCol = colMap[task.columnId]
        const done = isDoneColumn(taskCol)
        const overdue = isOverdue(task.dueDate) && !done
        const datePart = task.dueDate.slice(0, 10)
        const timePart = task.dueDate.length > 10 ? task.dueDate.slice(11, 16) : ''
        return (
          <span className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-slate-500'}`}>
            {datePart}{timePart ? ` ${timePart}` : ''}
          </span>
        )
      }
      if (col.id === 'tags') {
        const tags = task.tags ?? []
        if (tags.length === 0) return <span className="text-slate-400 text-xs">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{tag}</span>
            ))}
          </div>
        )
      }
    }
    if (col.type === 'custom') {
      const val = task.customFields?.[col.fieldDef.id]
      if (val === undefined || val === null || val === '') {
        return <span className="text-slate-400 text-xs italic">—</span>
      }
      if (Array.isArray(val)) {
        return (
          <div className="flex flex-wrap gap-1">
            {val.map(v => (
              <span key={v} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{v}</span>
            ))}
          </div>
        )
      }
      return <span className="text-xs text-slate-700">{String(val)}</span>
    }
    return null
  }

  function renderColumnHeader(col) {
    const isCustom = col.type === 'custom'
    const fd = isCustom ? col.fieldDef : null
    const sortIcon = col.sortable ? getSortIcon(col.id === 'dueDate' ? 'due_date' : col.id) : null

    const labelNode = (
      <div
        className="flex items-center gap-1"
        onClick={() => col.sortable && handleSort(col.id === 'dueDate' ? 'due_date' : col.id)}
      >
        <span className={col.sortable ? 'cursor-pointer select-none' : ''}>{col.label}</span>
        {sortIcon && (
          <Icon name={sortIcon} className="text-[12px] text-blue-500" />
        )}
      </div>
    )

    if (isCustom && fd) {
      return (
        <th key={col.id} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap border-b border-slate-200 group relative">
          {editingFieldId === fd.id ? (
            <input
              autoFocus
              type="text"
              value={editingFieldName}
              onChange={e => setEditingFieldName(e.target.value)}
              onBlur={() => handleRenameField(fd)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRenameField(fd)
                if (e.key === 'Escape') setEditingFieldId(null)
              }}
              className="text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none w-24"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-1">
              {labelNode}
              <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                <button
                  title="Rename field"
                  onClick={e => { e.stopPropagation(); setEditingFieldId(fd.id); setEditingFieldName(fd.name) }}
                  className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                >
                  <Icon name="edit" className="text-[12px]" />
                </button>
                <button
                  title="Delete field"
                  onClick={e => { e.stopPropagation(); handleDeleteField(fd) }}
                  className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500"
                >
                  <Icon name="delete" className="text-[12px]" />
                </button>
              </div>
            </div>
          )}
        </th>
      )
    }

    return (
      <th key={col.id} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap border-b border-slate-200">
        {labelNode}
      </th>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar: filters + column picker */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 flex-shrink-0 flex-wrap">
        <TaskFilterBar filters={filters} setFilters={setFilters} columns={columns} fieldDefs={fieldDefs} />
        <div className="ml-auto flex items-center gap-2">
          {/* Column visibility picker */}
          <div className="relative" ref={colPickerRef}>
            <button
              onClick={() => setShowColPicker(o => !o)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2 py-1 bg-white transition-colors"
              title="Manage columns"
            >
              <Icon name="view_column" className="text-[14px]" /> Columns
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 w-48 max-h-56 overflow-y-auto p-2">
                {allColumns.map(col => (
                  <label key={col.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!colVisibility[col.id]}
                      onChange={() => setColVisibility(prev => ({ ...prev, [col.id]: !prev[col.id] }))}
                    />
                    <span className={col.type === 'custom' ? 'text-blue-600' : 'text-slate-700'}>
                      {col.label}
                    </span>
                  </label>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button
                    onClick={() => setColVisibility({})}
                    className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 w-full text-left transition-colors"
                  >
                    Reset columns
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {sortedTasks.length === 0 ? (
          <div className="flex items-center justify-center text-slate-400 text-sm py-16">
            {filters.length > 0 ? 'No tasks match the current filters.' : 'No tasks yet.'}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                {visibleColumns.map(col => renderColumnHeader(col))}
                {/* "+" button at end of header row */}
                <th className="px-2 py-2 border-b border-slate-200 relative" style={{ width: 32 }}>
                  <div className="relative" ref={addFieldRef}>
                    <button
                      onClick={() => setShowAddField(o => !o)}
                      className="flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                      title="Add custom field"
                    >
                      <Icon name="add" className="text-[16px]" />
                    </button>
                    {showAddField && (
                      <AddCustomFieldPopover
                        projectId={projectId}
                        onCreated={onRefresh}
                        onClose={() => setShowAddField(false)}
                      />
                    )}
                  </div>
                </th>
                {/* Delete column (empty header) */}
                <th className="w-8 border-b border-slate-200" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedTasks.map(task => (
                <tr
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  onMouseEnter={() => setHoveredRowId(task.id)}
                  onMouseLeave={() => { setHoveredRowId(null); setConfirmDeleteId(null) }}
                  className={`cursor-pointer transition-colors group ${
                    selectedTaskId === task.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  {visibleColumns.map(col => (
                    <td key={col.id} className="px-3 py-2 align-middle">
                      {renderCell(task, col)}
                    </td>
                  ))}
                  {/* +1 cell for the "add field" column */}
                  <td />
                  {/* Delete icon */}
                  <td className="px-1 py-2 align-middle text-right" onClick={e => e.stopPropagation()}>
                    {hoveredRowId === task.id && (
                      confirmDeleteId === task.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-slate-400 hover:text-slate-600 px-1"
                          >
                            ✕
                          </button>
                          <button
                            onClick={e => handleDeleteRow(e, task.id)}
                            className="text-xs text-red-500 hover:text-red-700 px-1 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => handleDeleteRow(e, task.id)}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                          title="Delete task"
                        >
                          <Icon name="delete" className="text-[14px]" />
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Color swatch picker ─────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#93c5fd', '#fbbf24', '#a78bfa', '#4ade80',
  '#fb923c', '#f472b6', '#34d399', '#60a5fa',
  '#f87171', '#94a3b8',
]

function ColumnColorPicker({ currentColor, onSelect }) {
  return (
    <div className="absolute z-50 top-full left-0 mt-1 p-2 bg-white border border-slate-200 rounded-lg shadow-lg flex flex-wrap gap-1.5 w-[132px]">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            borderColor: c === currentColor ? '#1e40af' : 'transparent',
          }}
          title={c}
        />
      ))}
    </div>
  )
}

// ─── Kanban card (sortable) ──────────────────────────────────────────────────

function KanbanCard({ task, column, fieldDefs, selectedTaskId, onSelectTask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { columnId: column?.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  }

  const overdue = isOverdue(task.dueDate)
  const done = isDoneColumn(column)

  // Show first 1-2 custom field values as chips
  const customChips = (fieldDefs ?? [])
    .filter(fd => task.customFields?.[fd.id] != null && task.customFields?.[fd.id] !== '')
    .slice(0, 2)

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: column?.color ?? '#94a3b8', borderLeftWidth: 3 }}
      {...attributes}
      {...listeners}
      onClick={() => onSelectTask(task.id)}
      className={`px-3 py-2.5 bg-white rounded-lg border text-sm cursor-pointer select-none transition-shadow shadow-sm hover:shadow-md ${
        selectedTaskId === task.id
          ? 'border-blue-400 ring-1 ring-blue-300'
          : 'border-slate-200 hover:border-slate-300'
      } ${done ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        {done && <Icon name="check_circle" className="text-[16px] text-green-500 flex-shrink-0 mt-0.5" />}
        <p className={`font-medium leading-snug flex-1 ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</p>
      </div>
      {task.dueDate && (
        <p className={`text-xs mt-1 ${overdue && !done ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
          {overdue && !done ? 'Overdue · ' : 'Due '}{task.dueDate.slice(0, 10)}{task.dueDate.length > 10 ? ` ${task.dueDate.slice(11, 16)}` : ''}
        </p>
      )}
      {customChips.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {customChips.map(fd => {
            const val = task.customFields[fd.id]
            const display = Array.isArray(val) ? val.join(', ') : String(val)
            return (
              <span
                key={fd.id}
                className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-xs"
                title={`${fd.name}: ${display}`}
              >
                {display}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Kanban card ghost (DragOverlay) ────────────────────────────────────────

function KanbanCardGhost({ task }) {
  return (
    <div className="px-3 py-2.5 bg-white rounded-lg border border-blue-300 ring-1 ring-blue-200 text-sm shadow-xl opacity-90 w-[280px] rotate-1">
      <p className="font-medium text-slate-800 leading-snug">{task.title}</p>
    </div>
  )
}

// ─── Kanban column ───────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  colTasks,
  fieldDefs,
  selectedTaskId,
  onSelectTask,
  onRefresh,
  onRenameColumn,
  onDeleteColumn,
  onColorColumn,
  canDelete,
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id })
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(column.name)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const addInputRef = useRef(null)
  const renameInputRef = useRef(null)
  const colorPickerRef = useRef(null)

  // Auto-focus on add input appearance
  useEffect(() => {
    if (addingTask && addInputRef.current) addInputRef.current.focus()
  }, [addingTask])

  // Auto-focus on rename
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renaming])

  // Close color picker on outside click
  useEffect(() => {
    if (!showColorPicker) return
    function handleClickOutside(e) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showColorPicker])

  async function handleAddTask() {
    const title = newTaskTitle.trim()
    if (!title) {
      setAddingTask(false)
      setNewTaskTitle('')
      return
    }
    try {
      await tasksApi.create(column.projectId, { title, column_id: column.id })
      await onRefresh()
    } catch (err) {
      console.error('Failed to create task:', err)
    }
    setAddingTask(false)
    setNewTaskTitle('')
  }

  async function handleRename() {
    const name = renameValue.trim()
    setRenaming(false)
    if (name && name !== column.name) {
      try {
        await onRenameColumn(column.id, name)
      } catch (err) {
        console.error('Failed to rename column:', err)
        setRenameValue(column.name)
      }
    } else {
      setRenameValue(column.name)
    }
  }

  async function handleColorSelect(color) {
    setShowColorPicker(false)
    try {
      await onColorColumn(column.id, color)
    } catch (err) {
      console.error('Failed to update column color:', err)
    }
  }

  return (
    <div className="flex-shrink-0 flex flex-col" style={{ minWidth: 280, maxWidth: 280 }}>
      {/* Column header */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg"
        style={{ backgroundColor: column.color + '22' }}
      >
        {/* Color dot */}
        <div className="relative flex-shrink-0" ref={colorPickerRef}>
          <button
            onClick={() => setShowColorPicker(v => !v)}
            className="w-3 h-3 rounded-full border border-white/50 flex-shrink-0 hover:scale-125 transition-transform"
            style={{ backgroundColor: column.color }}
            title="Change color"
          />
          {showColorPicker && (
            <ColumnColorPicker currentColor={column.color} onSelect={handleColorSelect} />
          )}
        </div>

        {/* Column name — double-click to rename */}
        {renaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(column.name) }
            }}
            className="flex-1 text-sm font-semibold bg-white/80 border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
          />
        ) : (
          <span
            onDoubleClick={() => setRenaming(true)}
            className="flex-1 text-sm font-semibold text-slate-700 truncate cursor-default select-none"
            title="Double-click to rename"
          >
            {column.name}
          </span>
        )}

        {/* Task count badge */}
        <span className="text-xs font-medium text-slate-400 px-1.5 py-0.5 bg-white/70 rounded-full flex-shrink-0">
          {colTasks.length}
        </span>

        {/* Delete column (visible on hover, only if canDelete) */}
        {canDelete && (
          <div className="relative flex-shrink-0">
            {showDeleteConfirm && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-48 text-xs">
                <p className="text-slate-600 mb-2">Move {colTasks.length} task{colTasks.length !== 1 ? 's' : ''} to adjacent column?</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-slate-500 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); onDeleteColumn(column.id) }}
                    className="flex-1 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => setShowDeleteConfirm(v => !v)}
              className="p-0.5 rounded hover:bg-red-100 text-slate-300 hover:text-red-500 transition-all"
              title="Delete column"
            >
              <Icon name="delete" className="text-[14px]" />
            </button>
          </div>
        )}
      </div>

      {/* Card list — droppable zone for cross-column DnD */}
      <div
        ref={setDropRef}
        className={`flex-1 bg-slate-50/70 rounded-b-lg border border-slate-200 border-t-0 p-2 flex flex-col gap-2 min-h-[80px] overflow-y-auto transition-colors ${isOver ? 'bg-blue-50/60 ring-1 ring-blue-300' : ''}`}
        style={{ maxHeight: 'calc(100vh - 220px)' }}
      >
        <SortableContext items={colTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {colTasks.map(task => (
            <KanbanCard
              key={task.id}
              task={task}
              column={column}
              fieldDefs={fieldDefs}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
            />
          ))}
        </SortableContext>

        {colTasks.length === 0 && !addingTask && (
          <p className="text-xs text-slate-400 text-center py-3 select-none">No tasks</p>
        )}

        {/* Inline task creation */}
        {addingTask ? (
          <div className="mt-1">
            <input
              ref={addInputRef}
              type="text"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddTask()
                if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') }
              }}
              onBlur={() => {
                if (!newTaskTitle.trim()) { setAddingTask(false); setNewTaskTitle('') }
              }}
              placeholder="Task title..."
              className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400/30 bg-white shadow-sm"
            />
            <div className="flex gap-1 mt-1.5">
              <button
                onClick={handleAddTask}
                className="flex-1 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => { setAddingTask(false); setNewTaskTitle('') }}
                className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingTask(true)}
            className="mt-1 flex items-center gap-1 w-full px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          >
            <Icon name="add" className="text-[14px]" />
            Add task
          </button>
        )}
      </div>
    </div>
  )
}

// ─── KanbanView ───────────────────────────────────────────────────────────────

function KanbanView({ columns: initialColumns, tasks: initialTasks, fieldDefs, selectedTaskId, onSelectTask, onRefresh }) {
  const [columns, setColumns] = useState(initialColumns)
  const [tasks, setTasks] = useState(initialTasks)
  const [activeCardId, setActiveCardId] = useState(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const addColumnInputRef = useRef(null)

  // Sync from parent when external refresh happens
  useEffect(() => { setColumns(initialColumns) }, [initialColumns])
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])

  useEffect(() => {
    if (addingColumn && addColumnInputRef.current) addColumnInputRef.current.focus()
  }, [addingColumn])

  // ── DnD sensors (5px distance to distinguish click from drag) ──────────────
  const cardSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeCard = tasks.find(t => t.id === activeCardId) ?? null

  // ── Card drag end ──────────────────────────────────────────────────────────
  function handleCardDragStart(event) {
    setActiveCardId(event.active.id)
  }

  function handleCardDragEnd(event) {
    setActiveCardId(null)
    const { active, over } = event
    if (!over) return

    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    // Determine target column — over might be a task (sortable) or a column (droppable)
    const overTask = tasks.find(t => t.id === over.id)
    const overColumn = columns.find(c => c.id === over.id)
    const targetColumnId = overTask ? overTask.columnId : overColumn ? overColumn.id : null

    if (!targetColumnId) return

    if (activeTask.columnId !== targetColumnId) {
      // Cross-column drop: update task column_id optimistically
      setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, columnId: targetColumnId } : t))
      tasksApi.update(activeTask.id, { column_id: targetColumnId })
        .then(onRefresh)
        .catch(err => {
          console.error('Failed to move task:', err)
          setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, columnId: activeTask.columnId } : t))
        })
    } else {
      // Same column: reorder positions
      const colTasks = tasks.filter(t => t.columnId === targetColumnId).sort((a, b) => a.position - b.position)
      const oldIndex = colTasks.findIndex(t => t.id === active.id)
      const newIndex = colTasks.findIndex(t => t.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(colTasks, oldIndex, newIndex)
        setTasks(prev => {
          const otherTasks = prev.filter(t => t.columnId !== targetColumnId)
          return [...otherTasks, ...reordered.map((t, i) => ({ ...t, position: i }))]
        })
        // Persist positions in background
        reordered.forEach((t, i) => {
          tasksApi.update(t.id, { position: i }).catch(err => console.error('Failed to update position:', err))
        })
      }
    }
  }

  // ── Column CRUD handlers ───────────────────────────────────────────────────
  async function handleRenameColumn(colId, name) {
    await taskColumnsApi.update(colId, { name })
    await onRefresh()
  }

  async function handleDeleteColumn(colId) {
    const idx = columns.findIndex(c => c.id === colId)
    const adjacent = idx > 0 ? columns[idx - 1] : columns[idx + 1]
    if (!adjacent) return
    try {
      await taskColumnsApi.remove(colId, adjacent.id)
      await onRefresh()
    } catch (err) {
      console.error('Failed to delete column:', err)
    }
  }

  async function handleColorColumn(colId, color) {
    await taskColumnsApi.update(colId, { color })
    await onRefresh()
  }

  async function handleAddColumn() {
    const name = newColumnName.trim()
    setAddingColumn(false)
    setNewColumnName('')
    if (!name) return
    try {
      const projectId = columns[0]?.projectId
      if (!projectId) return
      await taskColumnsApi.create(projectId, { name })
      await onRefresh()
    } catch (err) {
      console.error('Failed to create column:', err)
    }
  }

  // Sort columns by position
  const sortedColumns = useMemo(() => [...columns].sort((a, b) => a.position - b.position), [columns])

  return (
    <div className="flex gap-3 p-6 h-full items-start overflow-x-auto">
      {/* Single DnD context for card movement across columns */}
      <DndContext
        id="task-card-dnd"
        sensors={cardSensors}
        collisionDetection={closestCorners}
        onDragStart={handleCardDragStart}
        onDragEnd={handleCardDragEnd}
      >
        {sortedColumns.map(col => {
          const colTasks = tasks
            .filter(t => t.columnId === col.id)
            .sort((a, b) => a.position - b.position)
          return (
            <KanbanColumn
              key={col.id}
              column={col}
              colTasks={colTasks}
              fieldDefs={fieldDefs}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              onRefresh={onRefresh}
              onRenameColumn={handleRenameColumn}
              onDeleteColumn={handleDeleteColumn}
              onColorColumn={handleColorColumn}
              canDelete={columns.length > 1}
            />
          )
        })}

        {/* Drag overlay — card clone during drag */}
        <DragOverlay>
          {activeCard ? <KanbanCardGhost task={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Add column button / inline input */}
      <div className="flex-shrink-0">
        {addingColumn ? (
          <div className="w-[280px]">
            <input
              ref={addColumnInputRef}
              type="text"
              value={newColumnName}
              onChange={e => setNewColumnName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddColumn()
                if (e.key === 'Escape') { setAddingColumn(false); setNewColumnName('') }
              }}
              onBlur={() => {
                if (!newColumnName.trim()) { setAddingColumn(false); setNewColumnName('') }
              }}
              placeholder="Column name..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30 bg-white shadow-sm"
            />
            <div className="flex gap-1 mt-1.5">
              <button
                onClick={handleAddColumn}
                className="flex-1 py-1 text-xs bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors"
              >
                Add column
              </button>
              <button
                onClick={() => { setAddingColumn(false); setNewColumnName('') }}
                className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingColumn(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-dashed border-slate-300 hover:border-slate-400 whitespace-nowrap"
          >
            <Icon name="add" className="text-[16px]" />
            Add column
          </button>
        )}
      </div>

      {/* Empty state */}
      {columns.length === 0 && !addingColumn && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          No columns yet
        </div>
      )}
    </div>
  )
}

// ─── TaskDetailPanel ──────────────────────────────────────────────────────────

function TaskDetailPanel({ task, columns, fieldDefs, onClose, onRefresh, mode = 'peek', onModeChange }) {
  const [form, setForm] = useState({ ...task })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Split dueDate into date + time parts for separate inputs
  const dueDatePart = (form.dueDate ?? '').slice(0, 10)
  const dueTimePart = (form.dueDate ?? '').length > 10 ? form.dueDate.slice(11, 16) : ''

  // Keep form in sync when task prop changes (e.g. another task selected)
  useEffect(() => {
    setForm({ ...task })
    setConfirmDelete(false)
  }, [task.id])

  async function saveField(field, value) {
    if (value === task[field]) return
    setSaving(true)
    try {
      await tasksApi.update(task.id, { [field]: value })
      await onRefresh()
    } catch (err) {
      console.error('Failed to update task:', err)
    } finally {
      setSaving(false)
    }
  }

  function handleDateChange(newDate, newTime) {
    const d = newDate ?? dueDatePart
    const t = newTime ?? dueTimePart
    const combined = d ? (t ? `${d}T${t}` : d) : null
    setForm(prev => ({ ...prev, dueDate: combined }))
    saveField('dueDate', combined)
  }

  async function saveCustomField(defId, value) {
    const updated = { ...form.customFields, [defId]: value }
    setForm(prev => ({ ...prev, customFields: updated }))
    setSaving(true)
    try {
      await tasksApi.update(task.id, { custom_fields: updated })
      await onRefresh()
    } catch (err) {
      console.error('Failed to update custom field:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await tasksApi.remove(task.id)
      await onRefresh()
      onClose()
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  function renderCustomField(fd) {
    const value = form.customFields?.[fd.id] ?? ''

    switch (fd.fieldType) {
      case 'text':
        return (
          <input
            key={fd.id}
            type="text"
            value={value}
            onChange={e => setForm(prev => ({ ...prev, customFields: { ...prev.customFields, [fd.id]: e.target.value } }))}
            onBlur={() => saveCustomField(fd.id, value)}
            className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            placeholder={`Enter ${fd.name}...`}
          />
        )
      case 'number':
        return (
          <input
            key={fd.id}
            type="number"
            value={value}
            onChange={e => setForm(prev => ({ ...prev, customFields: { ...prev.customFields, [fd.id]: e.target.value } }))}
            onBlur={() => saveCustomField(fd.id, value === '' ? null : Number(value))}
            className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            placeholder="0"
          />
        )
      case 'date':
        return (
          <input
            key={fd.id}
            type="date"
            value={value}
            onChange={e => {
              setForm(prev => ({ ...prev, customFields: { ...prev.customFields, [fd.id]: e.target.value } }))
              saveCustomField(fd.id, e.target.value || null)
            }}
            className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        )
      case 'select':
        return (
          <select
            key={fd.id}
            value={value}
            onChange={e => {
              setForm(prev => ({ ...prev, customFields: { ...prev.customFields, [fd.id]: e.target.value } }))
              saveCustomField(fd.id, e.target.value || null)
            }}
            className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
          >
            <option value="">— select —</option>
            {(fd.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )
      case 'multi_select': {
        const selected = Array.isArray(value) ? value : []
        return (
          <div key={fd.id} className="flex flex-wrap gap-1">
            {(fd.options || []).map(opt => {
              const isChecked = selected.includes(opt)
              return (
                <button
                  key={opt}
                  onClick={() => {
                    const next = isChecked ? selected.filter(v => v !== opt) : [...selected, opt]
                    setForm(prev => ({ ...prev, customFields: { ...prev.customFields, [fd.id]: next } }))
                    saveCustomField(fd.id, next)
                  }}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                    isChecked ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        )
      }
      default:
        return null
    }
  }

  const column = columns.find(c => c.id === form.columnId)
  const done = isDoneColumn(column)

  return (
    <div className="flex-1 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {done && <Icon name="check_circle" className="text-[18px] text-green-500" />}
          <h3 className="text-sm font-semibold text-slate-700 truncate">Task Details</h3>
        </div>
        <div className="flex items-center gap-1">
          {saving && <span className="text-xs text-slate-400">Saving...</span>}
          {/* View mode switcher */}
          <button
            onClick={() => onModeChange?.(mode === 'peek' ? 'modal' : 'peek')}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title={mode === 'peek' ? 'Expand to modal' : 'Shrink to peek'}
          >
            <Icon name={mode === 'peek' ? 'open_in_full' : 'close_fullscreen'} className="text-[16px]" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Close"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
          <input
            type="text"
            value={form.title ?? ''}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            onBlur={() => saveField('title', form.title)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
          <textarea
            value={form.description ?? ''}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            onBlur={() => saveField('description', form.description || null)}
            rows={3}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            placeholder="Add a description..."
          />
        </div>

        {/* Status (column) with color */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: column?.color ?? '#94a3b8' }} />
            <select
              value={form.columnId ?? ''}
              onChange={e => {
                setForm(prev => ({ ...prev, columnId: e.target.value }))
                saveField('columnId', e.target.value)
              }}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
            >
              {columns.map(col => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
          <select
            value={form.priority ?? 'none'}
            onChange={e => {
              setForm(prev => ({ ...prev, priority: e.target.value }))
              saveField('priority', e.target.value)
            }}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
          </select>
        </div>

        {/* Due Date + Time */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Due Date</label>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dueDatePart}
              onChange={e => handleDateChange(e.target.value, dueTimePart)}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {dueDatePart && (
              <button
                onClick={() => handleDateChange('', '')}
                className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-500"
                title="Clear date"
              >
                <Icon name="close" className="text-[14px]" />
              </button>
            )}
          </div>
          {dueDatePart && (
            <div className="mt-1.5">
              <label className="block text-xs font-medium text-slate-400 mb-1">Time (optional)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={dueTimePart}
                  onChange={e => handleDateChange(dueDatePart, e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                {dueTimePart && (
                  <button
                    onClick={() => handleDateChange(dueDatePart, '')}
                    className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-500"
                    title="Clear time"
                  >
                    <Icon name="close" className="text-[14px]" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Tags (comma-separated)</label>
          <input
            type="text"
            value={Array.isArray(form.tags) ? form.tags.join(', ') : ''}
            onChange={e => {
              const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean)
              setForm(prev => ({ ...prev, tags }))
            }}
            onBlur={() => saveField('tags', form.tags)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            placeholder="tag1, tag2, ..."
          />
        </div>

        {/* Custom fields */}
        {fieldDefs.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Custom Fields</p>
            {fieldDefs.map(fd => (
              <div key={fd.id}>
                <label className="block text-xs font-medium text-slate-500 mb-1">{fd.name}</label>
                {renderCustomField(fd)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer — delete */}
      <div className="px-4 py-3 border-t border-slate-100">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 flex-1">Delete this task?</span>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            <Icon name="delete" className="text-[14px]" />
            Delete task
          </button>
        )}
      </div>
    </div>
  )
}

// ─── ProjectTasks ─────────────────────────────────────────────────────────────

export default function ProjectTasks() {
  const { project } = useOutletContext()
  const projectId = project.id

  const [tasks, setTasks] = useState([])
  const [columns, setColumns] = useState([])
  const [fieldDefs, setFieldDefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [detailMode, setDetailMode] = useState('peek') // 'peek' | 'modal'

  const [view, setView] = useLocalStorage(`tasks-view-${projectId}`, 'kanban')

  const fetchAll = useCallback(async () => {
    try {
      const [tasksData, columnsData, defsData] = await Promise.all([
        tasksApi.list(projectId),
        taskColumnsApi.list(projectId),
        taskFieldDefsApi.list(projectId),
      ])
      setTasks(tasksData)
      setColumns(columnsData)
      setFieldDefs(defsData)
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null

  function handleSelectTask(taskId) {
    setSelectedTaskId(prev => (prev === taskId ? null : taskId))
  }

  function handleClosePanel() {
    setSelectedTaskId(null)
  }

  function refreshTasks() {
    return fetchAll()
  }

  // ── View toggle buttons ──────────────────────────────────────────────────────

  const viewButtons = [
    { id: 'kanban',   icon: 'view_kanban',     title: 'Kanban' },
    { id: 'list',     icon: 'view_list',       title: 'List' },
    { id: 'calendar', icon: 'calendar_month',  title: 'Calendar' },
  ]

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Loading tasks...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Main area — always full width */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-800">Tasks</h2>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {viewButtons.map(btn => (
              <button
                key={btn.id}
                onClick={() => setView(btn.id)}
                title={btn.title}
                className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
                  view === btn.id
                    ? 'bg-white text-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-white/60'
                }`}
              >
                <Icon name={btn.icon} className="text-[18px]" />
              </button>
            ))}
          </div>
        </div>

        {/* View content */}
        <div className="flex-1 overflow-auto">
          {view === 'kanban' && (
            <KanbanView
              columns={columns}
              tasks={tasks}
              fieldDefs={fieldDefs}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
              onRefresh={refreshTasks}
            />
          )}
          {view === 'list' && (
            <TaskListView
              columns={columns}
              tasks={tasks}
              fieldDefs={fieldDefs}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
              onRefresh={refreshTasks}
              projectId={projectId}
            />
          )}
          {view === 'calendar' && (
            <CalendarView
              tasks={tasks}
              columns={columns}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
              onRefresh={refreshTasks}
            />
          )}
        </div>
      </div>

      {/* Detail overlay — peek (right half) or modal (centered) */}
      {selectedTask && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClosePanel}
            className={`fixed inset-0 z-40 transition-all duration-200 ${
              detailMode === 'modal' ? 'bg-black/50' : 'bg-black/15'
            }`}
          />
          {/* Panel container */}
          <div className={`fixed z-50 bg-white flex flex-col overflow-hidden shadow-2xl transition-all duration-200 ${
            detailMode === 'modal'
              ? 'inset-y-8 left-[15%] right-[15%] rounded-xl border border-slate-200'
              : 'top-0 right-0 bottom-0 w-[480px] border-l border-slate-200'
          }`}>
            <TaskDetailPanel
              task={selectedTask}
              columns={columns}
              fieldDefs={fieldDefs}
              onClose={handleClosePanel}
              onRefresh={refreshTasks}
              mode={detailMode}
              onModeChange={setDetailMode}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ─── CalendarView ─────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// CalendarCell: droppable cell for a given date string (YYYY-MM-DD)
function CalendarCell({ dateStr, isToday, dayNumber, dayTasks, columns, selectedTaskId, onSelectTask, overflowCount, onOverflowClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: dateStr })

  const colMap = useMemo(() => Object.fromEntries(columns.map(c => [c.id, c])), [columns])
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col border-b border-r border-slate-100 min-h-[110px] p-1 transition-colors ${
        isToday ? 'bg-blue-50/60 border border-blue-200' : 'bg-white'
      } ${isOver ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
    >
      <span className={`text-xs font-medium mb-1 self-start px-1 leading-tight ${
        isToday ? 'text-blue-600 font-bold' : 'text-slate-400'
      }`}>
        {dayNumber}
      </span>
      <div className="flex flex-col gap-0.5 overflow-hidden">
        {dayTasks.map(task => (
          <CalendarTaskChip
            key={task.id}
            task={task}
            column={colMap[task.columnId]}
            isSelected={selectedTaskId === task.id}
            onSelect={onSelectTask}
            today={today}
          />
        ))}
        {overflowCount > 0 && (
          <button
            onClick={() => onOverflowClick(dateStr)}
            className="text-[10px] text-blue-500 hover:text-blue-700 text-left px-1 leading-tight"
          >
            +{overflowCount} more
          </button>
        )}
      </div>
    </div>
  )
}

// CalendarTaskChip: draggable task chip inside a calendar cell
function CalendarTaskChip({ task, column, isSelected, onSelect, today }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const overdue = isOverdue(task.dueDate)
  const done = isDoneColumn(column)
  const bgColor = done ? '#86efac' : overdue ? '#ef4444' : (column?.color ?? '#94a3b8')
  const textColor = done ? '#166534' : '#ffffff'

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onSelect(task.id) }}
      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer select-none transition-opacity ${
        isDragging ? 'opacity-30' : 'opacity-100'
      } ${isSelected ? 'ring-1 ring-white ring-offset-1' : ''}`}
      style={{ backgroundColor: bgColor, color: textColor, maxWidth: '100%' }}
      title={task.title}
    >
      {done && <span className="material-symbols-outlined text-[10px]">check</span>}
      <span className="truncate">{task.title}</span>
    </div>
  )
}

// UnscheduledCard: draggable card in the unscheduled sidebar
function UnscheduledCard({ task, column, isSelected, onSelect }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const done = isDoneColumn(column)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task.id)}
      className={`flex items-center gap-2 px-2 py-1.5 bg-white border rounded-md text-xs cursor-pointer select-none transition-all hover:shadow-sm ${
        isDragging ? 'opacity-30' : 'opacity-100'
      } ${isSelected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}`}
    >
      {done
        ? <span className="material-symbols-outlined text-[14px] text-green-500 flex-shrink-0">check_circle</span>
        : <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: column?.color ?? '#94a3b8' }} />
      }
      <span className={`truncate flex-1 ${done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{task.title}</span>
    </div>
  )
}

// OverflowPopover: shows all tasks for a date when "+N more" is clicked
function OverflowPopover({ dateStr, allTasks, columns, selectedTaskId, onSelectTask, onClose }) {
  const ref = useRef(null)
  const colMap = useMemo(() => Object.fromEntries(columns.map(c => [c.id, c])), [columns])
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-2 w-52 max-h-56 overflow-y-auto"
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-600">{dateStr}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <Icon name="close" className="text-[14px]" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {allTasks.map(task => {
          const col = colMap[task.columnId]
          const overdue = isOverdue(task.dueDate)
          const bgColor = overdue ? '#ef4444' : (col?.color ?? '#94a3b8')
          return (
            <button
              key={task.id}
              onClick={() => { onSelectTask(task.id); onClose() }}
              className={`px-2 py-1 rounded text-white text-xs font-medium text-left truncate ${
                selectedTaskId === task.id ? 'ring-1 ring-blue-400' : ''
              }`}
              style={{ backgroundColor: bgColor }}
            >
              {task.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CalendarView({ tasks, columns, selectedTaskId, onSelectTask, onRefresh }) {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth()) // 0-indexed
  const [activeDragTaskId, setActiveDragTaskId] = useState(null)
  const [overflowDate, setOverflowDate] = useState(null) // dateStr showing popover

  const today = now.toISOString().slice(0, 10)
  const colMap = useMemo(() => Object.fromEntries(columns.map(c => [c.id, c])), [columns])

  // Build task map by YYYY-MM-DD string
  const tasksByDate = useMemo(() => {
    const map = {}
    for (const task of tasks) {
      if (task.dueDate) {
        if (!map[task.dueDate]) map[task.dueDate] = []
        map[task.dueDate].push(task)
      }
    }
    return map
  }, [tasks])

  const unscheduledTasks = useMemo(() => tasks.filter(t => !t.dueDate), [tasks])

  const grid = useMemo(() => getMonthGrid(currentYear, currentMonth), [currentYear, currentMonth])

  const activeDragTask = tasks.find(t => t.id === activeDragTaskId) ?? null

  function goToPrevMonth() {
    setCurrentMonth(m => {
      if (m === 0) { setCurrentYear(y => y - 1); return 11 }
      return m - 1
    })
  }

  function goToNextMonth() {
    setCurrentMonth(m => {
      if (m === 11) { setCurrentYear(y => y + 1); return 0 }
      return m + 1
    })
  }

  function goToToday() {
    const n = new Date()
    setCurrentYear(n.getFullYear())
    setCurrentMonth(n.getMonth())
  }

  const calendarSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragStart(event) {
    setActiveDragTaskId(event.active.id)
  }

  async function handleDragEnd(event) {
    setActiveDragTaskId(null)
    const { active, over } = event
    if (!over) return

    const targetDate = over.id // YYYY-MM-DD string (droppable id)
    const taskId = active.id
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    // Only update if the date actually changed
    if (task.dueDate === targetDate) return

    try {
      await tasksApi.update(taskId, { due_date: targetDate })
      await onRefresh()
    } catch (err) {
      console.error('Failed to update task due date:', err)
    }
  }

  function toDateStr(date) {
    // Format Date to YYYY-MM-DD in local time
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const MAX_CHIPS = 3

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-12">
        <div>
          <Icon name="calendar_month" className="text-[48px] text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No tasks yet.</p>
          <p className="text-slate-400 text-sm mt-1">Create one from the Kanban view or use the list view.</p>
        </div>
      </div>
    )
  }

  return (
    <DndContext
      id="task-calendar-dnd"
      sensors={calendarSensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full overflow-hidden">
        {/* Calendar area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Calendar header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 flex-shrink-0">
            <button
              onClick={goToPrevMonth}
              className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
              title="Previous month"
            >
              <Icon name="chevron_left" className="text-[20px]" />
            </button>
            <h3 className="text-sm font-semibold text-slate-700 min-w-[140px] text-center">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h3>
            <button
              onClick={goToNextMonth}
              className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
              title="Next month"
            >
              <Icon name="chevron_right" className="text-[20px]" />
            </button>
            <button
              onClick={goToToday}
              className="ml-2 px-2 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Today
            </button>
          </div>

          {/* Day-of-week labels */}
          <div className="grid grid-cols-7 flex-shrink-0 border-b border-slate-200">
            {DAY_LABELS.map(day => (
              <div key={day} className="text-center text-xs font-medium text-slate-400 py-1.5 border-r border-slate-100 last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          {/* Month grid */}
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-7 border-l border-t border-slate-100" style={{ minHeight: '100%' }}>
              {grid.map((cell, idx) => {
                if (!cell) {
                  // Padding cell (null)
                  return (
                    <div
                      key={`pad-${idx}`}
                      className="border-b border-r border-slate-100 bg-slate-50/50 min-h-[110px]"
                    />
                  )
                }

                const dateStr = toDateStr(cell)
                const dayTasks = tasksByDate[dateStr] ?? []
                const visibleTasks = dayTasks.slice(0, MAX_CHIPS)
                const overflowCount = dayTasks.length - MAX_CHIPS
                const isToday = dateStr === today

                return (
                  <CalendarCell
                    key={dateStr}
                    dateStr={dateStr}
                    isToday={isToday}
                    dayNumber={cell.getDate()}
                    dayTasks={visibleTasks}
                    columns={columns}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                    overflowCount={Math.max(0, overflowCount)}
                    onOverflowClick={setOverflowDate}
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* Unscheduled sidebar */}
        <div className="w-[200px] flex-shrink-0 border-l border-slate-200 flex flex-col overflow-hidden bg-slate-50/40">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 flex-shrink-0">
            <span className="text-xs font-medium text-slate-600">Unscheduled</span>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">
              {unscheduledTasks.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {unscheduledTasks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">All tasks scheduled</p>
            ) : (
              unscheduledTasks.map(task => (
                <UnscheduledCard
                  key={task.id}
                  task={task}
                  column={colMap[task.columnId]}
                  isSelected={selectedTaskId === task.id}
                  onSelect={onSelectTask}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragTask ? (
          <div className="px-2 py-1.5 bg-white border border-blue-300 rounded-md shadow-xl text-xs font-medium text-slate-700 opacity-90 max-w-[180px] truncate">
            {activeDragTask.title}
          </div>
        ) : null}
      </DragOverlay>

      {/* Overflow popover */}
      {overflowDate && (
        <OverflowPopover
          dateStr={overflowDate}
          allTasks={tasksByDate[overflowDate] ?? []}
          columns={columns}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          onClose={() => setOverflowDate(null)}
        />
      )}
    </DndContext>
  )
}
