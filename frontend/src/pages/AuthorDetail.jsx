import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { authorsApi, papersApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'
import AuthorLabLinks from '../components/AuthorLabLinks'
import AuthorLabManager from '../components/AuthorLabManager'
import WindowModal from '../components/WindowModal'

const INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const BUTTON = 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40'
const PRIMARY = 'rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40'

function Icon({ name, className = '' }) {
  return <span aria-hidden="true" className={'material-symbols-outlined inline-block w-[1em] shrink-0 overflow-hidden align-middle ' + className}>{name}</span>
}

function EmailChips({ emails = [], onSave, saving }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  async function addEmail(event) {
    event.preventDefault()
    const email = draft.trim()
    if (!email || saving) return
    if (await onSave([...emails, email])) { setDraft(''); setAdding(false) }
  }
  return <div>
    <ul className="space-y-2">{emails.map((email, i) => <li key={i} className="flex items-start gap-2">
      <a href={'mailto:' + email} className="min-w-0 flex-1 break-all text-xs leading-5 text-blue-600 hover:underline">{email}</a>
      <button disabled={saving} onClick={() => onSave(emails.filter((_, index) => index !== i))} aria-label={'Remove email ' + email} className="rounded p-1 text-slate-400 hover:text-red-600 disabled:opacity-40"><Icon name="close" className="text-[13px]" /></button>
    </li>)}</ul>
    {adding ? <form onSubmit={addEmail} className="mt-2 space-y-2">
      <input autoFocus required type="email" aria-label="Email address" value={draft} disabled={saving} onChange={event => setDraft(event.target.value)} placeholder="email@example.com" className={INPUT} />
      <div className="flex gap-2"><button disabled={saving} className={BUTTON}>Save</button><button type="button" disabled={saving} onClick={() => setAdding(false)} className={BUTTON}>Cancel</button></div>
    </form> : <button disabled={saving} onClick={() => setAdding(true)} className="mt-2 text-xs text-slate-400 hover:text-blue-600">Add email</button>}
  </div>
}

function AffiliationTimeline({ affiliations = [], onSave, saving }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ institution: '', role: '' })
  async function addAffiliation(event) {
    event.preventDefault()
    if (!draft.institution.trim() || saving) return
    if (await onSave([...affiliations, { institution: draft.institution.trim(), role: draft.role.trim() || null }])) {
      setDraft({ institution: '', role: '' }); setAdding(false)
    }
  }
  function move(index, direction) {
    const reordered = [...affiliations]
    ;[reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]]
    onSave(reordered)
  }
  return <div>
    {affiliations.length > 1 && <p className="mb-2 text-xs leading-5 text-slate-400">Use the arrows to set the display order.</p>}
    <ol className="divide-y divide-slate-100">{affiliations.map((aff, i) => <li key={i} className="py-3">
      <p className="break-words text-xs font-medium leading-5 text-slate-700">{aff.institution}</p>
      {aff.role && <p className="mt-0.5 break-words text-xs text-slate-500">{aff.role}</p>}
      {(aff.startDate || aff.endDate) && <p className="mt-1 text-[11px] text-slate-400">{aff.startDate || '…'} – {aff.endDate || 'Present'}</p>}
      <div className="mt-1 flex items-center gap-1">
        <button disabled={saving || i === 0} onClick={() => move(i, -1)} aria-label={'Move ' + aff.institution + ' up'} title="Move up" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"><Icon name="arrow_upward" className="text-[14px]" /></button>
        <button disabled={saving || i === affiliations.length - 1} onClick={() => move(i, 1)} aria-label={'Move ' + aff.institution + ' down'} title="Move down" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"><Icon name="arrow_downward" className="text-[14px]" /></button>
        <button disabled={saving} onClick={() => onSave(affiliations.filter((_, index) => index !== i))} aria-label={'Remove affiliation ' + aff.institution} title="Remove affiliation" className="ml-auto rounded p-1 text-slate-400 hover:text-red-600 disabled:opacity-40"><Icon name="close" className="text-[14px]" /></button>
      </div>
    </li>)}</ol>
    {!affiliations.length && <p className="mb-3 text-xs text-slate-400">No affiliations added.</p>}
    {adding ? <form onSubmit={addAffiliation} className="mt-2 space-y-2">
      <input autoFocus required aria-label="Institution" value={draft.institution} disabled={saving} onChange={event => setDraft(value => ({ ...value, institution: event.target.value }))} placeholder="Institution" className={INPUT} />
      <input aria-label="Role" value={draft.role} disabled={saving} onChange={event => setDraft(value => ({ ...value, role: event.target.value }))} placeholder="Role (optional)" className={INPUT} />
      <div className="flex gap-2"><button disabled={saving || !draft.institution.trim()} className={BUTTON}>Add</button><button type="button" disabled={saving} onClick={() => setAdding(false)} className={BUTTON}>Cancel</button></div>
    </form> : <button disabled={saving} onClick={() => setAdding(true)} className="mt-2 text-xs text-blue-600 hover:underline">Add affiliation</button>}
  </div>
}

const PROFILE_FIELDS = [
  { key: 'orcid', icon: 'badge', label: 'ORCID', placeholder: '0000-0000-0000-0000', toUrl: v => `https://orcid.org/${v}`, display: v => v },
  { key: 'googleScholarUrl', icon: 'school', label: 'Google Scholar', placeholder: 'https://scholar.google.com/...', toUrl: v => v, display: v => v.replace(/^https?:\/\//, '').replace(/\/$/, '') },
  { key: 'githubUsername', icon: 'code', label: 'GitHub', placeholder: 'username', toUrl: v => `https://github.com/${v}`, display: v => v },
  { key: 'openreviewUrl', icon: 'rate_review', label: 'OpenReview', placeholder: 'https://openreview.net/...', toUrl: v => v, display: v => v.replace(/^https?:\/\//, '').replace(/\/$/, '') },
  { key: 'websiteUrl', icon: 'language', label: 'Website', placeholder: 'https://...', toUrl: v => v, display: v => v.replace(/^https?:\/\//, '').replace(/\/$/, '') },
]

function ProfileLinkRow({ field, value, onSave, saving }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  async function save(event) {
    event.preventDefault()
    if (!saving && await onSave(draft.trim() || null)) setEditing(false)
  }
  return <div>
    <div className="mb-1 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-medium text-slate-500">{field.label}</h3>
      {!editing && value && <button disabled={saving} aria-label={'Edit ' + field.label} title={'Edit ' + field.label} onClick={() => { setDraft(value); setEditing(true) }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="edit" className="text-[13px]" /></button>}
    </div>
    {editing ? <form onSubmit={save} className="space-y-2">
      <input autoFocus aria-label={field.label} disabled={saving} value={draft} onChange={event => setDraft(event.target.value)} placeholder={field.placeholder} className={INPUT} />
      <div className="flex flex-wrap gap-2"><button disabled={saving} className={BUTTON}>Save</button><button type="button" disabled={saving} onClick={() => setEditing(false)} className={BUTTON}>Cancel</button>{value && <button type="button" disabled={saving} onClick={async () => { if (await onSave(null)) setEditing(false) }} className={BUTTON + ' text-red-600'}>Remove</button>}</div>
    </form> : value ? <a href={field.toUrl(value)} target="_blank" rel="noopener noreferrer" className="block break-all text-xs leading-5 text-blue-600 hover:underline">{field.toUrl(value).replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : <button disabled={saving} onClick={() => { setDraft(''); setEditing(true) }} className="text-xs text-slate-400 hover:text-blue-600">Add link</button>}
  </div>
}

function ProfileLinksCard({ author, onSave, saving }) {
  return <section aria-label="Author profile" className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="mb-4 text-xs font-semibold text-slate-800">Profile</h2>
    <div className="space-y-4">{PROFILE_FIELDS.map(field => <ProfileLinkRow key={field.key} field={field} value={author[field.key]} saving={saving} onSave={value => onSave(field.key, value)} />)}
      <div><h3 className="mb-2 text-[11px] font-medium text-slate-500">Email</h3><EmailChips emails={author.emails || []} saving={saving} onSave={value => onSave('emails', value)} /></div>
    </div>
  </section>
}

export default function AuthorDetail() {
  const { id } = useParams()
  return <AuthorProfile key={id} id={id} />
}

function AuthorProfile({ id }) {
  const navigate = useNavigate()
  const { libraries, switchLibrary } = useLibrary()
  const [author, setAuthor] = useState(null)
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [managingLabs, setManagingLabs] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [paperSearch, setPaperSearch] = useState('')
  const [potentialSearch, setPotentialSearch] = useState('')
  const [potentialError, setPotentialError] = useState(null)
  const [linkNotice, setLinkNotice] = useState(null)
  const [potentialPapers, setPotentialPapers] = useState([])
  const [potentialOpen, setPotentialOpen] = useState(false)
  const [potentialLoading, setPotentialLoading] = useState(false)
  const [linking, setLinking] = useState({})

  useEffect(() => {
    loadAuthor()
  }, [id])

  async function loadAuthor() {
    try {
      setLoading(true)
      const [authorData, papersData] = await Promise.all([
        authorsApi.get(id),
        authorsApi.papers(id),
      ])
      setAuthor(authorData)
      setPapers(papersData)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPotentialPapers() {
    setPotentialLoading(true)
    setPotentialError(null)
    try {
      setPotentialPapers(await authorsApi.potentialPapers(id))
    } catch (err) {
      setPotentialError(err.message)
    } finally {
      setPotentialLoading(false)
    }
  }

  function openPaperPicker() {
    setPotentialOpen(true)
    setPotentialSearch('')
    setLinkNotice(null)
    loadPotentialPapers()
  }

  async function handleLinkPaper(paper, rawName) {
    setLinking(prev => ({ ...prev, [paper.id]: true }))
    setPotentialError(null)
    setLinkNotice(null)
    try {
      const position = (paper.authors || []).indexOf(rawName)
      await papersApi.linkAuthor(paper.id, id, Math.max(0, position), rawName)
      setPotentialPapers(prev => prev.filter(item => item.paper.id !== paper.id))
      setPapers(prev => prev.some(item => item.id === paper.id) ? prev : [...prev, paper])
      setLinkNotice('Linked “' + paper.title + '”.')
    } catch (err) {
      setPotentialError(err.message)
    } finally {
      setLinking(prev => ({ ...prev, [paper.id]: false }))
    }
  }

  async function handleUnlinkPaper(paperId) {
    setLinking(prev => ({ ...prev, [paperId]: true }))
    setActionError(null)
    try {
      await papersApi.unlinkAuthor(paperId, id)
      setPapers(prev => prev.filter(paper => paper.id !== paperId))
    } catch (err) {
      setActionError(err.message)
    } finally {
      setLinking(prev => ({ ...prev, [paperId]: false }))
    }
  }

  async function handleFieldSave(field, value) {
    setSaving(true)
    setActionError(null)
    try {
      const updated = await authorsApi.update(id, { [field]: value })
      setAuthor(current => ({ ...current, [field]: updated[field] }))
      return true
    } catch (err) {
      setActionError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleEnrich() {
    setEnriching(true)
    setEnrichResult(null)
    setActionError(null)
    try {
      const result = await authorsApi.enrich(id)
      setEnrichResult(result)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setEnriching(false)
    }
  }

  async function applyEnrichment(suggestions) {
    if (saving) return
    const updates = {}
    if (suggestions.affiliations?.length) updates.affiliations = suggestions.affiliations
    if (suggestions.orcid) updates.orcid = suggestions.orcid
    if (suggestions.google_scholar_url) updates.googleScholarUrl = suggestions.google_scholar_url
    if (suggestions.github_username) updates.githubUsername = suggestions.github_username
    if (suggestions.website_url) updates.websiteUrl = suggestions.website_url
    if (suggestions.emails?.length) updates.emails = suggestions.emails

    if (Object.keys(updates).length > 0) {
      setSaving(true)
      setActionError(null)
      try {
        const updated = await authorsApi.update(id, updates)
        setAuthor(current => ({ ...current, ...Object.fromEntries(Object.keys(updates).map(field => [field, updated[field]])) }))
        setEnrichResult(null)
      } catch (err) {
        setActionError(err.message)
      } finally {
        setSaving(false)
      }
    }
  }

  async function handleDelete() {
    setDeleteBusy(true)
    setActionError(null)
    try {
      await authorsApi.remove(id)
      navigate('/authors')
    } catch (err) {
      setActionError(err.message)
      setDeleteBusy(false)
    }
  }

  const visiblePapers = papers.filter(paper => paper.title.toLowerCase().includes(paperSearch.trim().toLowerCase()))
  const visiblePotential = potentialPapers.filter(({ paper }) => paper.title.toLowerCase().includes(potentialSearch.trim().toLowerCase()))

  if (loading) {
    return (
      <div className="min-w-0 flex-1 overflow-auto bg-slate-50">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="h-8 w-64 bg-slate-100 rounded animate-pulse mb-4" />
          <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !author) {
    return (
      <div className="min-w-0 flex-1 overflow-auto bg-slate-50">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error || 'Author not found'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1 overflow-auto bg-slate-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Back */}
        <button
          onClick={() => navigate('/authors')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-6"
        >
          <Icon name="arrow_back" className="text-[16px]" />
          All Authors
        </button>

        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{author.name}</h1>
            <p className="mt-2 text-xs text-slate-500">{papers.length} {papers.length === 1 ? 'linked paper' : 'linked papers'}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button onClick={handleEnrich} disabled={enriching || saving} aria-label="Enrich author with AI" title="Enrich author with AI" className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600 disabled:opacity-40"><Icon name="auto_awesome" className={'text-[18px]' + (enriching ? ' animate-pulse' : '')} /></button>
            <button onClick={() => { setActionError(null); setDeleting(true) }} aria-label="Delete author" title="Delete author" className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Icon name="delete" className="text-[18px]" /></button>
          </div>
        </header>
        {enriching && <p role="status" className="mb-4 text-xs text-slate-500">Finding profile suggestions…</p>}
        {actionError && !deleting && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{actionError}</p>}

        {/* Enrichment result */}
        {enrichResult?.suggestions && (
          <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="auto_awesome" className="text-[18px] text-purple-600" />
              <h3 className="text-sm font-semibold text-purple-800">AI Suggestions</h3>
            </div>

            {/* Semantic Scholar source data */}
            {enrichResult.web_context?.length > 0 && (
              <div className="mb-3 p-3 bg-white/60 rounded-lg border border-purple-100">
                <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Icon name="travel_explore" className="text-[12px]" />
                  Found on Semantic Scholar
                </p>
                <div className="space-y-1.5">
                  {enrichResult.web_context.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-purple-700">
                      <span className="text-purple-300 flex-shrink-0 font-mono">{i + 1}.</span>
                      <div className="min-w-0">
                        <span className="font-medium">{c.name}</span>
                        {c.affiliations?.length > 0 && (
                          <span className="text-purple-500"> · {c.affiliations[0]}</span>
                        )}
                        <span className="text-purple-400"> · {c.paper_count} papers</span>
                        {c.h_index != null && (
                          <span className="text-purple-400"> · h-index {c.h_index}</span>
                        )}
                        {c.orcid && (
                          <span className="text-purple-400 font-mono"> · {c.orcid}</span>
                        )}
                        {c.homepage && (
                          <a href={c.homepage} target="_blank" rel="noreferrer" className="ml-1 text-blue-500 hover:underline">
                            {c.homepage.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live web search citations */}
            {enrichResult.citations?.length > 0 && (
              <div className="mb-3 p-3 bg-white/60 rounded-lg border border-purple-100">
                <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Icon name="public" className="text-[12px]" />
                  Web sources consulted
                </p>
                <div className="space-y-1">
                  {enrichResult.citations.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                      <span className="text-purple-300 flex-shrink-0 mt-0.5">·</span>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline truncate"
                        title={c.url}
                      >
                        {c.title || c.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No external data at all */}
            {!enrichResult.web_context?.length && !enrichResult.citations?.length && (
              <div className="mb-3 p-2.5 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
                <Icon name="travel_explore" className="text-[14px] text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-600">
                  No external sources found — suggestions are based on library papers only.
                  Identifiers like ORCID and URLs have been omitted to avoid guesses.
                </p>
              </div>
            )}

            <pre className="text-xs text-purple-700 bg-white/50 rounded-lg p-3 overflow-auto max-h-48 mb-3">
              {JSON.stringify(enrichResult.suggestions, null, 2)}
            </pre>
            {enrichResult.suggestions.confidence_notes && (
              <p className="text-xs text-purple-600 mb-3 italic">{enrichResult.suggestions.confidence_notes}</p>
            )}
            <div className="flex gap-2">
              <button
                disabled={saving}
                onClick={() => applyEnrichment(enrichResult.suggestions)}
                className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Apply Suggestions
              </button>
              <button
                onClick={() => setEnrichResult(null)}
                className="px-3 py-1.5 text-xs text-purple-600 rounded-lg hover:bg-purple-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside aria-label="Author details" className="min-w-0 space-y-5">
            <ProfileLinksCard author={author} onSave={handleFieldSave} saving={saving} />
            <section aria-label="Author labs" className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-xs font-semibold text-slate-800">Labs</h2><button onClick={() => setManagingLabs(true)} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Manage labs</button></div>
              <AuthorLabLinks labs={author.labs} emptyText="No labs associated." />
            </section>
            <section aria-label="Author affiliations" className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-xs font-semibold text-slate-800">Affiliations</h2>
              <AffiliationTimeline affiliations={author.affiliations || []} saving={saving} onSave={value => handleFieldSave('affiliations', value)} />
            </section>
          </aside>
          <section aria-label="Author papers" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <h2 className="font-semibold text-slate-800">Papers ({papers.length})</h2>
              <button onClick={openPaperPicker} className={PRIMARY + ' inline-flex items-center gap-1.5'}><Icon name="add" className="text-[17px]" />Link paper</button>
            </div>
            <div className="relative m-5"><Icon name="search" className="pointer-events-none absolute left-3 top-2.5 text-[18px] text-slate-400" /><input aria-label="Search author papers" value={paperSearch} onChange={event => setPaperSearch(event.target.value)} placeholder="Search paper titles…" className={INPUT + ' pl-10'} /></div>
            {!visiblePapers.length ? <div className="border-t border-slate-100 px-6 py-14 text-center"><Icon name={paperSearch ? 'search_off' : 'article'} className="text-[34px] text-slate-200" /><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">{paperSearch ? 'No papers match this search.' : 'No papers linked yet. Use Link paper to review potential matches.'}</p></div> : <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-y border-slate-200 bg-slate-50"><tr><th scope="col" className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Title</th><th scope="col" className="w-20 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Year</th><th scope="col" className="w-10"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visiblePapers.map(paper => {
                  const library = libraries.find(item => item.id === paper.libraryId)
                  return <tr key={paper.id} className="transition-colors hover:bg-blue-50">
                    <td className="min-w-[180px] px-5 py-3.5">
                      <Link to={'/library/paper/' + encodeURIComponent(paper.id)} className="text-[13px] font-medium leading-5 text-slate-800 hover:text-blue-600 hover:underline">{paper.title}</Link>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{(paper.authors || []).join(', ') || 'No authors listed'}</p>
                      {library && <button onClick={() => { switchLibrary(library.id); navigate('/library') }} className="mt-1 text-[11px] text-slate-400 hover:text-blue-600" title={'Go to ' + library.name}>{library.name}</button>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3.5 align-top text-[13px] tabular-nums text-slate-500">{paper.year || '—'}</td>
                    <td className="py-3.5 pr-3 align-top"><button disabled={linking[paper.id]} onClick={() => handleUnlinkPaper(paper.id)} aria-label={'Unlink paper ' + paper.title} title="Unlink paper from author" className="inline-flex rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Icon name="link_off" className="text-[17px]" /></button></td>
                  </tr>
                })}</tbody>
              </table>
            </div>}
          </section>
        </div>
      </div>
      {potentialOpen && <WindowModal open title="Link papers" iconName="article" onClose={() => setPotentialOpen(false)} disableClose={Object.values(linking).some(Boolean)} normalPanelClassName="w-full max-w-3xl rounded-2xl" bodyClassName="max-h-[75vh] overflow-y-auto p-5">
        <p className="text-sm text-slate-500">Potential matches for {author.name}. Review the author name before linking a paper.</p>
        <input autoFocus aria-label="Search potential papers" value={potentialSearch} onChange={event => setPotentialSearch(event.target.value)} placeholder="Search potential paper titles…" className={INPUT + ' mt-4'} />
        {potentialError && <div className="mt-3"><p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{potentialError}</p><button className={BUTTON + ' mt-2'} disabled={potentialLoading || Object.values(linking).some(Boolean)} onClick={loadPotentialPapers}>Retry loading matches</button></div>}
        {linkNotice && <p role="status" className="mt-3 text-xs text-emerald-700">{linkNotice}</p>}
        {potentialLoading ? <p className="py-10 text-center text-sm text-slate-400">Searching papers…</p> : !visiblePotential.length ? <p className="py-10 text-center text-sm text-slate-400">{potentialSearch ? 'No papers match this search.' : potentialError ? 'Potential matches could not be loaded.' : 'No potential matches found.'}</p> : <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50"><tr><th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Title / match</th><th scope="col" className="px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Year</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{visiblePotential.map(({ paper, rawName, confidence }) => <tr key={paper.id} className="hover:bg-blue-50">
              <td className="min-w-[180px] px-4 py-3.5"><a href={'/library/paper/' + encodeURIComponent(paper.id)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium leading-5 text-slate-800 hover:text-blue-600 hover:underline">{paper.title}</a><p className="mt-1 text-xs leading-5 text-slate-500">{(paper.authors || []).join(', ')}</p><p className="mt-1 text-xs text-slate-500">As “{rawName}” <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{confidence} match</span></p></td>
              <td className="px-2 py-3.5 align-top text-[13px] tabular-nums text-slate-500">{paper.year || '—'}</td>
              <td className="py-3.5 pr-4 align-top"><button disabled={linking[paper.id]} onClick={() => handleLinkPaper(paper, rawName)} aria-label={'Link ' + paper.title} className={PRIMARY}>{linking[paper.id] ? 'Linking…' : 'Link'}</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        <div className="mt-5 flex justify-end"><button disabled={Object.values(linking).some(Boolean)} className={BUTTON} onClick={() => setPotentialOpen(false)}>Done</button></div>
      </WindowModal>}
      {managingLabs && <AuthorLabManager author={author} onChange={labs => setAuthor(current => ({ ...current, labs }))} onClose={() => setManagingLabs(false)} />}
      {deleting && <WindowModal open title="Delete author" onClose={() => setDeleting(false)} disableClose={deleteBusy} bodyClassName="p-5">
        <p className="text-sm text-slate-600">Delete {author.name} and their paper links and lab memberships? Papers and labs will be kept.</p>
        {actionError && <p role="alert" className="mt-3 text-sm text-red-600">{actionError}</p>}
        <div className="mt-5 flex justify-end gap-2"><button disabled={deleteBusy} className={BUTTON} onClick={() => setDeleting(false)}>Cancel</button><button disabled={deleteBusy} onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-40">{deleteBusy ? 'Deleting…' : 'Confirm delete'}</button></div>
      </WindowModal>}
    </div>
  )
}
