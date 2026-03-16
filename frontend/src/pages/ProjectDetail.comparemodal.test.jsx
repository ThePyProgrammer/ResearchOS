/**
 * Pure unit tests for CompareModal helper functions (EXP-07, EXP-08).
 *
 * These tests define the CONTRACT that Plan 04-02 must implement.
 * Helper implementations are inlined here so the tests pass immediately.
 * Plan 02 will extract these into ProjectDetail.jsx or a shared module —
 * the tests will continue to pass once that extraction is done.
 */
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Inline helper implementations (from RESEARCH.md / 04-CONTEXT.md)
// Plan 02 will extract these into the production module.
// ---------------------------------------------------------------------------

/**
 * Returns a CSS class for a metric cell based on whether it holds the best value.
 * EXP-07: Best-value highlighting in the metrics comparison tab.
 */
function metricCellClass(key, value, bestValue, highlightBest) {
  if (!highlightBest || typeof value !== 'number' || bestValue === null) return ''
  return value === bestValue ? 'font-bold text-emerald-700 bg-emerald-50' : ''
}

/**
 * Returns a CSS class for a config cell based on whether its value differs
 * from the other experiments' values for the same key.
 * EXP-08: Config diff highlighting in the config comparison tab.
 *
 * @param {string} key - The config key being examined (unused in logic, kept for API symmetry)
 * @param {*} expValue - The value for this experiment
 * @param {Array} allValues - All values (including this one) across all compared experiments
 */
function configCellClass(key, expValue, allValues) {
  if (expValue === undefined || expValue === null) return 'text-slate-300 italic'
  const definedVals = allValues.filter(v => v !== undefined && v !== null)
  const allSame = definedVals.length > 0 && definedVals.every(v => String(v) === String(definedVals[0]))
  if (allSame) return ''
  const presentCount = definedVals.length
  if (presentCount < allValues.length) return 'bg-emerald-50 text-emerald-800'
  return 'bg-amber-50 text-amber-800'
}

/**
 * Returns the sorted union of all keys from a list of objects.
 * Used for both metric rows (EXP-07) and config rows (EXP-08).
 */
function unionKeys(objects) {
  const keySet = new Set()
  for (const obj of objects) {
    for (const k of Object.keys(obj ?? {})) {
      keySet.add(k)
    }
  }
  return Array.from(keySet).sort()
}

// ---------------------------------------------------------------------------
// Tests: metricCellClass (EXP-07)
// ---------------------------------------------------------------------------

describe('metricCellClass', () => {
  it('returns highlight class when value equals best and highlighting is on', () => {
    const cls = metricCellClass('accuracy', 0.95, 0.95, true)
    expect(cls).toBe('font-bold text-emerald-700 bg-emerald-50')
  })

  it('returns empty string when value is not the best', () => {
    const cls = metricCellClass('accuracy', 0.87, 0.95, true)
    expect(cls).toBe('')
  })

  it('returns empty string when highlighting is off', () => {
    const cls = metricCellClass('accuracy', 0.95, 0.95, false)
    expect(cls).toBe('')
  })

  it('returns empty string for non-numeric values', () => {
    const cls = metricCellClass('label', 'good', 'good', true)
    expect(cls).toBe('')
  })

  it('returns empty string when bestValue is null', () => {
    const cls = metricCellClass('accuracy', 0.95, null, true)
    expect(cls).toBe('')
  })

  it('returns empty string when bestValue is undefined (treated as null)', () => {
    const cls = metricCellClass('accuracy', 0.95, undefined, true)
    expect(cls).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Tests: configCellClass (EXP-08)
// ---------------------------------------------------------------------------

describe('configCellClass', () => {
  it('returns missing class for undefined values', () => {
    const cls = configCellClass('lr', undefined, [0.001, 0.01, undefined])
    expect(cls).toBe('text-slate-300 italic')
  })

  it('returns missing class for null values', () => {
    const cls = configCellClass('lr', null, [0.001, 0.01, null])
    expect(cls).toBe('text-slate-300 italic')
  })

  it('returns empty string when all defined values are the same (unchanged)', () => {
    const cls = configCellClass('epochs', '100', ['100', '100', '100'])
    expect(cls).toBe('')
  })

  it('returns amber class when value differs from others (changed)', () => {
    const cls = configCellClass('lr', '0.01', ['0.001', '0.01', '0.001'])
    expect(cls).toBe('bg-amber-50 text-amber-800')
  })

  it('returns green class when key is present in some experiments but missing in others (added)', () => {
    // 2 experiments have the key, 1 does not (allValues has undefined/null)
    const cls = configCellClass('dropout', '0.5', ['0.5', '0.3', undefined])
    expect(cls).toBe('bg-emerald-50 text-emerald-800')
  })

  it('coerces numbers to strings for comparison', () => {
    // '100' === String(100) so they are "same"
    const cls = configCellClass('epochs', '100', ['100', 100, '100'])
    expect(cls).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Tests: union of keys (EXP-07 + EXP-08)
// ---------------------------------------------------------------------------

describe('union of keys', () => {
  it('produces sorted union of all metric keys across experiments', () => {
    const experiments = [
      { accuracy: 0.95, loss: 0.05 },
      { accuracy: 0.87, f1: 0.9 },
      { loss: 0.12, precision: 0.91 },
    ]
    const keys = unionKeys(experiments)
    expect(keys).toEqual(['accuracy', 'f1', 'loss', 'precision'])
  })

  it('handles experiments with no metrics (empty object)', () => {
    const experiments = [
      { accuracy: 0.95 },
      {},
      { loss: 0.05 },
    ]
    const keys = unionKeys(experiments)
    expect(keys).toEqual(['accuracy', 'loss'])
  })

  it('handles all experiments with empty metrics', () => {
    const experiments = [{}, {}, {}]
    const keys = unionKeys(experiments)
    expect(keys).toEqual([])
  })

  it('produces sorted union of all config keys across experiments', () => {
    const configs = [
      { lr: '0.001', epochs: '100' },
      { lr: '0.01', batch_size: '32' },
      { epochs: '50', dropout: '0.3' },
    ]
    const keys = unionKeys(configs)
    expect(keys).toEqual(['batch_size', 'dropout', 'epochs', 'lr'])
  })

  it('handles null/undefined objects gracefully', () => {
    const experiments = [
      { accuracy: 0.95 },
      null,
      undefined,
    ]
    const keys = unionKeys(experiments)
    expect(keys).toEqual(['accuracy'])
  })

  it('deduplicates keys that appear in multiple experiments', () => {
    const experiments = [
      { lr: '0.001', epochs: '100' },
      { lr: '0.01', epochs: '200' },
    ]
    const keys = unionKeys(experiments)
    expect(keys).toEqual(['epochs', 'lr'])
  })
})
