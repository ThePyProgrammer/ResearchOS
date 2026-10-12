import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { authorsApi } from '../services/api'
import AuthorLabLinks from '../components/AuthorLabLinks'
import AuthorProfileLinks from '../components/AuthorProfileLinks'
import { PROFILE_FIELDS } from '../utils/authorProfiles'

const PAGE_SIZE = 50

function Icon({ name, className = '' }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{name}</span>
}

function AddAuthorModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [orcid, setOrcid] = useState('')
  const [socialLinks, setSocialLinks] = useState({ linkedinUrl: '', twitterUrl: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const author = await authorsApi.create({ name: name.trim(), orcid: orcid.trim() || null, ...Object.fromEntries(Object.entries(socialLinks).map(([key, value]) => [key, value.trim() || null])) })
      onCreate(author)
      onClose()
    } catch (err) {
      setError(`Failed to create author: ${err.message}`)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Author</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ORCID</label>
            <input
              type="text"
              value={orcid}
              onChange={e => setOrcid(e.target.value)}
              placeholder="0000-0000-0000-0000"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono"
            />
          </div>
          {PROFILE_FIELDS.filter(field => field.key in socialLinks).map(field => <label key={field.key} className="block text-xs font-medium text-slate-600">
            {field.label}
            <input type="url" pattern="https?://.+" value={socialLinks[field.key]} onChange={event => setSocialLinks(current => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder}
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
          </label>)}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Authors() {
  const [authors, setAuthors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [revision, setRevision] = useState(0)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    let active = true
    async function loadAuthors() {
      setLoading(true)
      try {
        const data = await authorsApi.list({ search: search.trim() || undefined, limit: PAGE_SIZE + 1, offset })
        if (active) {
          setAuthors(data.slice(0, PAGE_SIZE))
          setHasMore(data.length > PAGE_SIZE)
          setError(null)
        }
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    const timer = setTimeout(loadAuthors, search ? 300 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [search, revision, offset])

  function changeSearch(value) {
    setSearch(value)
    setOffset(0)
    setLoading(true)
  }

  function changePage(nextOffset) {
    setOffset(nextOffset)
    setLoading(true)
  }

  function currentAffiliation(author) {
    const affs = author.affiliations || []
    if (!affs.length) return null
    const active = affs.filter(a => !a.endDate)
    return (active.length ? active[active.length - 1] : affs[affs.length - 1])?.institution
  }

  return (
    <div className="min-w-0 flex-1 overflow-auto bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Authors</h1>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700">
            <Icon name="add" className="text-[16px]" />Add Author
          </button>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 text-[18px] text-slate-400" />
            <input aria-label="Search authors" type="text" value={search} onChange={e => changeSearch(e.target.value)} placeholder="Search names, affiliations, or labs..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
          {!loading && !error && <p className="text-xs text-slate-400">{authors.length ? `Showing ${offset + 1}–${offset + authors.length} authors` : '0 authors'}{search.trim() ? ' matching your search' : ''}</p>}
        </div>
        {error ? <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}<button className="ml-2 underline" onClick={() => setRevision(value => value + 1)}>Retry</button></div>
          : loading ? <div role="status"><span className="sr-only">Loading authors...</span><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white" />)}
          </div></div>
          : authors.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
            <p className="text-sm text-slate-500">{search ? 'No authors match your search' : 'No authors yet. Add one to get started.'}</p>
            {search && <button className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50" onClick={() => changeSearch('')}>Clear search</button>}
          </div>
          : <ul aria-label="Authors directory" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {authors.map(author => {
              const affiliation = currentAffiliation(author)
              return <li key={author.id} className="min-w-0">
                <div className="group relative flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 hover:bg-slate-50">
                  <h2 className="break-words text-sm font-semibold leading-5 text-slate-800">
                    <Link to={`/authors/${encodeURIComponent(author.id)}`} aria-label={`Open ${author.name}`}
                      className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-slate-500">{author.name}</Link>
                  </h2>
                  {affiliation && <p className="mt-1.5 break-words text-xs leading-5 text-slate-500">{affiliation}</p>}
                  {!!author.labs?.length && <div className="relative z-10 mt-2"><AuthorLabLinks labs={author.labs} /></div>}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-3">
                    <span className="text-[11px] tabular-nums text-slate-500">{author.paperCount ?? 0} {author.paperCount === 1 ? 'paper' : 'papers'}</span>
                    <AuthorProfileLinks author={author} compact />
                  </div>
                </div>
              </li>
            })}
          </ul>}
        {(offset > 0 || hasMore) && <nav aria-label="Author pages" className="mt-5 flex items-center justify-between gap-3">
          <button disabled={loading || offset === 0} onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40">Previous page</button>
          <span className="text-xs text-slate-500">Page {offset / PAGE_SIZE + 1}</span>
          <button disabled={loading || !!error || !hasMore} onClick={() => changePage(offset + PAGE_SIZE)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40">Next page</button>
        </nav>}
      </div>

      {showAdd && (
        <AddAuthorModal
          onClose={() => setShowAdd(false)}
          onCreate={() => { setOffset(0); setRevision(value => value + 1) }}
        />
      )}
    </div>
  )
}
