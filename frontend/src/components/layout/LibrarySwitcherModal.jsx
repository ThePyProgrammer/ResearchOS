import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import WindowModal from '../WindowModal'
import { papersApi, websitesApi, githubReposApi } from '../../services/api'
import { buildLibrarySummary, buildSparklinePoints, formatLibraryDate } from './librarySummaries'

const loadingSummary = { status: 'loading' }
const errorSummary = { status: 'error' }

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function SummarySkeleton() {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-400" aria-label="Loading library activity">
      <span className="h-3 w-14 rounded bg-slate-100" />
      <span className="h-3 w-20 rounded bg-slate-100" />
      <span className="h-8 w-24 rounded bg-slate-100" />
    </div>
  )
}

function Sparkline({ library, summary }) {
  if (summary.status === 'error') return null
  if (summary.empty) {
    return (
      <div
        className="flex h-9 w-28 items-center justify-center rounded border border-dashed border-slate-200 text-[10px] text-slate-400"
        aria-label={`No activity for ${library.name}`}
      >
        No activity
      </div>
    )
  }

  const points = buildSparklinePoints(summary.sparkline)
  const areaPoints = `0,36 ${points} 120,36`

  return (
    <svg
      role="img"
      aria-label={`Items added over time for ${library.name}`}
      viewBox="0 0 120 36"
      className="h-9 w-20 text-blue-500"
    >
      <polygon points={areaPoints} fill="currentColor" className="opacity-15" />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LibrarySummaryDetails({ library, summary }) {
  if (summary.status === 'loading') return <SummarySkeleton />
  if (summary.status === 'error') return <p className="text-xs font-medium text-amber-700">Activity unavailable</p>

  if (summary.empty) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>No items yet</span>
        <span>Created on {summary.createdLabel}</span>
        <span>Last Updated on {summary.updatedLabel}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span className="font-semibold text-slate-700">{pluralize(summary.counts.total, 'item')}</span>
      {summary.counts.papers > 0 && <span>{pluralize(summary.counts.papers, 'paper')}</span>}
      {summary.counts.websites > 0 && <span>{pluralize(summary.counts.websites, 'website')}</span>}
      {summary.counts.repos > 0 && <span>{pluralize(summary.counts.repos, 'repo')}</span>}
      <span>Created on {summary.createdLabel}</span>
      <span>Last Updated on {summary.updatedLabel}</span>
    </div>
  )
}

function NewLibraryForm({ createLibrary, onCreated, primary = false }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (showForm) inputRef.current?.focus()
  }, [showForm])

  async function submit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmed || creating) return

    setCreating(true)
    setError('')
    try {
      const library = await createLibrary(trimmed, trimmedDescription || null)
      onCreated(library)
    } catch (err) {
      setError('Could not create library')
      setCreating(false)
    }
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className={primary
          ? 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700'
          : 'rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'}
      >
        New library
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Library name
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Library description <span className="font-normal text-slate-400">(optional)</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What belongs here?"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}

export default function LibrarySwitcherModal({
  open,
  libraries = [],
  activeLibrary,
  switchLibrary,
  createLibrary,
  onClose,
}) {
  const [query, setQuery] = useState('')
  const [summaries, setSummaries] = useState({})
  const searchRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || libraries.length === 0) return undefined

    let cancelled = false
    setSummaries(Object.fromEntries(libraries.map(library => [library.id, loadingSummary])))

    libraries.forEach((library) => {
      Promise.all([
        papersApi.list({ library_id: library.id }),
        websitesApi.list({ library_id: library.id }),
        githubReposApi.list({ library_id: library.id }),
      ])
        .then(([papers, websites, repos]) => {
          if (cancelled) return
          setSummaries(current => ({
            ...current,
            [library.id]: buildLibrarySummary(library, { papers, websites, repos }),
          }))
        })
        .catch(() => {
          if (cancelled) return
          setSummaries(current => ({ ...current, [library.id]: errorSummary }))
        })
    })

    return () => {
      cancelled = true
    }
  }, [open, libraries])

  const filteredLibraries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return libraries

    return libraries.filter((library) => {
      const searchable = `${library.name || ''} ${library.description || ''}`.toLowerCase()
      return searchable.includes(normalizedQuery)
    })
  }, [libraries, query])

  function selectLibrary(library) {
    switchLibrary(library.id)
    onClose?.()
    navigate('/library')
  }

  function handleCreated(library) {
    if (!library?.id) return
    switchLibrary(library.id)
    onClose?.()
    navigate('/library')
  }

  return (
    <WindowModal
      open={open}
      title="Switch library"
      onClose={onClose}
      iconName="local_library"
      allowMinimize={false}
      normalPanelClassName="w-full max-w-3xl rounded-2xl"
      bodyClassName="max-h-[75vh] overflow-hidden"
    >
      <div role="dialog" aria-label="Switch library" className="flex max-h-[75vh] flex-col">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a library"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            {createLibrary && <NewLibraryForm createLibrary={createLibrary} onCreated={handleCreated} />}
          </div>
        </div>

        {libraries.length === 0 ? (
          <div data-testid="empty-library-state" className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <div>
              <h3 className="text-base font-semibold text-slate-900">No libraries yet</h3>
              <p className="mt-1 text-sm text-slate-500">Create your first library to start collecting research.</p>
            </div>
            {createLibrary && <NewLibraryForm createLibrary={createLibrary} onCreated={handleCreated} primary />}
          </div>
        ) : (
          <div className="overflow-y-auto p-3">
            <div className="space-y-2">
              {filteredLibraries.map((library) => {
                const summary = summaries[library.id] || loadingSummary
                const isActive = activeLibrary?.id === library.id

                return (
                  <button
                    key={library.id}
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => selectLibrary(library)}
                    className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                      isActive
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{library.name}</span>
                        {isActive && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Active</span>}
                      </div>
                      {library.description && <p className="text-sm text-slate-600">{library.description}</p>}
                      <LibrarySummaryDetails library={library} summary={summary} />
                    </div>
                    <div className="flex self-stretch shrink-0 flex-col items-end justify-end gap-2">
                      {summary.status === 'loading' ? (
                        <span className="h-9 w-20 rounded bg-slate-100" />
                      ) : (
                        <Sparkline library={library} summary={summary} />
                      )}
                      {summary.status === 'error' && (
                        <span className="text-[11px] text-slate-400">Created on {formatLibraryDate(library.createdAt || library.created_at)}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </WindowModal>
  )
}
