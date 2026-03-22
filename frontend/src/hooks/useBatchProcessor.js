import { useRef, useState } from 'react'

/**
 * useBatchProcessor — concurrency pool hook for running batch operations.
 *
 * Returns:
 *   run(items, concurrency, processFn) — start the batch
 *   pause() / resume()                 — pause/resume between items
 *   cancel()                           — stop processing, mark remaining 'cancelled'
 *   retryFailed(concurrency, processFn) — re-process only failed items
 *   getFailedItems()                   — items whose status is an error message string
 *   isPaused                           — boolean
 *   isRunning                          — boolean
 *   statuses                           — { [itemId]: 'pending'|'processing'|'done'|'skipped'|'cancelled'|errorString }
 *   setStatuses                        — manual status override (for parent re-use)
 */
export function useBatchProcessor() {
  const isPausedRef = useRef(false)
  const isCancelledRef = useRef(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [statuses, setStatuses] = useState({})
  const itemsRef = useRef([])

  const pause = () => {
    isPausedRef.current = true
    setIsPaused(true)
  }

  const resume = () => {
    isPausedRef.current = false
    setIsPaused(false)
  }

  const cancel = () => {
    isCancelledRef.current = true
    // If paused, also un-pause so the polling loop can check isCancelled
    isPausedRef.current = false
    setIsPaused(false)
  }

  const run = async (items, concurrency, processFn) => {
    // Reset cancellation/pause state
    isCancelledRef.current = false
    isPausedRef.current = false
    setIsPaused(false)

    itemsRef.current = items

    // Initialise all statuses to 'pending'
    const initial = {}
    for (const item of items) initial[item.id] = 'pending'
    setStatuses(initial)
    setIsRunning(true)

    // Shared mutable queue — workers pop from the front
    const queue = [...items]

    const worker = async () => {
      while (queue.length > 0) {
        if (isCancelledRef.current) break

        // Pause polling: wait 200 ms intervals while paused
        while (isPausedRef.current && !isCancelledRef.current) {
          await new Promise(r => setTimeout(r, 200))
        }
        if (isCancelledRef.current) break

        const item = queue.shift()
        if (!item) break

        setStatuses(prev => ({ ...prev, [item.id]: 'processing' }))
        try {
          const result = await processFn(item)
          const finalStatus = result === 'skipped' ? 'skipped' : 'done'
          setStatuses(prev => ({ ...prev, [item.id]: finalStatus }))
        } catch (err) {
          const errMessage = (err && err.message) ? err.message : 'Failed'
          setStatuses(prev => ({ ...prev, [item.id]: errMessage }))
        }
      }
    }

    // Launch min(concurrency, items.length) workers
    const workerCount = Math.min(concurrency, items.length)
    if (workerCount > 0) {
      await Promise.all(Array.from({ length: workerCount }, worker))
    }

    // Mark remaining 'pending' items as 'cancelled' if batch was cancelled
    if (isCancelledRef.current) {
      setStatuses(prev => {
        const next = { ...prev }
        for (const [id, s] of Object.entries(next)) {
          if (s === 'pending') next[id] = 'cancelled'
        }
        return next
      })
    }

    setIsRunning(false)
  }

  const getFailedItems = () => {
    const standard = new Set(['pending', 'processing', 'done', 'skipped', 'cancelled'])
    return itemsRef.current.filter(item => {
      const s = statuses[item.id]
      return s != null && !standard.has(s)
    })
  }

  const retryFailed = async (concurrency, processFn) => {
    const failed = getFailedItems()
    if (failed.length === 0) return
    await run(failed, concurrency, processFn)
  }

  return {
    run,
    pause,
    resume,
    cancel,
    isPaused,
    isRunning,
    statuses,
    setStatuses,
    getFailedItems,
    retryFailed,
  }
}
