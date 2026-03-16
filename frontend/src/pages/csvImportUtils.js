/**
 * Pure utility functions for CSV-to-experiment-tree conversion.
 * All functions are stateless and side-effect free.
 */

// ---------------------------------------------------------------------------
// Type detection
// ---------------------------------------------------------------------------

/**
 * Detect the JavaScript type of a raw string value.
 * Copied from ProjectDetail.jsx — do not diverge.
 */
export function detectType(raw) {
  const trimmed = String(raw).trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const num = Number(trimmed)
  if (trimmed !== '' && !isNaN(num)) return num
  return trimmed
}

// ---------------------------------------------------------------------------
// Auto-detect column roles
// ---------------------------------------------------------------------------

/**
 * Auto-detect column roles based on header names and sample row values.
 *
 * Rules:
 * - Empty column name → "skip"
 * - All non-empty values parse as numbers → "metric"
 * - Otherwise → "config"
 *
 * @param {string[]} headers - Column header names
 * @param {object[]} sampleRows - Array of row objects (key = header, value = raw string)
 * @returns {object} Map of header -> "metric" | "config" | "skip"
 */
export function autoDetectColumnRoles(headers, sampleRows) {
  const roles = {}
  for (const header of headers) {
    if (!header || header.trim() === '') {
      roles[header] = 'skip'
      continue
    }
    const values = sampleRows
      .map((row) => row[header])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
    if (values.length === 0) {
      roles[header] = 'config'
      continue
    }
    const allNumeric = values.every((v) => {
      const trimmed = String(v).trim()
      return trimmed !== '' && !isNaN(Number(trimmed))
    })
    roles[header] = allNumeric ? 'metric' : 'config'
  }
  return roles
}

// ---------------------------------------------------------------------------
// Name generation
// ---------------------------------------------------------------------------

/**
 * Auto-generate an experiment name by concatenating config key=value pairs.
 * Truncates to maxLength chars with "..." if the result exceeds it.
 *
 * @param {object} row - The CSV row object
 * @param {string[]} configCols - Column names to use for name generation
 * @param {number} maxLength - Maximum length before truncation (default 60)
 * @param {number} [rowIndex] - Fallback index if no configCols (default 1)
 * @returns {string} Generated name
 */
export function autoGenerateName(row, configCols, maxLength = 60, rowIndex = 1) {
  if (!configCols || configCols.length === 0) {
    return `experiment_${rowIndex}`
  }
  const parts = configCols.map((col) => `${col}=${row[col] ?? ''}`)
  const name = parts.join('_')
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength - 3) + '...'
}

// ---------------------------------------------------------------------------
// Collision detection
// ---------------------------------------------------------------------------

/**
 * Detect a name collision within the same parent scope.
 *
 * Only matches within the same parent scope — two experiments named "resnet"
 * under different parents are NOT collisions.
 *
 * @param {string} name - Candidate experiment name
 * @param {string|null} parentTmpId - Temporary ID of the parent in the import tree (null = root)
 * @param {Array<{id: string, name: string, parentId: string | null}>} existingExperiments
 * @param {string|null} targetParentId - Real parent ID at the root target level
 * @returns {object|null} Matching experiment or null
 */
export function detectCollision(name, parentTmpId, existingExperiments, targetParentId) {
  // When parentTmpId is null the leaf is at the root import target level
  // Only check against experiments whose parent matches targetParentId
  if (parentTmpId !== null) return null
  const match = existingExperiments.find(
    (exp) => exp.name === name && (exp.parentId ?? null) === (targetParentId ?? null)
  )
  return match || null
}

// ---------------------------------------------------------------------------
// Import tree construction
// ---------------------------------------------------------------------------

let _tmpIdCounter = 0

/**
 * Reset the tmp ID counter — useful in tests to get deterministic IDs.
 */
export function resetTmpIdCounter() {
  _tmpIdCounter = 0
}

function nextTmpId(prefix = 'tmp') {
  return `${prefix}_${++_tmpIdCounter}`
}

function _findNodeByTmpId(nodes, tmpId) {
  for (const node of nodes) {
    if (node._tmpId === tmpId) return node
    const found = _findNodeByTmpId(node.children, tmpId)
    if (found) return found
  }
  return null
}

/**
 * Build a hierarchical import tree from CSV rows and column mapping.
 *
 * mapping shape:
 * {
 *   nameCol: string | null,
 *   groupCols: Array<{ col: string, priority: number }>,  // Group 1 = lowest priority number
 *   configCols: string[],
 *   metricCols: string[],
 *   skipCols: string[],
 * }
 *
 * Each node:
 * { _tmpId, _type: "group"|"leaf", name, config, metrics, children, parentTmpId, _collision }
 *
 * Group values are stored on BOTH group nodes AND leaf experiments as config keys —
 * ensures comparison modal works without needing to traverse up the tree.
 *
 * @param {object[]} rows - Parsed CSV rows
 * @param {object} mapping - Column mapping
 * @param {object[]} existingExps - Existing experiments for collision detection
 * @param {string|null} [targetParentId] - Real ID of the root target group (null = root level)
 * @returns {object[]} Root nodes of the import tree
 */
export function buildImportTree(rows, mapping, existingExps, targetParentId = null) {
  const { nameCol = null, groupCols = [], configCols = [], metricCols = [] } = mapping

  // Sort group cols by priority (ascending — Group 1 first)
  const sortedGroupCols = [...groupCols].sort((a, b) => a.priority - b.priority)

  // Path-keyed map: path string → group node
  const groupNodeMap = new Map()
  const roots = []

  rows.forEach((row, rowIdx) => {
    // Collect all group column key-value pairs for this row (for leaf config propagation)
    const groupKVs = {}
    for (const gc of sortedGroupCols) {
      groupKVs[gc.col] = detectType(row[gc.col] ?? '')
    }

    // Collect config values
    const configKVs = {}
    for (const col of configCols) {
      configKVs[col] = detectType(row[col] ?? '')
    }

    // Collect metric values
    const metricKVs = {}
    for (const col of metricCols) {
      metricKVs[col] = detectType(row[col] ?? '')
    }

    // Ensure group hierarchy exists, building nodes as needed
    let parentTmpId = null
    let currentPathKey = ''

    for (let depth = 0; depth < sortedGroupCols.length; depth++) {
      const gc = sortedGroupCols[depth]
      const val = String(row[gc.col] ?? '')
      currentPathKey += `|${gc.col}=${val}`

      if (!groupNodeMap.has(currentPathKey)) {
        // Build config for the group node: include all group cols up to this depth
        const groupNodeConfig = {}
        for (let i = 0; i <= depth; i++) {
          const gci = sortedGroupCols[i]
          groupNodeConfig[gci.col] = detectType(row[gci.col] ?? '')
        }

        const groupNode = {
          _tmpId: nextTmpId('grp'),
          _type: 'group',
          name: val,
          config: groupNodeConfig,
          metrics: {},
          children: [],
          parentTmpId,
        }

        groupNodeMap.set(currentPathKey, groupNode)

        if (parentTmpId === null) {
          roots.push(groupNode)
        } else {
          const parentNode = _findNodeByTmpId(roots, parentTmpId)
          if (parentNode) parentNode.children.push(groupNode)
        }
      }

      parentTmpId = groupNodeMap.get(currentPathKey)._tmpId
    }

    // Determine leaf name
    const leafName =
      nameCol && String(row[nameCol] ?? '').trim()
        ? String(row[nameCol]).trim()
        : autoGenerateName(row, configCols, 60, rowIdx + 1)

    // Leaf config = all group KVs + all config KVs (group values duplicated on leaf)
    const leafConfig = { ...groupKVs, ...configKVs }

    // Detect collision only at root import target level (parentTmpId === null)
    const collision = detectCollision(leafName, parentTmpId, existingExps, targetParentId)

    const leafNode = {
      _tmpId: nextTmpId('leaf'),
      _type: 'leaf',
      name: leafName,
      config: leafConfig,
      metrics: metricKVs,
      children: [],
      parentTmpId,
      _collision: collision,
    }

    if (parentTmpId === null) {
      roots.push(leafNode)
    } else {
      const parentNode = _findNodeByTmpId(roots, parentTmpId)
      if (parentNode) parentNode.children.push(leafNode)
    }
  })

  return roots
}

// ---------------------------------------------------------------------------
// BFS flatten
// ---------------------------------------------------------------------------

/**
 * Flatten an import tree using BFS to guarantee parent-before-child ordering.
 *
 * @param {object[]} roots - Root nodes of the import tree
 * @returns {object[]} Flat array with parents always before their children
 */
export function bfsFlattenImportTree(roots) {
  const result = []
  const queue = [...roots]
  while (queue.length > 0) {
    const node = queue.shift()
    result.push(node)
    if (node.children && node.children.length > 0) {
      queue.push(...node.children)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Metric merging
// ---------------------------------------------------------------------------

/**
 * Merge incoming metrics into existing metrics.
 *
 * @param {object} existing - Current metrics dict
 * @param {object} incoming - New metrics from CSV
 * @param {boolean} merge - If true: merge (incoming wins conflicts, keep non-overlapping)
 *                          If false: overwrite (return incoming only)
 * @returns {object} Resulting metrics dict
 */
export function mergeMetrics(existing, incoming, merge) {
  if (!merge) return { ...incoming }
  return { ...existing, ...incoming }
}
