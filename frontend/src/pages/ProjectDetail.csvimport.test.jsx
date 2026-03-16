import { describe, it, expect } from 'vitest'
import {
  autoDetectColumnRoles,
  autoGenerateName,
  detectCollision,
  buildImportTree,
  bfsFlattenImportTree,
  mergeMetrics,
  detectType,
} from './csvImportUtils.js'

// ---------------------------------------------------------------------------
// detectType (CSV-00 — baseline, already implemented)
// ---------------------------------------------------------------------------
describe('detectType', () => {
  it('converts "true" to boolean true', () => {
    expect(detectType('true')).toBe(true)
  })
  it('converts "false" to boolean false', () => {
    expect(detectType('false')).toBe(false)
  })
  it('converts numeric strings to numbers', () => {
    expect(detectType('0.01')).toBe(0.01)
    expect(detectType('32')).toBe(32)
  })
  it('returns string for non-numeric values', () => {
    expect(detectType('resnet')).toBe('resnet')
  })
})

// ---------------------------------------------------------------------------
// CSV-06 — autoDetectColumnRoles
// ---------------------------------------------------------------------------
describe('autoDetectColumnRoles (CSV-06)', () => {
  it('assigns all-numeric columns as metric and string/mixed columns as config', () => {
    const headers = ['lr', 'batch_size', 'accuracy', 'loss', 'model']
    const sampleRows = [
      { lr: '0.01', batch_size: '32',    accuracy: '0.91', loss: '0.45', model: 'resnet' },
      { lr: '0.001',batch_size: 'large', accuracy: '0.88', loss: '0.52', model: 'vgg'    },
      { lr: '0.1',  batch_size: '64',    accuracy: '0.93', loss: '0.41', model: 'bert'   },
    ]
    const roles = autoDetectColumnRoles(headers, sampleRows)
    // All-numeric: lr, accuracy, loss → metric
    expect(roles['lr']).toBe('metric')
    expect(roles['accuracy']).toBe('metric')
    expect(roles['loss']).toBe('metric')
    // Mixed / string: batch_size (one non-numeric), model (all string) → config
    expect(roles['batch_size']).toBe('config')
    expect(roles['model']).toBe('config')
  })

  it('assigns "skip" to columns with empty header names', () => {
    const headers = ['lr', '', 'accuracy']
    const sampleRows = [
      { lr: '0.01', '': 'garbage', accuracy: '0.91' },
    ]
    const roles = autoDetectColumnRoles(headers, sampleRows)
    expect(roles['']).toBe('skip')
  })
})

// ---------------------------------------------------------------------------
// CSV-03 — autoGenerateName
// ---------------------------------------------------------------------------
describe('autoGenerateName (CSV-03)', () => {
  it('concatenates key=value pairs with _ separator', () => {
    const row = { lr: '0.01', bs: '32', model: 'resnet' }
    const configCols = ['lr', 'bs', 'model']
    const name = autoGenerateName(row, configCols)
    expect(name).toBe('lr=0.01_bs=32_model=resnet')
  })

  it('truncates to maxLength (60) with "..." suffix when too long', () => {
    const row = { col_a: 'a'.repeat(30), col_b: 'b'.repeat(30) }
    const configCols = ['col_a', 'col_b']
    const name = autoGenerateName(row, configCols, 60)
    expect(name.length).toBeLessThanOrEqual(60)
    expect(name.endsWith('...')).toBe(true)
  })

  it('returns fallback name when configCols is empty', () => {
    const row = { lr: '0.01' }
    const configCols = []
    const name = autoGenerateName(row, configCols)
    // Should return something non-empty like "experiment_1" or "experiment"
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// CSV-04 — detectCollision
// ---------------------------------------------------------------------------
describe('detectCollision (CSV-04)', () => {
  it('returns existing experiment when name matches under the same parent', () => {
    const existing = [
      { id: 'exp_1', name: 'exp1', parentId: 'grp_1' },
    ]
    const result = detectCollision('exp1', null, existing, 'grp_1')
    expect(result).not.toBeNull()
    expect(result.id).toBe('exp_1')
  })

  it('returns null when name matches but parent is different', () => {
    const existing = [
      { id: 'exp_1', name: 'exp1', parentId: 'grp_2' },
    ]
    const result = detectCollision('exp1', null, existing, 'grp_1')
    expect(result).toBeNull()
  })

  it('returns null when name does not match', () => {
    const existing = [
      { id: 'exp_1', name: 'exp2', parentId: 'grp_1' },
    ]
    const result = detectCollision('exp1', null, existing, 'grp_1')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// CSV-01 — buildImportTree (group hierarchy)
// ---------------------------------------------------------------------------
describe('buildImportTree (CSV-01)', () => {
  it('builds 2 group nodes from 4 rows with 2 distinct Group-1 values', () => {
    const rows = [
      { model: 'resnet', lr: '0.01', accuracy: '0.91' },
      { model: 'resnet', lr: '0.001', accuracy: '0.88' },
      { model: 'vgg',    lr: '0.01', accuracy: '0.85' },
      { model: 'vgg',    lr: '0.001', accuracy: '0.82' },
    ]
    const mapping = {
      nameCol: null,
      groupCols: [{ col: 'model', priority: 1 }],
      configCols: ['lr'],
      metricCols: ['accuracy'],
      skipCols: [],
    }
    const tree = buildImportTree(rows, mapping, [])
    // Should have exactly 2 root group nodes
    expect(tree.length).toBe(2)
    const names = tree.map(n => n.name).sort()
    expect(names).toEqual(['resnet', 'vgg'])
    // Each group should have 2 leaf children
    const resnetNode = tree.find(n => n.name === 'resnet')
    expect(resnetNode.children.length).toBe(2)
  })

  it('builds nested hierarchy for 2 group columns (Group 1 > Group 2 > leaves)', () => {
    const rows = [
      { model: 'resnet', optimizer: 'adam', lr: '0.01', acc: '0.91' },
      { model: 'resnet', optimizer: 'sgd',  lr: '0.01', acc: '0.88' },
      { model: 'vgg',    optimizer: 'adam', lr: '0.01', acc: '0.85' },
      { model: 'vgg',    optimizer: 'sgd',  lr: '0.01', acc: '0.82' },
    ]
    const mapping = {
      nameCol: null,
      groupCols: [
        { col: 'model',     priority: 1 },
        { col: 'optimizer', priority: 2 },
      ],
      configCols: ['lr'],
      metricCols: ['acc'],
      skipCols: [],
    }
    const tree = buildImportTree(rows, mapping, [])
    // 2 top-level groups
    expect(tree.length).toBe(2)
    const resnetNode = tree.find(n => n.name === 'resnet')
    // resnet should have 2 sub-groups (adam, sgd)
    expect(resnetNode.children.length).toBe(2)
    const adamNode = resnetNode.children.find(n => n.name === 'adam')
    // adam under resnet should have 1 leaf
    expect(adamNode.children.length).toBe(1)
    expect(adamNode.children[0]._type).toBe('leaf')
  })
})

// ---------------------------------------------------------------------------
// CSV-02 — group values on both group nodes AND leaf experiments
// ---------------------------------------------------------------------------
describe('buildImportTree group-values propagation (CSV-02)', () => {
  it('stores group column value on both the group node config and leaf experiment config', () => {
    const rows = [
      { model_type: 'resnet', lr: '0.01', accuracy: '0.91' },
    ]
    const mapping = {
      nameCol: null,
      groupCols: [{ col: 'model_type', priority: 1 }],
      configCols: ['lr'],
      metricCols: ['accuracy'],
      skipCols: [],
    }
    const tree = buildImportTree(rows, mapping, [])
    const groupNode = tree[0]
    // Group node config should contain the group column value
    expect(groupNode.config).toMatchObject({ model_type: 'resnet' })
    // Leaf experiment config should ALSO contain the group column value
    const leafNode = groupNode.children[0]
    expect(leafNode.config).toMatchObject({ model_type: 'resnet' })
  })
})

// ---------------------------------------------------------------------------
// CSV-05 — bfsFlattenImportTree
// ---------------------------------------------------------------------------
describe('bfsFlattenImportTree (CSV-05)', () => {
  it('returns parents before children for a single chain A > B > C', () => {
    const tree = [
      {
        name: 'A',
        children: [
          {
            name: 'B',
            children: [
              { name: 'C', children: [] },
            ],
          },
        ],
      },
    ]
    const flat = bfsFlattenImportTree(tree)
    expect(flat.map(n => n.name)).toEqual(['A', 'B', 'C'])
  })

  it('returns two roots before their respective children [A, B, C, D] for roots=[A(C), B(D)]', () => {
    const tree = [
      { name: 'A', children: [{ name: 'C', children: [] }] },
      { name: 'B', children: [{ name: 'D', children: [] }] },
    ]
    const flat = bfsFlattenImportTree(tree)
    expect(flat.map(n => n.name)).toEqual(['A', 'B', 'C', 'D'])
  })
})

// ---------------------------------------------------------------------------
// CSV-07 — mergeMetrics
// ---------------------------------------------------------------------------
describe('mergeMetrics (CSV-07)', () => {
  it('merge=true: preserves existing non-overlapping keys and incoming wins conflicts', () => {
    const existing = { acc: 0.9, loss: 0.5 }
    const incoming = { acc: 0.95, f1: 0.8 }
    const result = mergeMetrics(existing, incoming, true)
    expect(result).toEqual({ acc: 0.95, loss: 0.5, f1: 0.8 })
  })

  it('merge=false: returns only incoming (full overwrite)', () => {
    const existing = { acc: 0.9, loss: 0.5 }
    const incoming = { acc: 0.95, f1: 0.8 }
    const result = mergeMetrics(existing, incoming, false)
    expect(result).toEqual({ acc: 0.95, f1: 0.8 })
  })
})
