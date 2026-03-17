/**
 * CSVImportModal — 4-step wizard for importing CSV experiment results.
 *
 * Step 1: Upload CSV file
 * Step 2: Map columns to roles (Name, Config, Metric, Group, Skip)
 * Step 3: Preview tree with collision warnings + per-row controls
 * Step 4: Confirm & Import
 */
import { useState, useRef, useCallback, useMemo } from 'react'
import Papa from 'papaparse'
import WindowModal from '../components/WindowModal'
import { experimentsApi } from '../services/api'
import {
  autoDetectColumnRoles,
  autoGenerateName,
  buildImportTree,
  bfsFlattenImportTree,
  resetTmpIdCounter,
} from './csvImportUtils'

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

// ---------------------------------------------------------------------------
// StepIndicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, steps }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6 select-none">
      {steps.map((label, idx) => {
        const stepNum = idx + 1
        const done = stepNum < current
        const active = stepNum === current
        return (
          <div key={stepNum} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-400'
                }`}
              >
                {done ? <Icon name="check" className="text-[14px]" /> : stepNum}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                  active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 mb-4 mx-1 ${
                  done ? 'bg-emerald-400' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

export default function CSVImportModal({ projectId, existingExperiments = [], onImported, onClose }) {
  const [step, setStep] = useState(1)

  // Step 1 state
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null) // { headers: [], rows: [] }
  const [parseError, setParseError] = useState(null)
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  // Step 2 state
  const [columnRoles, setColumnRoles] = useState({}) // { [header]: role }
  const [groupPriorities, setGroupPriorities] = useState([]) // ordered group column names
  const [parentGroupId, setParentGroupId] = useState(null) // null = root level
  const [mergeMode, setMergeMode] = useState('overwrite') // 'overwrite' | 'merge'

  // Step 3 state
  const [previewTree, setPreviewTree] = useState([]) // from buildImportTree
  const [collisionActions, setCollisionActions] = useState({}) // { tmpId: 'create'|'update'|'skip' }
  const [excludedIds, setExcludedIds] = useState(new Set()) // excluded leaf _tmpIds
  const [renames, setRenames] = useState({}) // { tmpId: newName }
  const [editingNode, setEditingNode] = useState(null) // tmpId being renamed

  // Step 4 state
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importResult, setImportResult] = useState(null) // null while in-progress

  const STEPS = ['Upload', 'Map Columns', 'Preview', 'Confirm']

  // ── Group candidates from existing experiments ──────────────────────────
  const existingGroups = useMemo(() => {
    const parentIds = new Set(
      existingExperiments.filter((e) => e.parentId).map((e) => e.parentId)
    )
    const groups = existingExperiments.filter((e) => {
      const hasChildren = existingExperiments.some((c) => c.parentId === e.id)
      return hasChildren || parentIds.has(e.id)
    })
    return groups
  }, [existingExperiments])

  // ── Derived column categories from step 2 mapping ───────────────────────
  const mapping = useMemo(() => {
    const nameCol = Object.entries(columnRoles).find(([, r]) => r === 'name')?.[0] ?? null
    const groupCols = groupPriorities
      .filter((col) => columnRoles[col] === 'group')
      .map((col, idx) => ({ col, priority: idx + 1 }))
    const configCols = Object.entries(columnRoles)
      .filter(([, r]) => r === 'config')
      .map(([col]) => col)
    const metricCols = Object.entries(columnRoles)
      .filter(([, r]) => r === 'metric')
      .map(([col]) => col)
    return { nameCol, groupCols, configCols, metricCols, skipCols: [] }
  }, [columnRoles, groupPriorities])

  // ── Step 1: File handling ────────────────────────────────────────────────

  const processFile = useCallback((f) => {
    setParseError(null)
    if (!f) return
    if (!f.name.endsWith('.csv')) {
      setParseError('Please upload a .csv file.')
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setParseError('File exceeds 5 MB limit.')
      return
    }
    setFile(f)

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (result) => {
        const headers = result.meta.fields || []
        const rows = result.data.filter((row) =>
          Object.values(row).some((v) => String(v).trim() !== '')
        )
        if (rows.length === 0) {
          setParseError('CSV file has no data rows.')
          return
        }
        setParsed({ headers, rows })
        const sampleRows = rows.slice(0, 3)
        const detected = autoDetectColumnRoles(headers, sampleRows)
        // Map "metric"/"config" roles; "skip" for empty headers
        const roles = {}
        for (const h of headers) {
          roles[h] = detected[h] || 'config'
        }
        setColumnRoles(roles)
        setGroupPriorities([]) // reset group ordering
        setParentGroupId(null)
        setMergeMode('overwrite')
        setStep(2)
      },
      error: (err) => {
        setParseError(`Parse error: ${err.message}`)
      },
    })
  }, [])

  const handleFileInput = (e) => {
    processFile(e.target.files[0])
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files[0])
  }

  // ── Step 2: Column mapping ───────────────────────────────────────────────

  const ROLE_OPTIONS = [
    { value: 'name', label: 'Experiment Name' },
    { value: 'config', label: 'Config' },
    { value: 'metric', label: 'Metric' },
    { value: 'group', label: 'Group' },
    { value: 'skip', label: 'Skip' },
  ]

  function handleRoleChange(header, newRole) {
    setColumnRoles((prev) => {
      const next = { ...prev }
      // Only one column can be Experiment Name
      if (newRole === 'name') {
        for (const h of Object.keys(next)) {
          if (next[h] === 'name') next[h] = 'config'
        }
      }
      next[header] = newRole
      // Update group priorities
      if (newRole === 'group') {
        setGroupPriorities((gp) => (gp.includes(header) ? gp : [...gp, header]))
      } else {
        setGroupPriorities((gp) => gp.filter((h) => h !== header))
      }
      return next
    })
  }

  function moveGroupPriority(colName, direction) {
    setGroupPriorities((gp) => {
      const idx = gp.indexOf(colName)
      if (idx === -1) return gp
      const next = [...gp]
      const swap = idx + direction
      if (swap < 0 || swap >= next.length) return next
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  function handleBuildTree() {
    resetTmpIdCounter()
    const tree = buildImportTree(
      parsed.rows,
      mapping,
      existingExperiments.map((e) => ({ id: e.id, name: e.name, parentId: e.parentId ?? null })),
      parentGroupId
    )
    setPreviewTree(tree)
    setCollisionActions({})
    setExcludedIds(new Set())
    setRenames({})
    setEditingNode(null)
    setStep(3)
  }

  // ── Step 3: Preview helpers ──────────────────────────────────────────────

  function countLeaves(nodes) {
    let count = 0
    function walk(arr) {
      for (const n of arr) {
        if (n._type === 'leaf') count++
        if (n.children?.length) walk(n.children)
      }
    }
    walk(nodes)
    return count
  }

  function countGroups(nodes) {
    let count = 0
    function walk(arr) {
      for (const n of arr) {
        if (n._type === 'group') count++
        if (n.children?.length) walk(n.children)
      }
    }
    walk(nodes)
    return count
  }

  /** Collect all leaf _tmpIds that are descendants of a node (including itself if leaf). */
  function collectLeafIds(node) {
    const ids = []
    function walk(n) {
      if (n._type === 'leaf') ids.push(n._tmpId)
      if (n.children?.length) n.children.forEach(walk)
    }
    walk(node)
    return ids
  }

  /** Determine tri-state for a group node: 'all' | 'none' | 'mixed' */
  function groupCheckState(node) {
    const leafIds = collectLeafIds(node)
    if (leafIds.length === 0) return 'all'
    const excluded = leafIds.filter((id) => excludedIds.has(id)).length
    if (excluded === 0) return 'all'
    if (excluded === leafIds.length) return 'none'
    return 'mixed'
  }

  /** Toggle all leaf descendants of a group node. */
  function toggleGroupNode(node) {
    const leafIds = collectLeafIds(node)
    if (leafIds.length === 0) return
    const state = groupCheckState(node)
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (state === 'all' || state === 'mixed') {
        // Exclude all
        leafIds.forEach((id) => next.add(id))
      } else {
        // Include all
        leafIds.forEach((id) => next.delete(id))
      }
      return next
    })
  }

  // ── Step 4: Import ───────────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true)
    setImportError(null)
    try {
      const allFlat = bfsFlattenImportTree(previewTree)
      const included = allFlat.filter((n) => !excludedIds.has(n._tmpId))

      const items = included.map((n) => {
        const name = renames[n._tmpId] ?? n.name
        const collisionAction =
          n._type === 'leaf' && n._collision
            ? collisionActions[n._tmpId] ?? 'create'
            : n._type === 'group'
            ? 'create'
            : 'create'
        const existingId = collisionAction === 'update' ? n._collision?.id ?? null : null

        return {
          tmpId: n._tmpId,
          parentTmpId: n.parentTmpId ?? null,
          name,
          config: n.config ?? {},
          metrics: n.metrics ?? {},
          collisionAction,
          existingId,
        }
      })

      await experimentsApi.importCsv(projectId, {
        items,
        parentId: parentGroupId,
        mergeMetrics: mergeMode === 'merge',
      })

      const created = items.filter((i) => i.collisionAction === 'create').length
      const updated = items.filter((i) => i.collisionAction === 'update').length
      const skipped = items.filter((i) => i.collisionAction === 'skip').length
      setImportResult({ created, updated, skipped })
    } catch (err) {
      setImportError(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // ── Renders ──────────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Upload a CSV file to import experiments. Each row becomes one experiment.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
            dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          }`}
        >
          <Icon name="upload_file" className="text-slate-400 text-[40px]" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">
              Drop your CSV file here or <span className="text-blue-600 underline">browse</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">CSV files only, max 5 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {parseError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <Icon name="error" className="text-[16px]" />
            {parseError}
          </div>
        )}

        {parsed && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-2">
            <Icon name="check_circle" className="text-[14px]" />
            Parsed {parsed.rows.length} rows, {parsed.headers.length} columns
          </div>
        )}
      </div>
    )
  }

  function renderStep2() {
    if (!parsed) return null
    const sampleRows = parsed.rows.slice(0, 3)

    return (
      <div className="space-y-4">
        {/* Parent group picker */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700 whitespace-nowrap">
            Import into:
          </label>
          <select
            value={parentGroupId ?? ''}
            onChange={(e) => setParentGroupId(e.target.value || null)}
            className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Root level (no parent)</option>
            {existingGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Merge mode */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-slate-700">On name collision:</label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input
              type="radio"
              name="mergeMode"
              value="overwrite"
              checked={mergeMode === 'overwrite'}
              onChange={() => setMergeMode('overwrite')}
              className="accent-blue-600"
            />
            Overwrite metrics
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input
              type="radio"
              name="mergeMode"
              value="merge"
              checked={mergeMode === 'merge'}
              onChange={() => setMergeMode('merge')}
              className="accent-blue-600"
            />
            Merge metrics (CSV wins)
          </label>
        </div>

        {/* Column mapping table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 w-1/3">
                  Column
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 w-1/3">
                  Sample Values
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 w-1/3">
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {parsed.headers.map((header, idx) => {
                const isGroup = columnRoles[header] === 'group'
                const groupIdx = groupPriorities.indexOf(header)
                return (
                  <tr
                    key={header}
                    className={`border-b border-slate-100 last:border-0 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-700 truncate max-w-[120px]">
                      {header || <span className="text-slate-400 italic">(empty)</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400 truncate max-w-[140px]">
                      {sampleRows.map((r) => r[header]).filter(Boolean).slice(0, 3).join(', ')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={columnRoles[header] || 'skip'}
                          onChange={(e) => handleRoleChange(header, e.target.value)}
                          className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {isGroup && opt.value === 'group'
                                ? `Group ${groupIdx + 1}`
                                : opt.label}
                            </option>
                          ))}
                        </select>
                        {isGroup && (
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => moveGroupPriority(header, -1)}
                              disabled={groupIdx === 0}
                              className="text-slate-400 hover:text-slate-700 disabled:opacity-30 leading-none"
                              title="Increase priority (move up)"
                            >
                              <Icon name="arrow_upward" className="text-[12px]" />
                            </button>
                            <button
                              onClick={() => moveGroupPriority(header, 1)}
                              disabled={groupIdx === groupPriorities.length - 1}
                              className="text-slate-400 hover:text-slate-700 disabled:opacity-30 leading-none"
                              title="Decrease priority (move down)"
                            >
                              <Icon name="arrow_downward" className="text-[12px]" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function renderPreviewNode(node, depth = 0) {
    const name = renames[node._tmpId] ?? node.name
    const isLeaf = node._type === 'leaf'
    const excluded = isLeaf
      ? excludedIds.has(node._tmpId)
      : groupCheckState(node) === 'none'
    const isEditing = editingNode === node._tmpId
    const hasCollision = isLeaf && node._collision
    const collisionAction = collisionActions[node._tmpId] ?? 'create'

    // For group nodes: determine tri-state
    const checkState = isLeaf ? (excluded ? 'none' : 'all') : groupCheckState(node)

    return (
      <div key={node._tmpId} style={{ paddingLeft: depth * 18 }}>
        <div
          className={`flex items-center gap-2 py-1 px-2 rounded-md group ${
            excluded
              ? 'opacity-40'
              : hasCollision
              ? 'bg-amber-50 border border-amber-200'
              : 'hover:bg-slate-50'
          }`}
        >
          {/* Exclude checkbox — leaf: direct toggle; group: tri-state toggle all descendants */}
          <input
            type="checkbox"
            checked={checkState === 'all'}
            ref={(el) => {
              if (el) el.indeterminate = checkState === 'mixed'
            }}
            onChange={() => {
              if (isLeaf) {
                setExcludedIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(node._tmpId)) next.delete(node._tmpId)
                  else next.add(node._tmpId)
                  return next
                })
              } else {
                toggleGroupNode(node)
              }
            }}
            className="accent-blue-600 flex-shrink-0"
          />

          {/* Icon */}
          <Icon
            name={isLeaf ? 'science' : 'folder'}
            className={`text-[14px] flex-shrink-0 ${
              isLeaf ? 'text-blue-400' : 'text-amber-500'
            }`}
          />

          {/* Name (double-click to rename) */}
          {isEditing ? (
            <input
              autoFocus
              className="text-xs border border-blue-300 rounded px-1 py-0.5 flex-1 min-w-0"
              defaultValue={name}
              onBlur={(e) =>
                setRenames((prev) => {
                  setEditingNode(null)
                  const v = e.target.value.trim()
                  if (!v) return prev
                  return { ...prev, [node._tmpId]: v }
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
                if (e.key === 'Escape') setEditingNode(null)
              }}
            />
          ) : (
            <span
              className={`text-xs text-slate-800 truncate flex-1 min-w-0 cursor-pointer ${
                excluded ? 'line-through' : ''
              }`}
              onDoubleClick={() => setEditingNode(node._tmpId)}
              title="Double-click to rename"
            >
              {name}
            </span>
          )}

          {/* Children count badge for groups */}
          {!isLeaf && node.children.length > 0 && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
              {node.children.length}
            </span>
          )}

          {/* Collision badge + action dropdown for leaves */}
          {hasCollision && (
            <>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">
                name collision
              </span>
              <select
                value={collisionAction}
                onChange={(e) =>
                  setCollisionActions((prev) => ({
                    ...prev,
                    [node._tmpId]: e.target.value,
                  }))
                }
                className="text-[10px] border border-amber-300 rounded px-1.5 py-0.5 bg-white flex-shrink-0"
              >
                <option value="create">Create new</option>
                <option value="update">Update metrics</option>
                <option value="skip">Skip</option>
              </select>
            </>
          )}

          {/* Metric count for leaves */}
          {isLeaf && Object.keys(node.metrics ?? {}).length > 0 && (
            <span className="text-[10px] text-slate-400 flex-shrink-0">
              {Object.keys(node.metrics).length} metrics
            </span>
          )}
        </div>

        {/* Render children */}
        {node.children?.map((child) => renderPreviewNode(child, depth + 1))}
      </div>
    )
  }

  function renderStep3() {
    const totalLeaves = countLeaves(previewTree)
    const selectedLeaves = totalLeaves - excludedIds.size
    const groupCount = countGroups(previewTree)

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Review the experiments to be created. Double-click any name to rename.
          </p>
          <span className="text-xs text-slate-500 flex-shrink-0">
            {groupCount} groups
          </span>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-y-auto max-h-80 p-2">
          {previewTree.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No experiments to preview.</p>
          ) : (
            previewTree.map((node) => renderPreviewNode(node, 0))
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Uncheck rows to exclude them from import. Use collision dropdowns for name conflicts.
          </p>
          <span className="text-xs font-medium text-slate-600 flex-shrink-0">
            {selectedLeaves} of {totalLeaves} experiment{totalLeaves !== 1 ? 's' : ''} selected for import
          </span>
        </div>
      </div>
    )
  }

  function renderStep4() {
    const allFlat = bfsFlattenImportTree(previewTree)
    const included = allFlat.filter((n) => !excludedIds.has(n._tmpId))
    const leafCount = included.filter((n) => n._type === 'leaf').length
    const groupCount = included.filter((n) => n._type === 'group').length
    const parentName = parentGroupId
      ? existingExperiments.find((e) => e.id === parentGroupId)?.name ?? 'selected group'
      : 'project root'

    // Count by collision action for included leaves
    const includedLeaves = included.filter((n) => n._type === 'leaf')
    const creatingCount = includedLeaves.filter(
      (n) => !n._collision || (collisionActions[n._tmpId] ?? 'create') === 'create'
    ).length
    const updatingCount = includedLeaves.filter(
      (n) => n._collision && (collisionActions[n._tmpId] ?? 'create') === 'update'
    ).length
    const skippingCount = includedLeaves.filter(
      (n) => n._collision && (collisionActions[n._tmpId] ?? 'create') === 'skip'
    ).length

    if (importResult) {
      return (
        <div className="space-y-4 text-center py-4">
          <Icon name="check_circle" className="text-[48px] text-emerald-500" />
          <div>
            <p className="text-base font-semibold text-slate-800 mb-1">Import Complete</p>
            <p className="text-sm text-slate-600">
              {importResult.created > 0 && `${importResult.created} created`}
              {importResult.updated > 0 && `, ${importResult.updated} updated`}
              {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
            </p>
          </div>
          <button
            onClick={() => {
              onImported?.()
              onClose()
            }}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
          >
            Done
          </button>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-2 text-sm text-slate-700">
          <p>
            <span className="font-medium">{groupCount}</span> group{groupCount !== 1 ? 's' : ''} and{' '}
            <span className="font-medium">{leafCount}</span> experiment{leafCount !== 1 ? 's' : ''} will be imported under{' '}
            <span className="font-medium">{parentName}</span>.
          </p>
          {leafCount > 0 && (
            <p className="text-xs text-slate-500">
              {creatingCount > 0 && <span className="text-emerald-700">Creating {creatingCount} new</span>}
              {updatingCount > 0 && (
                <span className={creatingCount > 0 ? 'text-slate-400' : ''}>
                  {creatingCount > 0 ? ', ' : ''}
                  <span className="text-blue-700">updating {updatingCount}</span>
                </span>
              )}
              {skippingCount > 0 && (
                <span>
                  {(creatingCount > 0 || updatingCount > 0) ? ', ' : ''}
                  <span className="text-slate-500">skipping {skippingCount}</span>
                </span>
              )}
            </p>
          )}
          <p>
            Metric merge mode:{' '}
            <span className="font-medium">
              {mergeMode === 'merge' ? 'Merge (CSV wins conflicts)' : 'Overwrite all metrics'}
            </span>
          </p>
        </div>

        {importError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <Icon name="error" className="text-[16px]" />
            {importError}
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={importing || included.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {importing ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Icon name="upload" className="text-[16px]" />
              Import {leafCount} Experiment{leafCount !== 1 ? 's' : ''}
            </>
          )}
        </button>
      </div>
    )
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleBack() {
    if (step === 3) {
      // Reset all preview state per research pitfall 2
      setPreviewTree([])
      setCollisionActions({})
      setExcludedIds(new Set())
      setRenames({})
      setEditingNode(null)
    }
    setStep((s) => Math.max(1, s - 1))
  }

  function handleNext() {
    if (step === 2) {
      handleBuildTree()
    } else if (step === 3) {
      setStep(4)
    }
  }

  const canGoNext =
    (step === 1 && parsed !== null) ||
    (step === 2) ||
    (step === 3 && previewTree.length > 0)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <WindowModal
      open={true}
      title="Import CSV"
      onClose={onClose}
      iconName="upload_file"
      iconWrapClassName="bg-blue-100"
      iconClassName="text-[16px] text-blue-600"
      position="center"
      normalPanelClassName="w-full max-w-[560px] rounded-2xl"
      fullscreenPanelClassName="w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] rounded-xl"
      bodyClassName="overflow-hidden"
    >
      <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
        <div className="px-6 pt-6 flex-shrink-0">
          <StepIndicator current={step} steps={STEPS} />
        </div>

        <div className="px-6 pb-2 flex-1 min-h-0 overflow-y-auto">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Footer navigation */}
        {!(step === 4 && importResult) && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
            <button
              onClick={step === 1 ? onClose : handleBack}
              className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 4 && (
              <button
                onClick={handleNext}
                disabled={!canGoNext}
                className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {step === 3 ? 'Continue' : 'Next'}
              </button>
            )}
          </div>
        )}
      </div>
    </WindowModal>
  )
}
