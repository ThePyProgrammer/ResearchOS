import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useBatchProcessor } from './useBatchProcessor'

// Helper: create items with stable ids
function makeItems(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, title: `Item ${i}` }))
}

describe('useBatchProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Test 1: concurrency=1 processes items sequentially
  it('processes items sequentially with concurrency=1', async () => {
    const items = makeItems(3)
    const order = []
    const processFn = vi.fn(async (item) => {
      order.push(`start-${item.id}`)
      await new Promise(r => setTimeout(r, 100))
      order.push(`end-${item.id}`)
    })

    const { result } = renderHook(() => useBatchProcessor())

    let runPromise
    act(() => {
      runPromise = result.current.run(items, 1, processFn)
    })

    // Advance timers to process all 3 items (3 * 100ms = 300ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    await act(async () => { await runPromise })

    // Sequential: item-0 must fully finish before item-1 starts
    expect(order).toEqual([
      'start-item-0', 'end-item-0',
      'start-item-1', 'end-item-1',
      'start-item-2', 'end-item-2',
    ])
    expect(result.current.isRunning).toBe(false)
  })

  // Test 2: concurrency=3 processes up to 3 items simultaneously
  it('processes up to N items simultaneously with concurrency=3', async () => {
    const items = makeItems(3)
    const startOrder = []
    const processFn = vi.fn(async (item) => {
      startOrder.push(item.id)
      await new Promise(r => setTimeout(r, 100))
    })

    const { result } = renderHook(() => useBatchProcessor())

    let runPromise
    act(() => {
      runPromise = result.current.run(items, 3, processFn)
    })

    // After 50ms (before any item finishes), all 3 should have started
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    // All 3 items started concurrently
    expect(startOrder).toHaveLength(3)
    expect(startOrder).toContain('item-0')
    expect(startOrder).toContain('item-1')
    expect(startOrder).toContain('item-2')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    await act(async () => { await runPromise })

    expect(result.current.isRunning).toBe(false)
    for (const item of items) {
      expect(result.current.statuses[item.id]).toBe('done')
    }
  })

  // Test 3: pause() stops new items from starting; resume() continues
  it('pauses and resumes processing', async () => {
    const items = makeItems(4)
    const started = []
    let resolvers = {}
    const processFn = vi.fn(async (item) => {
      started.push(item.id)
      await new Promise(r => { resolvers[item.id] = r })
    })

    const { result } = renderHook(() => useBatchProcessor())

    let runPromise
    act(() => {
      runPromise = result.current.run(items, 1, processFn)
    })

    // item-0 should be processing
    await act(async () => { await Promise.resolve() })
    expect(started).toContain('item-0')

    // Pause
    act(() => { result.current.pause() })
    expect(result.current.isPaused).toBe(true)

    // Finish item-0 manually
    act(() => { resolvers['item-0']?.() })
    await act(async () => { await Promise.resolve() })

    // While paused, item-1 should NOT start even after item-0 finishes
    // Advance pause polling time
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(started).not.toContain('item-1')

    // Resume — item-1 should now start
    act(() => { result.current.resume() })
    expect(result.current.isPaused).toBe(false)

    // After resume, the 200ms pause-poll resolves; give it enough time + microtasks
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    await act(async () => { await Promise.resolve() })

    expect(started).toContain('item-1')

    // Finish remaining items
    act(() => { resolvers['item-1']?.() })
    await act(async () => { await Promise.resolve() })
    act(() => { resolvers['item-2']?.() })
    await act(async () => { await Promise.resolve() })
    act(() => { resolvers['item-3']?.() })
    await act(async () => { await Promise.resolve() })

    await act(async () => { await runPromise })
    expect(result.current.isRunning).toBe(false)
  })

  // Test 4: failed items have error message as status value
  it('tracks failed items with error message as status', async () => {
    const items = makeItems(2)
    const processFn = vi.fn(async (item) => {
      if (item.id === 'item-0') throw new Error('Network error')
    })

    const { result } = renderHook(() => useBatchProcessor())

    let runPromise
    act(() => {
      runPromise = result.current.run(items, 1, processFn)
    })

    await act(async () => { await runPromise })

    expect(result.current.statuses['item-0']).toBe('Network error')
    expect(result.current.statuses['item-1']).toBe('done')
  })

  // Test 5: getFailedItems() returns items with error status (not standard statuses)
  it('getFailedItems returns only items with error messages', async () => {
    const items = makeItems(3)
    const processFn = vi.fn(async (item) => {
      if (item.id === 'item-1') throw new Error('Fetch failed')
    })

    const { result } = renderHook(() => useBatchProcessor())

    let runPromise
    act(() => {
      runPromise = result.current.run(items, 1, processFn)
    })

    await act(async () => { await runPromise })

    const failed = result.current.getFailedItems()
    expect(failed).toHaveLength(1)
    expect(failed[0].id).toBe('item-1')
  })

  // Test 6: retryFailed() re-processes only failed items
  it('retryFailed re-processes only failed items', async () => {
    const items = makeItems(3)
    let callCount = { 'item-0': 0, 'item-1': 0, 'item-2': 0 }
    const processFn = vi.fn(async (item) => {
      callCount[item.id] = (callCount[item.id] || 0) + 1
      if (item.id === 'item-1' && callCount[item.id] === 1) {
        throw new Error('First attempt failed')
      }
    })

    const { result } = renderHook(() => useBatchProcessor())

    let runPromise
    act(() => {
      runPromise = result.current.run(items, 1, processFn)
    })
    await act(async () => { await runPromise })

    expect(result.current.statuses['item-1']).toBe('First attempt failed')

    // Retry
    let retryPromise
    act(() => {
      retryPromise = result.current.retryFailed(1, processFn)
    })
    await act(async () => { await retryPromise })

    // item-1 should now be done; item-0 and item-2 should not be re-processed
    expect(result.current.statuses['item-1']).toBe('done')
    expect(callCount['item-0']).toBe(1)
    expect(callCount['item-2']).toBe(1)
    expect(callCount['item-1']).toBe(2)
  })

  // Test 7: cancel() stops the batch and marks remaining items as 'cancelled'
  it('cancel marks remaining pending items as cancelled', async () => {
    const items = makeItems(5)
    let resolvers = {}
    const processFn = vi.fn(async (item) => {
      await new Promise(r => { resolvers[item.id] = r })
    })

    const { result } = renderHook(() => useBatchProcessor())

    let runPromise
    act(() => {
      runPromise = result.current.run(items, 1, processFn)
    })

    // item-0 starts processing
    await act(async () => { await Promise.resolve() })

    // Cancel the batch
    act(() => { result.current.cancel() })

    // Finish the in-flight item-0
    act(() => { resolvers['item-0']?.() })

    await act(async () => { await runPromise })

    // item-0 finished — should be done (was in-flight when cancel was called)
    expect(result.current.statuses['item-0']).toBe('done')
    // Remaining items should be cancelled
    expect(result.current.statuses['item-1']).toBe('cancelled')
    expect(result.current.statuses['item-2']).toBe('cancelled')
    expect(result.current.statuses['item-3']).toBe('cancelled')
    expect(result.current.statuses['item-4']).toBe('cancelled')
    expect(result.current.isRunning).toBe(false)
  })
})
