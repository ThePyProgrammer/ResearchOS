import { useEffect, useId, useRef, useState } from 'react'
import { authorsApi } from '../services/api'

const normalize = value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

export default function AuthorNameCombobox({ value, onChange }) {
  const id = useId()
  const listRef = useRef(null)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [revision, setRevision] = useState(0)
  const [open, setOpen] = useState(true)
  const [activeIndex, setActiveIndex] = useState(-1)
  const matches = suggestions.filter(item => normalize(item.name).includes(normalize(value)))
  const expanded = open && matches.length > 0

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await authorsApi.suggestions()
        if (active) setSuggestions(data)
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [revision])

  useEffect(() => {
    if (expanded && activeIndex >= 0) {
      listRef.current?.children[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [activeIndex, expanded])

  function select(name) {
    onChange(name)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(current => {
        if (!matches.length) return -1
        if (!open || current < 0) return event.key === 'ArrowDown' ? 0 : matches.length - 1
        return (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length
      })
    } else if (event.key === 'Enter' && expanded && activeIndex >= 0) {
      event.preventDefault()
      select(matches[activeIndex].name)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
      <div className="relative">
        <input
          id={id} autoFocus type="text" role="combobox" autoComplete="off"
          aria-autocomplete="list" aria-expanded={expanded}
          aria-controls={expanded ? id + '-options' : undefined}
          aria-activedescendant={expanded && activeIndex >= 0 ? id + '-option-' + activeIndex : undefined}
          aria-describedby={id + '-help'}
          value={value} placeholder="e.g. John Smith"
          onChange={event => { onChange(event.target.value); setOpen(true); setActiveIndex(-1) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setOpen(false); setActiveIndex(-1) }}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
        {expanded && <ul ref={listRef} id={id + '-options'} role="listbox" aria-label="Suggested author names"
          className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((item, index) => <li key={item.name} id={id + '-option-' + index} role="option"
            aria-selected={index === activeIndex}
            onMouseDown={event => event.preventDefault()}
            onClick={() => select(item.name)}
            className={'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-blue-50 ' + (index === activeIndex ? 'bg-blue-50 text-blue-900' : 'text-slate-700')}>
            <span className="min-w-0 break-words">{item.name}</span>
            <span className="shrink-0 text-xs text-slate-500">{item.paperCount} papers</span>
          </li>)}
        </ul>}
      </div>
      <p id={id + '-help'} className="mt-1 text-xs text-slate-500">Names appearing in at least 2 papers, most frequent first. You can also type any name.</p>
      {loading && <p role="status" className="mt-1 text-xs text-slate-500">Loading suggestions...</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">Could not load suggestions: {error} <button type="button" onClick={() => setRevision(current => current + 1)} className="underline">Retry suggestions</button></p>}
      {!loading && !error && !matches.length && <p role="status" className="mt-1 text-xs text-slate-500">{suggestions.length ? 'No matching suggestions. You can use this name.' : 'No new author suggestions from your papers. Type any name to add an author.'}</p>}
    </div>
  )
}
