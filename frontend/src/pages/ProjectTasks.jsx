import { useState, useEffect, useCallback } from 'react'
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
            <ListPlaceholder
              columns={columns}
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
              onRefresh={refreshTasks}
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
