import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
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

// ─── Exported pure helpers (tested in ProjectTasks.tasks.test.jsx) ────────────

/**
 * Returns true if dueDate string (YYYY-MM-DD) is strictly before today.
 * Returns false for null, undefined, or empty string.
 */
export function isOverdue(dueDate) {
  if (!dueDate) return false
  const today = new Date().toISOString().slice(0, 10)
  return dueDate < today
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
        return <span className="font-medium text-slate-800">{task.title}</span>
      }
      if (col.id === 'status') {
        const column = colMap[task.columnId]
        if (!column) return <span className="text-slate-400 text-xs">—</span>
        return (
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: column.color }}
          >
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
        if (!task.dueDate) return <span className="text-slate-400 text-xs">—</span>
        const overdue = isOverdue(task.dueDate)
        return (
          <span className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-slate-500'}`}>
            {task.dueDate}
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

// ─── TaskDetailPanel ──────────────────────────────────────────────────────────

function TaskDetailPanel({ task, columns, fieldDefs, onClose, onRefresh }) {
  const [form, setForm] = useState({ ...task })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  return (
    <div className="w-[380px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700 truncate">Task Details</h3>
        <div className="flex items-center gap-1">
          {saving && <span className="text-xs text-slate-400">Saving...</span>}
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

        {/* Status (column) */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
          <select
            value={form.columnId ?? ''}
            onChange={e => {
              setForm(prev => ({ ...prev, columnId: e.target.value }))
              saveField('columnId', e.target.value)
            }}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
          >
            {columns.map(col => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
          </select>
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

        {/* Due Date */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Due Date</label>
          <input
            type="date"
            value={form.dueDate ?? ''}
            onChange={e => {
              setForm(prev => ({ ...prev, dueDate: e.target.value || null }))
              saveField('dueDate', e.target.value || null)
            }}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
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
    <div className="flex h-full overflow-hidden">
      {/* Main area */}
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

        {/* View placeholder */}
        <div className="flex-1 overflow-auto">
          {view === 'kanban' && (
            <KanbanPlaceholder
              columns={columns}
              tasks={tasks}
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
            <CalendarPlaceholder
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
            />
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          columns={columns}
          fieldDefs={fieldDefs}
          onClose={handleClosePanel}
          onRefresh={refreshTasks}
        />
      )}
    </div>
  )
}

// ─── Placeholder views (replaced by Plans 02-04) ─────────────────────────────

function KanbanPlaceholder({ columns, tasks, selectedTaskId, onSelectTask, onRefresh }) {
  return (
    <div className="flex gap-4 p-6 h-full">
      {columns.map(col => {
        const colTasks = tasks.filter(t => t.columnId === col.id).sort((a, b) => a.position - b.position)
        return (
          <div key={col.id} className="w-64 flex-shrink-0 flex flex-col">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm font-semibold text-white"
              style={{ backgroundColor: col.color }}
            >
              <span>{col.name}</span>
              <span className="ml-auto bg-white/20 rounded-full px-1.5 py-0.5 text-xs">{colTasks.length}</span>
            </div>
            <div className="flex-1 bg-slate-50 rounded-b-lg border border-slate-200 border-t-0 p-2 space-y-2 min-h-[120px]">
              {colTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className={`w-full text-left px-3 py-2 bg-white rounded-md border text-sm transition-colors shadow-sm hover:shadow ${
                    selectedTaskId === task.id ? 'border-blue-400 ring-1 ring-blue-300' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="font-medium text-slate-800 truncate">{task.title}</p>
                  {task.dueDate && (
                    <p className={`text-xs mt-1 ${new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-slate-400'}`}>
                      Due {task.dueDate}
                    </p>
                  )}
                  {task.priority !== 'none' && (
                    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-medium ${priorityConfig[task.priority]?.class}`}>
                      {priorityConfig[task.priority]?.label}
                    </span>
                  )}
                </button>
              ))}
              {colTasks.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No tasks</p>
              )}
            </div>
          </div>
        )
      })}
      {columns.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          No columns yet — coming soon
        </div>
      )}
    </div>
  )
}

function ListPlaceholder({ columns, tasks, selectedTaskId, onSelectTask }) {
  const colMap = Object.fromEntries(columns.map(c => [c.id, c]))
  return (
    <div className="p-6">
      {tasks.length === 0 ? (
        <div className="text-slate-400 text-sm text-center py-12">
          No tasks yet. Full list view coming in Plan 03.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200">
              <th className="pb-2 font-medium text-slate-500 pr-4">Title</th>
              <th className="pb-2 font-medium text-slate-500 pr-4">Status</th>
              <th className="pb-2 font-medium text-slate-500 pr-4">Priority</th>
              <th className="pb-2 font-medium text-slate-500">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map(task => (
              <tr
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedTaskId === task.id ? 'bg-blue-50' : ''}`}
              >
                <td className="py-2 pr-4 font-medium text-slate-800">{task.title}</td>
                <td className="py-2 pr-4 text-slate-500">{colMap[task.columnId]?.name ?? '—'}</td>
                <td className="py-2 pr-4">
                  {task.priority !== 'none' && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityConfig[task.priority]?.class}`}>
                      {priorityConfig[task.priority]?.label}
                    </span>
                  )}
                </td>
                <td className="py-2 text-slate-400 text-xs">{task.dueDate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CalendarPlaceholder({ tasks }) {
  const scheduled = tasks.filter(t => t.dueDate)
  return (
    <div className="flex-1 flex items-center justify-center text-center p-12">
      <div>
        <Icon name="calendar_month" className="text-[48px] text-slate-300 mb-3" />
        <p className="text-slate-500 font-medium">Calendar View</p>
        <p className="text-slate-400 text-sm mt-1">
          {scheduled.length} task{scheduled.length !== 1 ? 's' : ''} with due dates. Full calendar coming in Plan 04.
        </p>
      </div>
    </div>
  )
}
