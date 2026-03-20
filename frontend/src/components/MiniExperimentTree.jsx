import { useState, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'

/**
 * MiniExperimentTree — compact experiment tree for the Gap Analysis planning board right column.
 *
 * Each node is a useDroppable drop target. Dropping a suggestion card on a node
 * promotes it as a child of that experiment. A special "__root__" drop target at
 * the top creates the experiment at the tree root.
 *
 * Props:
 *   flatExperiments  — flat array of experiments from parent
 *   projectId        — project UUID (unused here; parent handles the create call)
 *   onRefresh        — callback to trigger after external tree mutations
 */

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const STATUS_COLORS = {
  planned:   'bg-slate-300',
  running:   'bg-blue-400',
  completed: 'bg-emerald-400',
  failed:    'bg-red-400',
}

function buildExperimentTree(flatExperiments) {
  const byId = Object.fromEntries(flatExperiments.map(e => [e.id, { ...e, children: [] }]))
  const roots = []
  for (const exp of Object.values(byId)) {
    if (exp.parentId) {
      if (byId[exp.parentId]) byId[exp.parentId].children.push(exp)
    } else {
      roots.push(exp)
    }
  }
  return roots
}

function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: '__root__' })

  return (
    <div
      ref={setNodeRef}
      className={`mb-2 px-2 py-2 rounded-lg border-2 border-dashed text-xs text-center transition-all ${
        isOver
          ? 'border-blue-400 bg-blue-50 text-blue-600'
          : 'border-slate-200 text-slate-400'
      }`}
    >
      <Icon name="move_to_inbox" className="text-[14px] mr-1 align-middle" />
      Drop here to create at root level
    </div>
  )
}

function MiniTreeNode({ experiment, depth, expandedIds, setExpandedIds }) {
  const { setNodeRef, isOver } = useDroppable({ id: experiment.id })
  const hasChildren = experiment.children && experiment.children.length > 0
  const isExpanded = expandedIds.has(experiment.id)
  const statusColor = STATUS_COLORS[experiment.status] || 'bg-slate-300'

  // Auto-expand on hover during drag: 600ms timer
  useEffect(() => {
    if (!isOver || !hasChildren || isExpanded) return
    const timer = setTimeout(() => {
      setExpandedIds(prev => {
        const next = new Set(prev)
        next.add(experiment.id)
        return next
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [isOver, hasChildren, isExpanded, experiment.id, setExpandedIds])

  function toggleExpand(e) {
    e.stopPropagation()
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(experiment.id)) {
        next.delete(experiment.id)
      } else {
        next.add(experiment.id)
      }
      return next
    })
  }

  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ paddingLeft: depth * 16 }}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-all ${
          isOver
            ? 'bg-blue-50 border border-blue-200 border-dashed'
            : 'hover:bg-slate-50 border border-transparent'
        }`}
      >
        {/* Chevron for expand/collapse */}
        <button
          onClick={toggleExpand}
          className={`flex-shrink-0 text-slate-400 transition-transform ${hasChildren ? 'hover:text-slate-600' : 'invisible'}`}
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <Icon name="chevron_right" className="text-[14px]" />
        </button>

        {/* Science icon */}
        <Icon name="science" className="text-[14px] text-slate-400 flex-shrink-0" />

        {/* Name */}
        <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
          {experiment.name}
        </span>

        {/* Status dot */}
        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${statusColor}`} title={experiment.status} />
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {experiment.children.map(child => (
            <MiniTreeNode
              key={child.id}
              experiment={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              setExpandedIds={setExpandedIds}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function MiniExperimentTree({ flatExperiments }) {
  const tree = buildExperimentTree(flatExperiments || [])

  // Default: top-level nodes expanded
  const [expandedIds, setExpandedIds] = useState(() => {
    return new Set(tree.map(n => n.id))
  })

  // Re-sync expanded defaults when tree roots change (e.g. new experiment added)
  useEffect(() => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      tree.forEach(n => next.add(n.id))
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatExperiments?.length])

  return (
    <div className="flex flex-col h-full">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
        Experiment Tree
      </p>
      <div className="border border-slate-200 rounded-lg bg-slate-50/50 p-2 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {/* Root drop zone */}
        <RootDropZone />

        {tree.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            No experiments yet
          </p>
        ) : (
          tree.map(exp => (
            <MiniTreeNode
              key={exp.id}
              experiment={exp}
              depth={0}
              expandedIds={expandedIds}
              setExpandedIds={setExpandedIds}
            />
          ))
        )}
      </div>
    </div>
  )
}
