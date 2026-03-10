import { useRef, useEffect, useCallback } from 'react'

/**
 * Returns an onMouseDown handler for a drag divider that resizes a panel.
 *
 * @param {object} opts
 * @param {React.RefObject} opts.containerRef - ref to the flex container holding both panels
 * @param {function} opts.setSize - state setter (receives new size in px)
 * @param {boolean} [opts.reverse=false] - if true, resize from the right edge (right panel grows left)
 * @param {number} [opts.minPx=200] - minimum size for the panel being resized
 * @param {number} [opts.maxOffset=200] - minimum size reserved for the other panel
 */
export function useDragResize({ containerRef, setSize, reverse = false, minPx = 200, maxOffset = 200 }) {
  const dragging = useRef(false)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newSize = reverse
        ? rect.right - e.clientX
        : e.clientX - rect.left
      const maxSize = rect.width - maxOffset
      setSize(Math.max(minPx, Math.min(maxSize, newSize)))
    }

    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [containerRef, setSize, reverse, minPx, maxOffset])

  return onMouseDown
}
