import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import WindowModal from '../components/WindowModal'
import { labsApi } from '../services/api'

const INPUT = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30'
const BUTTON = 'rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed'
const PRIMARY = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40'

function Icon({ name, className = '' }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{name}</span>
}

// Each resource has its own retry/loading state. Cleanup ignores responses from
// an earlier lab, search, or page; stable callbacks prevent unrelated refetches.
function useResource(load, delay = 0) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const timer = setTimeout(async () => {
      try {
        const result = await load()
        if (active) setData(result)
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }, delay)
    return () => { active = false; clearTimeout(timer) }
  }, [load, delay, revision])
  return { data, setData, loading, error, retry }
}

function LoadError({ resource }) {
  return <div role="alert" className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
    {resource.error} <button onClick={resource.retry} className="ml-2 underline">Retry</button>
  </div>
}

function Pagination({ page, onChange, label }) {
  if (!page || page.total <= page.limit && page.offset === 0) return null
  return <nav aria-label={`${label} pagination`} className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
    <span>{page.total ? `${Math.min(page.offset + 1, page.total)}–${Math.min(page.offset + page.limit, page.total)} of ${page.total}` : '0 results'}</span>
    <div className="flex gap-2">
      <button className={BUTTON} disabled={page.offset === 0} onClick={() => onChange(Math.max(0, page.offset - page.limit))}>Previous</button>
      <button className={BUTTON} disabled={page.offset + page.limit >= page.total} onClick={() => onChange(page.offset + page.limit)}>Next</button>
    </div>
  </nav>
}

function LabForm({ lab, onClose, onSaved }) {
  const [name, setName] = useState(lab?.name || '')
  const [description, setDescription] = useState(lab?.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  async function save(event) {
    event.preventDefault()
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const data = { name: name.trim(), description: description.trim() || null }
      const saved = lab ? await labsApi.update(lab.id, data) : await labsApi.create(data)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }
  return <WindowModal open title={lab ? 'Edit lab' : 'Create lab'} iconName="science" onClose={onClose} disableClose={saving} bodyClassName="overflow-auto p-5">
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">Lab name
        <input autoFocus required maxLength={200} value={name} onChange={event => setName(event.target.value)} className={`${INPUT} mt-1`} placeholder="e.g. Language and Learning Lab" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Description (optional)
        <textarea maxLength={5000} rows={3} value={description} onChange={event => setDescription(event.target.value)} className={`${INPUT} mt-1`} />
      </label>
      <p className="text-xs text-slate-500">Add members after creating the lab. Their linked papers will appear automatically across all libraries.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BUTTON} onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className={PRIMARY} disabled={saving || !name.trim()}>{saving ? 'Saving…' : lab ? 'Save changes' : 'Create lab'}</button>
      </div>
    </form>
  </WindowModal>
}

function AddMembers({ labId, onChanged, onClose }) {
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const query = search.trim()
  const load = useCallback(() => query.length < 2 ? Promise.resolve([]) : labsApi.memberOptions(labId, query), [labId, query, revision])
  const options = useResource(load, 300)
  async function add(author) {
    setSaving(author.authorId)
    setError(null)
    setNotice('')
    try {
      await labsApi.addMember(labId, author.authorId)
      setNotice(`${author.name} added.`)
      setRevision(value => value + 1)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }
  return <WindowModal open title="Add members" iconName="group_add" onClose={onClose} disableClose={!!saving} bodyClassName="overflow-auto p-5">
    <p className="mb-3 text-sm text-slate-500">Search existing authors. An author can belong to several labs.</p>
    <label className="block text-sm font-medium text-slate-700">Search authors
      <input autoFocus maxLength={200} value={search} onChange={event => setSearch(event.target.value)} className={`${INPUT} mt-1`} placeholder="Type at least 2 characters" />
    </label>
    {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {query.length >= 2 && (options.loading ? <p className="mt-4 text-sm text-slate-500">Searching authors…</p> : options.error ? <LoadError resource={options} /> : <>
      <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-auto">
        {options.data?.map(author => <li key={author.authorId} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-700">{author.name}</p><p className="text-xs text-slate-500">{author.orcid ? `ORCID ${author.orcid}` : author.authorId}</p></div>
          <button className={BUTTON} disabled={!!saving} aria-label={`Add ${author.name}`} onClick={() => add(author)}>{saving === author.authorId ? 'Adding…' : 'Add'}</button>
        </li>)}
      </ul>
      {!options.data?.length && <p className="mt-4 text-sm text-slate-500">No matching authors available to add. Existing members are excluded.</p>}
      {options.data?.length === 20 && <p className="mt-2 text-xs text-slate-500">Showing the first 20 matches. Refine your search to find another author.</p>}
    </>)}
    <p className="mt-4 text-xs text-slate-500">Missing an author? Create their profile on the <Link className="text-blue-600 underline" to="/authors">Authors page</Link>.</p>
    <div className="mt-4 flex justify-end"><button className={BUTTON} onClick={onClose} disabled={!!saving}>Done</button></div>
  </WindowModal>
}

function LabDetail({ id, onUpdated, onDeleted }) {
  const [memberOffset, setMemberOffset] = useState(0)
  const [paperOffset, setPaperOffset] = useState(0)
  const [paperSearch, setPaperSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const lab = useResource(useCallback(() => labsApi.get(id), [id]))
  const members = useResource(useCallback(() => labsApi.members(id, { offset: memberOffset, limit: 50 }), [id, memberOffset, revision]))
  const papers = useResource(useCallback(() => labsApi.papers(id, { search: paperSearch.trim(), offset: paperOffset, limit: 25 }), [id, paperSearch, paperOffset, revision]), paperSearch ? 300 : 0)

  const membershipChanged = useCallback(() => {
    setMemberOffset(0)
    setPaperOffset(0)
    setRevision(value => value + 1)
  }, [])

  async function removeMember(authorId) {
    setBusy(authorId)
    setError(null)
    try {
      await labsApi.removeMember(id, authorId)
      membershipChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }
  async function deleteLab() {
    setBusy('delete')
    setError(null)
    try {
      await labsApi.remove(id)
      onDeleted()
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  if (lab.loading) return <p className="p-6 text-sm text-slate-500">Loading lab…</p>
  if (lab.error) return <div className="p-5"><LoadError resource={lab} /></div>
  return <div className="min-w-0 space-y-6 p-5 lg:p-6">
    <div className="flex flex-col items-start gap-3 xl:flex-row xl:justify-between">
      <div className="min-w-0 flex-1"><h2 className="break-words text-xl font-semibold text-slate-800">{lab.data.name}</h2>
        {lab.data.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-500">{lab.data.description}</p>}
      </div>
      <div className="flex flex-wrap gap-2"><button className={BUTTON} disabled={!!busy} onClick={() => setEditing(true)}>Edit lab</button><button className={`${BUTTON} text-red-600`} disabled={!!busy} onClick={() => { setError(null); setDeleting(true) }}>Delete lab</button></div>
    </div>
    {error && !deleting && <p role="alert" className="text-sm text-red-600">{error}</p>}

    <section aria-label="Lab members">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">Members{!members.loading && !members.error && ` (${members.data.total})`}</h3><button className={BUTTON} disabled={!!busy} onClick={() => setAdding(true)}>Add members</button></div>
      <p className="mt-1 text-xs text-slate-500">Removing a member keeps their author profile and papers.</p>
      {members.loading ? <p className="py-4 text-sm text-slate-500">Loading members…</p> : members.error ? <LoadError resource={members} /> : <>
        {!members.data.items.length && <p className="py-6 text-sm text-slate-500">No members yet. Add authors to start tracking this lab’s work.</p>}
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {members.data.items.map(member => <li key={member.authorId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <Link to={`/authors/${encodeURIComponent(member.authorId)}`} className="min-w-0 text-sm font-medium text-blue-600 hover:underline"><span className="block truncate">{member.name}</span>{member.orcid && <span className="block text-xs font-normal text-slate-500">{member.orcid}</span>}</Link>
            <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" aria-label={`Remove ${member.name}`} title={`Remove ${member.name} from lab`} disabled={!!busy} onClick={() => removeMember(member.authorId)}><Icon name="person_remove" className="text-[18px]" /></button>
          </li>)}
        </ul>
        <Pagination page={members.data} onChange={setMemberOffset} label="Members" />
      </>}
    </section>

    <section aria-label="Lab papers" className="border-t border-slate-200 pt-5">
      <h3 className="font-semibold text-slate-800">Papers{!papers.loading && !papers.error && ` (${papers.data.total})`}</h3>
      <p className="mb-3 mt-1 text-xs leading-relaxed text-slate-500">Saved papers linked to current members, across all libraries. Shared papers appear once. This includes work from before membership; it does not establish affiliation at publication.</p>
      <input aria-label="Search lab papers" maxLength={200} value={paperSearch} onChange={event => { setPaperSearch(event.target.value); setPaperOffset(0) }} placeholder="Search paper titles…" className={INPUT} />
      {papers.loading ? <p className="py-6 text-sm text-slate-500">Loading papers…</p> : papers.error ? <LoadError resource={papers} /> : <>
        {!papers.data.items.length ? <p className="py-8 text-sm text-slate-500">{paperSearch ? 'No papers match this search.' : 'No linked papers yet. Add members and link their papers from their author profiles.'}</p> : <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500"><tr>{['Paper', 'Year', 'Venue', 'Library', 'Status'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium first:pl-0">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{papers.data.items.map(paper => <tr key={paper.id} className="hover:bg-slate-50">
              <td className="min-w-[220px] py-3 pr-3"><Link className="font-medium text-blue-600 hover:underline" to={`/library/paper/${encodeURIComponent(paper.id)}`}>{paper.title}</Link><p className="mt-1 text-xs text-slate-500">{paper.authors.join(', ')}</p></td>
              <td className="px-3 py-3 align-top text-slate-600">{paper.year || '—'}</td><td className="px-3 py-3 align-top text-slate-600">{paper.venue || '—'}</td><td className="px-3 py-3 align-top text-slate-600">{paper.libraryName || 'Unassigned'}</td><td className="whitespace-nowrap px-3 py-3 align-top text-xs text-slate-600">{{ inbox: 'Inbox', 'to-read': 'To read', read: 'Read' }[paper.status] || paper.status}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <Pagination page={papers.data} onChange={setPaperOffset} label="Papers" />
      </>}
    </section>
    {editing && <LabForm lab={lab.data} onClose={() => setEditing(false)} onSaved={saved => { lab.setData(saved); onUpdated() }} />}
    {adding && <AddMembers labId={id} onClose={() => setAdding(false)} onChanged={membershipChanged} />}
    {deleting && <WindowModal open title="Delete lab" onClose={() => setDeleting(false)} disableClose={!!busy} bodyClassName="p-5">
      <p className="text-sm text-slate-600">Delete {lab.data.name} and its memberships? Author profiles and papers will be kept.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className={BUTTON} disabled={!!busy} onClick={() => setDeleting(false)}>Cancel</button><button className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-40" disabled={!!busy} onClick={deleteLab}>{busy ? 'Deleting…' : 'Confirm delete'}</button></div>
    </WindowModal>}
  </div>
}

export default function Labs() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('lab')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  const labs = useResource(useCallback(() => labsApi.list({ search: search.trim(), limit: 30, offset }), [search, offset, revision]), search ? 300 : 0)
  const refreshList = useCallback(() => setRevision(value => value + 1), [])
  return <div className="flex-1 overflow-auto bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-800">Labs</h1><p className="mt-1 text-sm text-slate-500">Follow research groups through their members’ work.</p></div>
        <button className={`${PRIMARY} flex items-center gap-2`} onClick={() => setCreating(true)}><Icon name="add" className="text-[18px]" />Create lab</button>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Labs list" className="rounded-xl border border-slate-200 bg-white p-4">
          <input aria-label="Search labs" maxLength={200} className={INPUT} placeholder="Search labs…" value={search} onChange={event => { setSearch(event.target.value); setOffset(0) }} />
          {labs.loading ? <p className="py-5 text-sm text-slate-500">Loading labs…</p> : labs.error ? <LoadError resource={labs} /> : <>
            <ul className="mt-3 space-y-1">{labs.data.items.map(lab => <li key={lab.id}><button onClick={() => setParams({ lab: lab.id })} aria-current={selectedId === lab.id ? 'true' : undefined} className={`w-full break-words rounded-lg px-3 py-3 text-left text-sm ${selectedId === lab.id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>{lab.name}</button></li>)}</ul>
            {!labs.data.items.length && <p className="py-5 text-sm text-slate-500">{search ? 'No matching labs.' : 'No labs yet. Create your first lab to get started.'}</p>}
            <Pagination page={labs.data} onChange={setOffset} label="Labs" />
          </>}
        </aside>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white">
          {selectedId ? <LabDetail key={selectedId} id={selectedId} onUpdated={refreshList} onDeleted={() => { setParams({}); setOffset(0); refreshList() }} /> : <div className="px-6 py-16 text-center"><Icon name="science" className="text-[40px] text-slate-300" /><h2 className="mt-3 font-semibold text-slate-700">Select a lab to explore its work</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create a lab, add authors as members, and see their linked papers together in one place.</p></div>}
        </div>
      </div>
    </div>
    {creating && <LabForm onClose={() => setCreating(false)} onSaved={lab => { setSearch(''); setOffset(0); refreshList(); setParams({ lab: lab.id }) }} />}
  </div>
}
