import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * PaperChipPopover — inline popover showing paper details when a citation chip is clicked.
 *
 * Props:
 *   paperId    — paper ID to fetch
 *   displayLabel — author-year label shown on the chip
 *   onClose    — callback() to close
 *   anchorRect — DOMRect from getBoundingClientRect() of the clicked chip
 */

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function PaperChipPopover({ paperId, displayLabel, onClose, anchorRect }) {
  const [paper, setPaper] = useState(null)
  const [loading, setLoading] = useState(true)
  const ref = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function fetchPaper() {
      try {
        const res = await fetch(`/api/papers/${paperId}`)
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        if (!cancelled) setPaper(data)
      } catch (err) {
        console.error('Failed to fetch paper for popover:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPaper()
    return () => { cancelled = true }
  }, [paperId])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Position below the anchor chip
  const top = anchorRect ? anchorRect.bottom + 4 : 100
  const left = anchorRect ? Math.min(anchorRect.left, window.innerWidth - 320) : 100

  const authors = paper?.authors ?? []
  const authorStr = authors.length > 3
    ? authors.slice(0, 3).join(', ') + ' et al.'
    : authors.join(', ')

  return createPortal(
    <div
      ref={ref}
      className="fixed bg-white border border-slate-200 rounded-lg shadow-xl p-3 max-w-sm w-80"
      style={{ top, left, zIndex: 9999 }}
    >
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
          <Icon name="progress_activity" className="text-[16px] animate-spin" />
          Loading paper...
        </div>
      ) : paper ? (
        <div>
          <p className="font-medium text-sm text-slate-800 leading-snug">{paper.title}</p>
          {authorStr && <p className="text-xs text-slate-500 mt-1">{authorStr}</p>}
          {(paper.venue || paper.year) && (
            <p className="text-xs text-slate-400 italic mt-0.5">
              {[paper.venue, paper.year].filter(Boolean).join(', ')}
            </p>
          )}
          {paper.abstract && (
            <p className="text-xs text-slate-600 mt-1.5 line-clamp-4">{paper.abstract}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400">Paper not found</p>
      )}
    </div>,
    document.body
  )
}
