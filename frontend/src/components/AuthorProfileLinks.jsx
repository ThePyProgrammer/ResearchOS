import { useLayoutEffect, useRef, useState } from 'react'
import ProfileIcon from './ProfileIcon'
import { PROFILE_FIELDS } from '../utils/authorProfiles'

const OPTIONAL_LINKS = new Set(['orcid', 'openreviewUrl'])
const GAP = 4

export default function AuthorProfileLinks({ author, compact = false }) {
  const containerRef = useRef(null)
  const [availableWidth, setAvailableWidth] = useState(Infinity)
  const links = PROFILE_FIELDS.filter(field => author[field.key])
  const size = compact ? 24 : 29
  const requiredWidth = links.length * (size + GAP) - GAP
  const primaryCount = links.filter(field => !OPTIONAL_LINKS.has(field.key)).length
  const primaryWidth = Math.max(0, primaryCount * (size + GAP) - GAP)
  const hideOptional = availableWidth < requiredWidth

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const width = container.getBoundingClientRect().width
      if (width > 0) setAvailableWidth(width)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [requiredWidth])

  if (!links.length) return null

  return <div ref={containerRef} style={{ minWidth: 'min(100%, ' + primaryWidth + 'px)' }}
    className={'flex min-w-0 flex-1 items-center gap-1 ' + (compact ? 'relative z-10 justify-end' : '')}>
    {links.filter(field => !hideOptional || !OPTIONAL_LINKS.has(field.key)).map(field => <a key={field.key}
      href={field.toUrl(author[field.key])} target="_blank" rel="noopener noreferrer" title={field.label}
      aria-label={compact ? field.label + ' for ' + author.name : field.label}
      className={'group/profile inline-flex items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ' + (compact ? 'h-6 w-6' : 'h-[29px] w-[29px]')}>
      <ProfileIcon name={field.icon} className={compact ? 'h-4 w-4' : 'h-[17px] w-[17px]'} />
    </a>)}
  </div>
}
