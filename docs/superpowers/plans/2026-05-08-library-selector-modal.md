# Library Selector Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar library popover with a GitHub repositories-style modal that supports search, inline creation, library switching, metadata, and compact item-growth sparklines without sidebar scroll interference.

**Architecture:** Extract the library switcher UI into a focused modal component and a summary helper. Keep `Sidebar.jsx` as the launcher/integration point while `LibrarySwitcherModal.jsx` owns modal state, search, rows, inline creation, and switch actions. Compute per-library item counts, latest activity, and sparkline points on the frontend from existing item APIs; no backend endpoint is required for the first version.

**Tech Stack:** React 18, React Router, Vite, Vitest, React Testing Library, Recharts-free SVG sparklines, existing `WindowModal`, existing `useLibrary`, existing `papersApi`, `websitesApi`, and `githubReposApi`.

---

## File Structure

- Create: `frontend/src/components/layout/librarySummaries.js`
  - Pure helpers for date parsing, date formatting, per-day item aggregation, and summary objects.
  - No React imports. Easy to unit test.

- Create: `frontend/src/components/layout/librarySummaries.test.js`
  - Unit tests for summary semantics: created date, latest activity fallback, counts, sparkline points, and invalid dates.

- Create: `frontend/src/components/layout/LibrarySwitcherModal.jsx`
  - Modal UI, search, inline create flow, summary fetching, row rendering, and selection handling.
  - Uses `WindowModal` and existing service APIs.

- Create: `frontend/src/components/layout/LibrarySwitcherModal.test.jsx`
  - Component tests for opening behavior via direct modal render, search, switching, creation, and summary states.

- Modify: `frontend/src/components/layout/Sidebar.jsx:1-178`
  - Import `LibrarySwitcherModal`.
  - Remove popover-only state/effects and inline create form from `LibrarySwitcher`.
  - Make the sidebar library button open the modal in both collapsed and expanded modes.
  - Preserve the library settings button.

---

### Task 1: Add pure library summary helpers

**Files:**
- Create: `frontend/src/components/layout/librarySummaries.test.js`
- Create: `frontend/src/components/layout/librarySummaries.js`

- [ ] **Step 1: Write failing helper tests**

Create `frontend/src/components/layout/librarySummaries.test.js` with:

```js
import { describe, expect, it } from 'vitest'

import {
  buildLibrarySummary,
  buildSparklinePoints,
  formatLibraryDate,
  normalizeDate,
} from './librarySummaries'

describe('librarySummaries', () => {
  it('normalizes ISO strings with extra microseconds', () => {
    const date = normalizeDate('2026-03-09T10:11:12.123456+00:00')

    expect(date).toBeInstanceOf(Date)
    expect(date.toISOString()).toBe('2026-03-09T10:11:12.123Z')
  })

  it('returns null for invalid dates', () => {
    expect(normalizeDate(null)).toBeNull()
    expect(normalizeDate('not-a-date')).toBeNull()
  })

  it('formats valid dates and falls back for missing values', () => {
    expect(formatLibraryDate('2026-03-09T00:00:00Z')).toMatch(/Mar 9, 2026|9 Mar 2026/)
    expect(formatLibraryDate(null)).toBe('—')
  })

  it('builds counts, latest activity, and sparkline data for a library', () => {
    const library = {
      id: 'lib_1',
      name: 'AI Papers',
      createdAt: '2026-03-01T00:00:00Z',
    }
    const summary = buildLibrarySummary(library, {
      papers: [
        { id: 'p_1', createdAt: '2026-03-02T00:00:00Z' },
        { id: 'p_2', createdAt: '2026-03-04T00:00:00Z' },
      ],
      websites: [
        { id: 'w_1', createdAt: '2026-03-03T00:00:00Z' },
      ],
      repos: [
        { id: 'gh_1', createdAt: '2026-03-05T00:00:00Z' },
      ],
    })

    expect(summary.status).toBe('ready')
    expect(summary.counts).toEqual({ papers: 2, websites: 1, repos: 1, total: 4 })
    expect(summary.createdLabel).toMatch(/Mar 1, 2026|1 Mar 2026/)
    expect(summary.updatedLabel).toMatch(/Mar 5, 2026|5 Mar 2026/)
    expect(summary.sparkline).toEqual([
      { label: expect.stringMatching(/Mar 2|2 Mar/), value: 1 },
      { label: expect.stringMatching(/Mar 3|3 Mar/), value: 2 },
      { label: expect.stringMatching(/Mar 4|4 Mar/), value: 3 },
      { label: expect.stringMatching(/Mar 5|5 Mar/), value: 4 },
    ])
  })

  it('uses created date as latest activity when a library has no items', () => {
    const summary = buildLibrarySummary(
      { id: 'lib_empty', name: 'Empty', createdAt: '2026-04-01T00:00:00Z' },
      { papers: [], websites: [], repos: [] }
    )

    expect(summary.counts.total).toBe(0)
    expect(summary.empty).toBe(true)
    expect(summary.updatedLabel).toMatch(/Apr 1, 2026|1 Apr 2026/)
    expect(summary.sparkline).toEqual([])
  })

  it('maps cumulative sparkline points into SVG coordinates', () => {
    const points = buildSparklinePoints([
      { label: 'Mar 1', value: 1 },
      { label: 'Mar 2', value: 3 },
      { label: 'Mar 3', value: 6 },
    ], 120, 36)

    expect(points).toBe('0,36 60,21.6 120,0')
  })
})
```

- [ ] **Step 2: Run helper tests to verify they fail**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/librarySummaries.test.js
```

Expected: FAIL with an import/module error because `librarySummaries.js` does not exist.

- [ ] **Step 3: Implement summary helpers**

Create `frontend/src/components/layout/librarySummaries.js` with:

```js
export function normalizeDate(raw) {
  if (!raw) return null
  const normalized = String(raw).replace(/(\.\d{3})\d+/, '$1')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatLibraryDate(raw) {
  const date = normalizeDate(raw)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function dayKey(raw) {
  const date = normalizeDate(raw)
  if (!date) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function labelForDay(key) {
  const [year, month, day] = key.split('-')
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function newestDate(...groups) {
  let latest = null
  for (const group of groups) {
    for (const item of group) {
      const date = normalizeDate(item.createdAt || item.created_at)
      if (date && (!latest || date > latest)) latest = date
    }
  }
  return latest
}

function buildCumulativeSeries(items) {
  const counts = new Map()
  for (const item of items) {
    const key = dayKey(item.createdAt || item.created_at)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  let total = 0
  return [...counts.keys()].sort().map(key => {
    total += counts.get(key)
    return { label: labelForDay(key), value: total }
  })
}

export function buildLibrarySummary(library, { papers = [], websites = [], repos = [] } = {}) {
  const createdDate = normalizeDate(library.createdAt || library.created_at)
  const latestItemDate = newestDate(papers, websites, repos)
  const updatedDate = latestItemDate || createdDate
  const allItems = [...papers, ...websites, ...repos]

  return {
    status: 'ready',
    libraryId: library.id,
    counts: {
      papers: papers.length,
      websites: websites.length,
      repos: repos.length,
      total: allItems.length,
    },
    empty: allItems.length === 0,
    createdLabel: formatLibraryDate(library.createdAt || library.created_at),
    updatedLabel: formatLibraryDate(updatedDate?.toISOString()),
    sparkline: buildCumulativeSeries(allItems),
  }
}

export function buildSparklinePoints(series, width = 120, height = 36) {
  if (!series.length) return ''
  if (series.length === 1) return `0,${height}`

  const max = Math.max(...series.map(point => point.value), 1)
  const step = width / (series.length - 1)

  return series
    .map((point, index) => {
      const x = Number((index * step).toFixed(2))
      const y = Number((height - (point.value / max) * height).toFixed(2))
      return `${x},${y}`
    })
    .join(' ')
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/librarySummaries.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit helper task**

Run:

```bash
git add frontend/src/components/layout/librarySummaries.js frontend/src/components/layout/librarySummaries.test.js
git commit -m "$(cat <<'EOF'
feat: add library summary helpers

Compute library counts, activity dates, and sparkline data in pure helpers so the selector modal can stay focused on UI behavior.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

### Task 2: Build and test the modal component

**Files:**
- Create: `frontend/src/components/layout/LibrarySwitcherModal.test.jsx`
- Create: `frontend/src/components/layout/LibrarySwitcherModal.jsx`

- [ ] **Step 1: Write failing modal tests**

Create `frontend/src/components/layout/LibrarySwitcherModal.test.jsx` with:

```jsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LibrarySwitcherModal from './LibrarySwitcherModal'
import { githubReposApi, papersApi, websitesApi } from '../../services/api'

vi.mock('../../services/api', () => ({
  papersApi: { list: vi.fn() },
  websitesApi: { list: vi.fn() },
  githubReposApi: { list: vi.fn() },
}))

const libraries = [
  {
    id: 'lib_1',
    name: 'AI Papers',
    description: 'Foundation model research',
    createdAt: '2026-03-01T00:00:00Z',
  },
  {
    id: 'lib_2',
    name: 'Robotics Survey',
    description: 'Embodied AI references',
    createdAt: '2026-04-01T00:00:00Z',
  },
]

function renderModal(props = {}) {
  const switchLibrary = vi.fn()
  const createLibrary = vi.fn()
  const onClose = vi.fn()
  const result = render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <LibrarySwitcherModal
        open
        libraries={libraries}
        activeLibrary={libraries[0]}
        switchLibrary={switchLibrary}
        createLibrary={createLibrary}
        onClose={onClose}
        {...props}
      />
    </MemoryRouter>
  )

  return { ...result, switchLibrary, createLibrary, onClose }
}

describe('LibrarySwitcherModal', () => {
  beforeEach(() => {
    papersApi.list.mockReset()
    websitesApi.list.mockReset()
    githubReposApi.list.mockReset()

    papersApi.list.mockImplementation(({ library_id }) => Promise.resolve(
      library_id === 'lib_1'
        ? [
            { id: 'p_1', createdAt: '2026-03-02T00:00:00Z' },
            { id: 'p_2', createdAt: '2026-03-05T00:00:00Z' },
          ]
        : []
    ))
    websitesApi.list.mockImplementation(({ library_id }) => Promise.resolve(
      library_id === 'lib_1'
        ? [{ id: 'w_1', createdAt: '2026-03-03T00:00:00Z' }]
        : []
    ))
    githubReposApi.list.mockImplementation(() => Promise.resolve([]))
  })

  it('renders a GitHub-style searchable library list with active state and summaries', async () => {
    renderModal()

    expect(screen.getByRole('dialog', { name: /switch library/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/find a library/i)).toHaveFocus()
    expect(screen.getByRole('button', { name: /AI Papers/i })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Foundation model research')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('3 items')).toBeInTheDocument())
    expect(screen.getByText(/2 papers/i)).toBeInTheDocument()
    expect(screen.getByText(/1 website/i)).toBeInTheDocument()
    expect(screen.getAllByText(/created on/i)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/last updated on/i)[0]).toBeInTheDocument()
    expect(screen.getByLabelText(/items added over time for AI Papers/i)).toBeInTheDocument()
  })

  it('filters libraries by name and description', async () => {
    renderModal()

    fireEvent.change(screen.getByPlaceholderText(/find a library/i), {
      target: { value: 'embodied' },
    })

    expect(screen.queryByText('AI Papers')).not.toBeInTheDocument()
    expect(screen.getByText('Robotics Survey')).toBeInTheDocument()
  })

  it('switches libraries and closes the modal', async () => {
    const { switchLibrary, onClose } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: /Robotics Survey/i }))

    expect(switchLibrary).toHaveBeenCalledWith('lib_2')
    expect(onClose).toHaveBeenCalled()
  })

  it('creates a library inline and switches to it', async () => {
    const created = { id: 'lib_3', name: 'New Library', createdAt: '2026-05-01T00:00:00Z' }
    const { createLibrary, switchLibrary, onClose } = renderModal({
      createLibrary: vi.fn().mockResolvedValue(created),
    })

    fireEvent.click(screen.getByRole('button', { name: /new library/i }))
    fireEvent.change(screen.getByPlaceholderText(/library name/i), {
      target: { value: 'New Library' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(createLibrary).toHaveBeenCalledWith('New Library'))
    expect(switchLibrary).toHaveBeenCalledWith('lib_3')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps rows selectable when summary loading fails', async () => {
    papersApi.list.mockRejectedValue(new Error('nope'))
    websitesApi.list.mockRejectedValue(new Error('nope'))
    githubReposApi.list.mockRejectedValue(new Error('nope'))

    const { switchLibrary } = renderModal()

    await waitFor(() => expect(screen.getAllByText(/activity unavailable/i).length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: /Robotics Survey/i }))

    expect(switchLibrary).toHaveBeenCalledWith('lib_2')
  })

  it('shows inline creation as the primary action when there are no libraries', () => {
    renderModal({ libraries: [], activeLibrary: null })

    expect(screen.getByText(/no libraries yet/i)).toBeInTheDocument()
    const emptyState = screen.getByTestId('empty-library-state')
    expect(within(emptyState).getByRole('button', { name: /new library/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run modal tests to verify they fail**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/LibrarySwitcherModal.test.jsx
```

Expected: FAIL with an import/module error because `LibrarySwitcherModal.jsx` does not exist.

- [ ] **Step 3: Implement modal component**

Create `frontend/src/components/layout/LibrarySwitcherModal.jsx` with:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import WindowModal from '../WindowModal'
import { githubReposApi, papersApi, websitesApi } from '../../services/api'
import { buildLibrarySummary, buildSparklinePoints } from './librarySummaries'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralLabel}`
}

function SummarySkeleton() {
  return (
    <div className="mt-3 space-y-2" aria-label="Loading library activity">
      <div className="h-3 w-64 max-w-full rounded bg-slate-100" />
      <div className="h-10 w-32 rounded bg-slate-100" />
    </div>
  )
}

function LibrarySparkline({ libraryName, summary }) {
  if (!summary || summary.status === 'loading') {
    return <div className="h-10 w-32 rounded-lg bg-slate-100" aria-hidden="true" />
  }

  if (summary.status === 'error' || summary.empty || summary.sparkline.length === 0) {
    return (
      <div
        className="h-10 w-32 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400"
        aria-label={`Items added over time for ${libraryName}`}
      >
        No activity
      </div>
    )
  }

  const points = buildSparklinePoints(summary.sparkline, 128, 40)
  const fillPoints = points ? `0,40 ${points} 128,40` : ''

  return (
    <svg
      viewBox="0 0 128 40"
      className="h-10 w-32 overflow-visible"
      role="img"
      aria-label={`Items added over time for ${libraryName}`}
    >
      <polyline points={fillPoints} fill="#dbeafe" opacity="0.75" />
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LibrarySummaryMeta({ library, summary }) {
  if (!summary || summary.status === 'loading') return <SummarySkeleton />

  if (summary.status === 'error') {
    return <p className="mt-3 text-xs text-amber-600">Activity unavailable</p>
  }

  const { counts } = summary

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>Created on {summary.createdLabel}</span>
        <span className="text-slate-300">•</span>
        <span>Last Updated on {summary.updatedLabel}</span>
        <span className="text-slate-300">•</span>
        <span>{counts.total ? plural(counts.total, 'item') : 'No items yet'}</span>
      </div>
      {counts.total > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>{plural(counts.papers, 'paper')}</span>
          <span>{plural(counts.websites, 'website')}</span>
          <span>{plural(counts.repos, 'repo')}</span>
        </div>
      )}
    </div>
  )
}

function LibraryRow({ library, active, summary, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(library.id)}
      aria-current={active ? 'true' : undefined}
      className={`w-full text-left px-5 py-4 border-b border-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-inset ${
        active ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="library_books" className={active ? 'text-[18px] text-blue-600' : 'text-[18px] text-slate-400'} />
            <span className="text-sm font-semibold text-blue-700 truncate">{library.name}</span>
            {active && <Icon name="check_circle" className="text-[16px] text-blue-600" />}
          </div>
          {library.description && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">{library.description}</p>
          )}
          <LibrarySummaryMeta library={library} summary={summary} />
        </div>
        <div className="pt-1 flex-shrink-0">
          <LibrarySparkline libraryName={library.name} summary={summary} />
        </div>
      </div>
    </button>
  )
}

export default function LibrarySwitcherModal({
  open,
  libraries,
  activeLibrary,
  switchLibrary,
  createLibrary,
  onClose,
}) {
  const navigate = useNavigate()
  const searchRef = useRef(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [summaries, setSummaries] = useState({})

  useEffect(() => {
    if (!open) return undefined
    const id = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    setSummaries(Object.fromEntries(libraries.map(library => [library.id, { status: 'loading' }])))

    libraries.forEach(library => {
      Promise.all([
        papersApi.list({ library_id: library.id }),
        websitesApi.list({ library_id: library.id }),
        githubReposApi.list({ library_id: library.id }),
      ])
        .then(([papers, websites, repos]) => {
          setSummaries(prev => ({
            ...prev,
            [library.id]: buildLibrarySummary(library, { papers, websites, repos }),
          }))
        })
        .catch(() => {
          setSummaries(prev => ({ ...prev, [library.id]: { status: 'error' } }))
        })
    })
  }, [open, libraries])

  const filteredLibraries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return libraries
    return libraries.filter(library =>
      library.name.toLowerCase().includes(q) ||
      (library.description || '').toLowerCase().includes(q)
    )
  }, [libraries, query])

  function handleSelect(id) {
    switchLibrary(id)
    onClose()
    navigate('/library')
  }

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const library = await createLibrary(trimmed)
      setNewName('')
      setCreating(false)
      handleSelect(library.id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <WindowModal
      open={open}
      onClose={onClose}
      title="Switch library"
      iconName="library_books"
      iconWrapClassName="bg-blue-100"
      iconClassName="text-[16px] text-blue-600"
      allowMinimize={false}
      normalPanelClassName="w-full max-w-3xl rounded-2xl"
      bodyClassName="flex flex-col max-h-[75vh]"
    >
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Find a library…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Icon name="add" className="text-[17px]" />
            New library
          </button>
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="mt-3 flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Library name"
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={!newName.trim() || saving}
              className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName('') }}
              className="px-3 py-2 text-sm text-slate-500 rounded-lg hover:bg-slate-100 hover:text-slate-700"
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="list" aria-label="Libraries">
        {libraries.length === 0 ? (
          <div data-testid="empty-library-state" className="px-5 py-10 text-center">
            <Icon name="library_books" className="text-[40px] text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">No libraries yet</p>
            <p className="mt-1 text-xs text-slate-400">Create your first library to start organizing research.</p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Icon name="add" className="text-[17px]" />
              New library
            </button>
          </div>
        ) : filteredLibraries.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No libraries match “{query}”.</div>
        ) : (
          filteredLibraries.map(library => (
            <LibraryRow
              key={library.id}
              library={library}
              active={library.id === activeLibrary?.id}
              summary={summaries[library.id]}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </WindowModal>
  )
}
```

- [ ] **Step 4: Run modal tests to verify they pass**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/LibrarySwitcherModal.test.jsx
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit modal task**

Run:

```bash
git add frontend/src/components/layout/LibrarySwitcherModal.jsx frontend/src/components/layout/LibrarySwitcherModal.test.jsx
git commit -m "$(cat <<'EOF'
feat: add library switcher modal

Introduce a GitHub-style modal for searching, creating, and selecting libraries with activity summaries.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

### Task 3: Wire the modal into the sidebar launcher

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.jsx:1-178`
- Create: `frontend/src/components/layout/Sidebar.library-switcher.test.jsx`

- [ ] **Step 1: Write failing sidebar integration tests**

Create `frontend/src/components/layout/Sidebar.library-switcher.test.jsx` with:

```jsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Sidebar from './Sidebar'
import { useLibrary } from '../../context/LibraryContext'
import { githubReposApi, papersApi, projectsApi, proposalsApi, websitesApi } from '../../services/api'

vi.mock('../../context/LibraryContext', () => ({
  useLibrary: vi.fn(),
}))

vi.mock('../../services/api', () => ({
  proposalsApi: { list: vi.fn() },
  papersApi: { list: vi.fn() },
  websitesApi: { list: vi.fn() },
  githubReposApi: { list: vi.fn() },
  projectsApi: { list: vi.fn() },
}))

function renderSidebar({ collapsed = false, libraryOverrides = {} } = {}) {
  const switchLibrary = vi.fn()
  const createLibrary = vi.fn()

  useLibrary.mockReturnValue({
    libraries: [
      { id: 'lib_1', name: 'AI Papers', description: 'Foundation model research', createdAt: '2026-03-01T00:00:00Z' },
      { id: 'lib_2', name: 'Robotics Survey', description: 'Embodied AI references', createdAt: '2026-04-01T00:00:00Z' },
    ],
    activeLibrary: { id: 'lib_1', name: 'AI Papers', createdAt: '2026-03-01T00:00:00Z' },
    activeLibraryId: 'lib_1',
    collections: [],
    createLibrary,
    updateLibrary: vi.fn(),
    deleteLibrary: vi.fn(),
    refreshCollections: vi.fn(),
    switchLibrary,
    ...libraryOverrides,
  })

  const result = render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<><Sidebar collapsed={collapsed} onToggle={vi.fn()} /><div>dashboard</div></>} />
        <Route path="/library" element={<><Sidebar collapsed={collapsed} onToggle={vi.fn()} /><div data-testid="library-route">library</div></>} />
        <Route path="/library/settings" element={<div data-testid="settings-route">settings</div>} />
      </Routes>
    </MemoryRouter>
  )

  return { ...result, switchLibrary, createLibrary }
}

describe('Sidebar library switcher', () => {
  beforeEach(() => {
    useLibrary.mockReset()
    proposalsApi.list.mockResolvedValue([])
    projectsApi.list.mockResolvedValue([])
    papersApi.list.mockResolvedValue([])
    websitesApi.list.mockResolvedValue([])
    githubReposApi.list.mockResolvedValue([])
  })

  it('opens a modal instead of a sidebar popover and switches libraries', async () => {
    const { switchLibrary } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: /AI Papers/i }))

    expect(screen.getByRole('dialog', { name: /switch library/i })).toBeInTheDocument()
    expect(document.querySelector('.absolute.left-3.right-3.top-full')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Robotics Survey/i }))

    expect(switchLibrary).toHaveBeenCalledWith('lib_2')
    await waitFor(() => expect(screen.getByTestId('library-route')).toBeInTheDocument())
  })

  it('opens the same modal from the collapsed sidebar button', () => {
    renderSidebar({ collapsed: true })

    fireEvent.click(screen.getByTitle('AI Papers'))

    expect(screen.getByRole('dialog', { name: /switch library/i })).toBeInTheDocument()
  })

  it('keeps the library settings shortcut outside the modal', async () => {
    renderSidebar()

    fireEvent.click(screen.getByTitle('Library settings'))

    await waitFor(() => expect(screen.getByTestId('settings-route')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run sidebar integration tests to verify they fail**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/Sidebar.library-switcher.test.jsx
```

Expected: FAIL because `Sidebar.jsx` still renders the old absolute popover and does not render `LibrarySwitcherModal`.

- [ ] **Step 3: Modify Sidebar imports**

In `frontend/src/components/layout/Sidebar.jsx`, replace the first import block:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { proposalsApi, papersApi, websitesApi, projectsApi } from '../../services/api'
import { useLibrary } from '../../context/LibraryContext'
import WindowModal from '../WindowModal'
import BibtexExportModal from '../BibtexExportModal'
import CreateProjectModal from '../CreateProjectModal'
```

with:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { proposalsApi, papersApi, websitesApi, projectsApi } from '../../services/api'
import { useLibrary } from '../../context/LibraryContext'
import WindowModal from '../WindowModal'
import BibtexExportModal from '../BibtexExportModal'
import CreateProjectModal from '../CreateProjectModal'
import LibrarySwitcherModal from './LibrarySwitcherModal'
```

- [ ] **Step 4: Replace `LibrarySwitcher` implementation**

In `frontend/src/components/layout/Sidebar.jsx`, replace the whole `LibrarySwitcher` function at lines 46-178 with:

```jsx
function LibrarySwitcher({ collapsed }) {
  const { libraries, activeLibrary, createLibrary, switchLibrary } = useLibrary()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (collapsed) {
    return (
      <div className="px-1 py-2 border-b border-white/10">
        <button
          title={activeLibrary?.name ?? 'No library'}
          onClick={() => setOpen(true)}
          className="w-full flex justify-center py-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
        >
          <Icon name="library_books" className="text-[18px] text-slate-400" />
        </button>
        <LibrarySwitcherModal
          open={open}
          libraries={libraries}
          activeLibrary={activeLibrary}
          switchLibrary={switchLibrary}
          createLibrary={createLibrary}
          onClose={() => setOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="px-3 py-2 border-b border-white/10 relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors group min-w-0"
        >
          <Icon name="library_books" className="text-[18px] text-slate-400 flex-shrink-0" />
          <span className="flex-1 text-[13px] font-medium text-slate-200 truncate">
            {activeLibrary?.name ?? 'No library'}
          </span>
          <Icon name="open_in_new" className="text-[16px] text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
        </button>
        {activeLibrary && (
          <button
            onClick={() => { setOpen(false); navigate('/library/settings') }}
            title="Library settings"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <Icon name="settings" className="text-[16px]" />
          </button>
        )}
      </div>
      <LibrarySwitcherModal
        open={open}
        libraries={libraries}
        activeLibrary={activeLibrary}
        switchLibrary={switchLibrary}
        createLibrary={createLibrary}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Run sidebar integration tests to verify they pass**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/Sidebar.library-switcher.test.jsx
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Run focused modal/helper/sidebar tests**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/librarySummaries.test.js src/components/layout/LibrarySwitcherModal.test.jsx src/components/layout/Sidebar.library-switcher.test.jsx
```

Expected: PASS, all focused tests.

- [ ] **Step 7: Commit sidebar integration task**

Run:

```bash
git add frontend/src/components/layout/Sidebar.jsx frontend/src/components/layout/Sidebar.library-switcher.test.jsx
git commit -m "$(cat <<'EOF'
feat: open library selector from sidebar

Replace the sidebar library popover with the modal launcher so library selection scrolls independently of the sidebar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

### Task 4: Final verification and UI validation

**Files:**
- Modify only if verification reveals a defect in files from Tasks 1-3.

- [ ] **Step 1: Run the full frontend test suite**

Run:

```bash
npm --prefix frontend run test:run
```

Expected: PASS. Existing React Router future-flag warnings may appear and are acceptable.

- [ ] **Step 2: Run the frontend production build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS with Vite build output and no errors.

- [ ] **Step 3: Start the dev server for manual UI verification**

Run:

```bash
npm --prefix frontend run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`. Keep the command running while manually testing.

- [ ] **Step 4: Manually verify the modal golden path in a browser**

Open the Vite URL from Step 3 and verify:

1. The sidebar library button opens `Switch library` as a centered modal.
2. Scrolling inside the library list does not scroll the sidebar behind it.
3. Search filters by library name and description.
4. Active library has visible selected styling and a check icon.
5. Rows show `Created on`, `Last Updated on`, total counts, item breakdown, and sparkline/empty activity state.
6. `New library` opens inline creation controls.
7. Creating a library switches to the created library and navigates to `/library`.
8. Selecting an existing library closes the modal and navigates to `/library`.
9. The settings button still navigates to `/library/settings`.
10. Collapsed sidebar library icon opens the same modal.

- [ ] **Step 5: Stop the dev server**

Stop the dev server with `Ctrl+C` in the terminal where Step 3 is running.

Expected: server exits cleanly.

- [ ] **Step 6: Commit any verification fixes**

If Steps 1-4 required code changes, commit only those fixes:

```bash
git status --short
git add <changed-files>
git commit -m "$(cat <<'EOF'
fix: polish library selector modal

Address verification findings for the library selector modal before final handoff.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds if there were fixes. If no files changed, do not create an empty commit.

- [ ] **Step 7: Confirm final working tree state**

Run:

```bash
git status --short
```

Expected: no uncommitted implementation changes. Untracked local-only files from tooling should be explained rather than committed.

---

## Self-Review

Spec coverage:

- Popover replacement and sidebar scroll isolation: Task 3 and Task 4 manual checks.
- GitHub repositories-style list: Task 2 modal UI and Task 4 manual checks.
- Search: Task 2 tests and component.
- Inline create: Task 2 tests and component.
- Created/updated metadata: Task 1 helper tests and Task 2 rendering tests.
- Item counts and type breakdown: Task 1 helper tests and Task 2 rendering tests.
- Compact sparklines: Task 1 helper tests and Task 2 SVG rendering.
- Selection behavior and `/library` navigation: Task 2 and Task 3 tests.
- Empty/loading/error states: Task 2 tests and component states.
- Accessibility basics: Task 2 roles/focus, Task 4 manual checks.

Placeholder scan: no `TBD`, unresolved `TODO`, or deferred implementation steps are intentionally left in this plan.

Type consistency: library models use existing camelCase frontend fields (`createdAt`, `description`, `id`, `name`) with snake_case fallback only in helper parsing for API tolerance. Item APIs are existing `papersApi.list`, `websitesApi.list`, and `githubReposApi.list` with `{ library_id }` params.
