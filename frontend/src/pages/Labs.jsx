import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
  const [websites, setWebsites] = useState(lab?.websites?.length ? lab.websites : [''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  async function save(event) {
    event.preventDefault()
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const urls = [...new Set(websites.map(url => url.trim()).filter(Boolean))]
      if (urls.some(value => {
        try { const url = new URL(value); return !['https:', 'http:'].includes(url.protocol) || !!url.username || !!url.password }
        catch { return true }
      })) throw new Error('Enter valid HTTP or HTTPS website URLs without credentials.')
      const data = { name: name.trim(), description: description.trim() || null, websites: urls }
      const saved = lab ? await labsApi.update(lab.id, data) : await labsApi.create(data)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }
  return <WindowModal open title={lab ? 'Edit lab' : 'Create lab'} iconName="science" onClose={onClose} disableClose={saving} allowMinimize={!saving} bodyClassName="max-h-[75vh] overflow-auto p-5">
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={saving} className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">Lab name
        <input autoFocus required maxLength={200} value={name} onChange={event => setName(event.target.value)} className={`${INPUT} mt-1`} placeholder="e.g. Language and Learning Lab" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Description (optional)
        <textarea maxLength={5000} rows={3} value={description} onChange={event => setDescription(event.target.value)} className={`${INPUT} mt-1`} />
      </label>
      <section aria-label="Lab websites" className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">Websites (optional)</h3>
        {websites.map((url, index) => <div key={index} className="flex items-center gap-2">
          <input type="url" aria-label={`Website ${index + 1}`} maxLength={2083} value={url} placeholder="https://example.org" className={INPUT} onChange={event => setWebsites(previous => previous.map((value, i) => i === index ? event.target.value : value))} />
          <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label={`Remove website ${index + 1}`} onClick={() => setWebsites(previous => previous.filter((_, i) => i !== index))}><Icon name="delete" className="text-[18px]" /></button>
        </div>)}
        <button type="button" className={BUTTON} disabled={websites.length >= 20} onClick={() => setWebsites(previous => [...previous, ''])}>Add website</button>
      </section>
      <p className="text-xs text-slate-500">Manage PIs, members, and papers from the lab page.</p>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BUTTON} onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className={PRIMARY} disabled={saving || !name.trim()}>{saving ? 'Saving…' : lab ? 'Save changes' : 'Create lab'}</button>
      </div>
    </form>
  </WindowModal>
}

function PaperPicker({ labId, author = null, addedRole = null, onSaved, onClose }) {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(new Map())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const authorId = author?.authorId
  const options = useResource(useCallback(() => labsApi.paperOptions(labId, {
    search: search.trim(), author_id: authorId, offset, limit: 25,
  }), [labId, search, authorId, offset]), search ? 300 : 0)

  function toggle(paper) {
    setSelected(previous => {
      const next = new Map(previous)
      if (next.has(paper.id)) next.delete(paper.id)
      else if (next.size < 100) next.set(paper.id, paper)
      return next
    })
  }
  async function save() {
    if (!selected.size || saving) return
    setSaving(true)
    setError(null)
    try {
      await labsApi.addPapers(labId, [...selected.keys()], authorId || null)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }
  return <WindowModal open title={author ? `Select papers by ${author.name}` : 'Add papers'} iconName="article" onClose={onClose} disableClose={saving} allowMinimize={!saving} normalPanelClassName="w-full max-w-2xl rounded-2xl" bodyClassName="overflow-auto max-h-[75vh] p-5">
    {addedRole && <p role="status" className="mb-2 text-sm text-green-700">{author.name} added as {addedRole === 'pi' ? 'a PI and member' : 'a member'}.</p>}
    <p className="mb-3 text-sm text-slate-500">{author ? 'Optionally select this author’s existing papers to associate with the lab.' : 'Select saved papers from any library. Lab members are not required.'} Papers already in the lab are excluded.</p>
    <input aria-label="Search papers to add" className={INPUT} maxLength={200} value={search} disabled={saving} onChange={event => { setSearch(event.target.value); setOffset(0) }} placeholder="Search paper titles…" />
    <div className="my-3 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{selected.size} selected (up to 100). Selection stays across pages and searches.</span><button className="shrink-0 text-blue-600 disabled:opacity-40" disabled={saving || !selected.size} onClick={() => setSelected(new Map())}>Clear selection</button></div>
    {!!selected.size && <ul aria-label="Selected papers" className="mb-3 flex max-h-24 flex-wrap gap-1 overflow-auto">{[...selected.values()].map(paper => <li key={paper.id}><button disabled={saving} onClick={() => toggle(paper)} aria-label={`Deselect ${paper.title}`} className="max-w-full rounded bg-blue-50 px-2 py-1 text-left text-xs text-blue-700">{paper.title} ×</button></li>)}</ul>}
    {error && <p role="alert" className="my-3 text-sm text-red-600">{error}</p>}
    {options.loading ? <p className="py-5 text-sm text-slate-500">Loading available papers…</p> : options.error ? <LoadError resource={options} /> : <>
      <ul className="divide-y divide-slate-100">{options.data.items.map(paper => <li key={paper.id}><label className="flex cursor-pointer items-start gap-3 py-3">
        <input type="checkbox" className="mt-1" checked={selected.has(paper.id)} disabled={saving || !selected.has(paper.id) && selected.size >= 100} onChange={() => toggle(paper)} aria-label={`Select ${paper.title}`} />
        <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">{paper.title}</span><span className="mt-1 block text-xs text-slate-500">{paper.authors.join(', ') || 'No authors listed'} · {paper.year || 'Year unknown'} · {paper.libraryName || 'Unassigned'}</span></span>
      </label></li>)}</ul>
      {!options.data.items.length && <p className="py-5 text-sm text-slate-500">{search ? 'No available papers match this search.' : author ? 'No additional papers linked to this author. You can add other papers directly from the lab.' : 'No available papers. Save a paper to a library first, or adjust your search.'}</p>}
      <Pagination page={options.data} onChange={setOffset} label="Available papers" />
    </>}
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={BUTTON} disabled={saving} onClick={onClose}>{addedRole ? 'Done without adding papers' : 'Cancel'}</button><button className={PRIMARY} disabled={saving || !selected.size} onClick={save}>{saving ? 'Adding…' : `Add selected papers (${selected.size})`}</button></div>
  </WindowModal>
}

function AddLabPeople({ labId, isPi = false, pis = [], onChanged, onPapersChanged, onClose }) {
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [addedAuthor, setAddedAuthor] = useState(null)
  const query = search.trim()
  const load = useCallback(() => query.length < 2 ? Promise.resolve([]) : isPi ? labsApi.piOptions(query) : labsApi.memberOptions(labId, query), [labId, query, revision, isPi])
  const options = useResource(load, 300)
  async function add(author) {
    setSaving(author.authorId)
    setError(null)
    setNotice('')
    try {
      const saved = isPi ? await labsApi.addPi(labId, author.authorId) : await labsApi.addMember(labId, author.authorId)
      setNotice(`${author.name} added.`)
      setAddedAuthor(author)
      onChanged(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }
  if (addedAuthor) return <PaperPicker labId={labId} author={addedAuthor} addedRole={isPi ? 'pi' : 'member'} onSaved={onPapersChanged} onClose={() => { setAddedAuthor(null); setRevision(value => value + 1) }} />
  return <WindowModal open title={isPi ? "Add PIs" : "Add members"} iconName="group_add" onClose={onClose} disableClose={!!saving} bodyClassName="overflow-auto p-5">
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
          <button className={BUTTON} disabled={!!saving || isPi && (pis.length >= 50 || pis.some(pi => pi.authorId === author.authorId))} aria-label={`Add ${isPi ? 'PI ' : ''}${author.name}`} onClick={() => add(author)}>{saving === author.authorId ? 'Adding…' : 'Add'}</button>
        </li>)}
      </ul>
      {!options.data?.length && <p className="mt-4 text-sm text-slate-500">{isPi ? 'No matching authors. Try another name.' : 'No matching authors available to add. Existing members are excluded.'}</p>}
      {options.data?.length === 20 && <p className="mt-2 text-xs text-slate-500">Showing the first 20 matches. Refine your search to find another author.</p>}
    </>)}
    {isPi && pis.length >= 50 && <p className="mt-3 text-xs text-slate-500">This lab already has 50 PIs. Remove a PI before adding another.</p>}
    <p className="mt-4 text-xs text-slate-500">Missing an author? Create their profile on the <Link className="text-blue-600 underline" to="/authors">Authors page</Link>.</p>
    <div className="mt-4 flex justify-end"><button className={BUTTON} onClick={onClose} disabled={!!saving}>Done</button></div>
  </WindowModal>
}

function LabPersonRow({ person, isPi = false, busy, onChoosePapers, onRemove }) {
  return <li className="flex items-center justify-between gap-2 py-3 first:pt-0">
    <Link to={`/authors/${encodeURIComponent(person.authorId)}`} className="flex min-w-0 items-center gap-2.5 text-xs text-slate-700 hover:text-blue-600"><span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">{initials(person.name)}</span><span className="min-w-0 break-words font-medium">{person.name}</span></Link>
    <div className="flex shrink-0 gap-0.5"><button className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40" aria-label={`Choose papers by ${person.name}`} title={`Choose papers by ${person.name}`} disabled={!!busy} onClick={() => onChoosePapers(person)}><Icon name="article" className="text-[15px]" /></button><button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" aria-label={`Remove ${person.name}${isPi ? ' as PI' : ''}`} title={`Remove ${person.name} ${isPi ? 'as PI' : 'from lab'}`} disabled={!!busy} onClick={() => onRemove(person.authorId)}><Icon name="person_remove" className="text-[15px]" /></button></div>
  </li>
}

function LabDetail({ id, onDeleted, backTo }) {
  const [memberOffset, setMemberOffset] = useState(0)
  const [paperOffset, setPaperOffset] = useState(0)
  const [paperSearch, setPaperSearch] = useState('')
  const [memberRevision, setMemberRevision] = useState(0)
  const [paperRevision, setPaperRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addingPis, setAddingPis] = useState(false)
  const [paperPicker, setPaperPicker] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const lab = useResource(useCallback(() => labsApi.get(id), [id]))
  const members = useResource(useCallback(() => labsApi.members(id, { offset: memberOffset, limit: 50, excludePis: true }), [id, memberOffset, memberRevision]))
  const papers = useResource(useCallback(() => labsApi.papers(id, { search: paperSearch.trim(), offset: paperOffset, limit: 25 }), [id, paperSearch, paperOffset, paperRevision]), paperSearch ? 300 : 0)

  const membershipChanged = useCallback(() => {
    setMemberOffset(0)
    setMemberRevision(value => value + 1)
  }, [])
  const papersChanged = useCallback(() => {
    setPaperOffset(0)
    setPaperRevision(value => value + 1)
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
  async function removePi(authorId) {
    setBusy(authorId)
    setError(null)
    try {
      const saved = await labsApi.removePi(id, authorId)
      lab.setData(saved)
      membershipChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }
  async function removePaper(paperId) {
    setBusy(paperId)
    setError(null)
    try {
      await labsApi.removePaper(id, paperId)
      papersChanged()
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

  if (lab.loading) return <div className="mx-auto max-w-7xl p-6" role="status"><p className="text-sm text-slate-500">Loading lab…</p><div className="mt-6 h-48 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (lab.error) return <div className="mx-auto max-w-7xl p-6"><Link to={backTo} className="text-sm text-blue-600 hover:underline">All labs</Link><LoadError resource={lab} /></div>
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <Link to={backTo} className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600"><Icon name="arrow_back" className="text-[16px]" />All labs</Link>
    <header>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{lab.data.name}</h1>
          {lab.data.description && <p className="mt-3 max-w-3xl whitespace-pre-wrap break-words text-sm leading-7 text-slate-500">{lab.data.description}</p>}
          <section aria-label="Websites" className="mt-5">
            {lab.data.websites?.length ? <ul className="flex flex-wrap gap-2">{lab.data.websites.map(url => <li key={url} className="min-w-0 max-w-full"><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><Icon name="language" className="shrink-0 text-[15px]" /><span className="break-all">{url}</span><Icon name="open_in_new" className="shrink-0 text-[13px]" /></a></li>)}</ul> : <p className="text-xs text-slate-400">No websites added. Use Edit lab to add links.</p>}
          </section>
        </div>
        <div className="flex shrink-0 gap-1"><button className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600 disabled:opacity-40" aria-label="Edit lab" title="Edit lab" disabled={!!busy} onClick={() => setEditing(true)}><Icon name="edit" className="text-[18px]" /></button><button className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" aria-label="Delete lab" title="Delete lab" disabled={!!busy} onClick={() => { setError(null); setDeleting(true) }}><Icon name="delete" className="text-[18px]" /></button></div>
      </div>
    </header>
    {error && !deleting && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside aria-label="Lab people" className="min-w-0 space-y-5">
        <section aria-label="Principal investigators" className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xs font-semibold text-slate-800">PIs ({lab.data.principalInvestigators?.length || 0})</h2><button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-40" disabled={!!busy} onClick={() => setAddingPis(true)}><Icon name="add" className="text-[15px]" />Add PIs</button></div>
          {lab.data.principalInvestigators?.length ? <ul className="divide-y divide-slate-100">{lab.data.principalInvestigators.map(pi => <LabPersonRow key={pi.authorId} person={pi} isPi busy={busy} onChoosePapers={author => setPaperPicker({ author })} onRemove={removePi} />)}</ul> : <p className="text-xs leading-5 text-slate-400">No PIs yet. Use Add PIs to choose authors.</p>}
        </section>
        <section aria-label="Lab members" className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xs font-semibold text-slate-800">Members{!members.loading && !members.error && ` (${members.data.total})`}</h2><button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-40" disabled={!!busy} onClick={() => setAdding(true)}><Icon name="add" className="text-[15px]" />Add members</button></div>
          {members.loading ? <p className="py-3 text-xs text-slate-400">Loading members…</p> : members.error ? <LoadError resource={members} /> : <>
            {!members.data.items.length && <p className="py-2 text-xs leading-5 text-slate-400">No members yet. You can still add papers directly.</p>}
            <ul className="divide-y divide-slate-100">{members.data.items.map(member => <LabPersonRow key={member.authorId} person={member} busy={busy} onChoosePapers={author => setPaperPicker({ author })} onRemove={removeMember} />)}</ul>
            <Pagination page={members.data} onChange={setMemberOffset} label="Members" />
          </>}
        </section>
      </aside>

      <section aria-label="Lab papers" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5"><div><h2 className="font-semibold text-slate-800">Papers{!papers.loading && !papers.error && ` (${papers.data.total})`}</h2></div><button className={`${PRIMARY} inline-flex items-center gap-1.5 text-xs`} disabled={!!busy} onClick={() => setPaperPicker({})}><Icon name="add" className="text-[17px]" />Add papers</button></div>
        <div className="relative m-5"><Icon name="search" className="pointer-events-none absolute left-3 top-2.5 text-[18px] text-slate-400" /><input aria-label="Search lab papers" maxLength={200} value={paperSearch} onChange={event => { setPaperSearch(event.target.value); setPaperOffset(0) }} placeholder="Search paper titles…" className={`${INPUT} pl-10`} /></div>
        {papers.loading ? <p className="px-5 py-12 text-sm text-slate-400">Loading papers…</p> : papers.error ? <div className="px-5 pb-5"><LoadError resource={papers} /></div> : <>
          {!papers.data.items.length ? <div className="border-t border-slate-100 px-6 py-14 text-center"><Icon name={paperSearch ? 'search_off' : 'article'} className="text-[34px] text-slate-200" /><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">{paperSearch ? 'No papers match this search.' : 'No papers selected yet. Use Add papers, or choose papers from a member’s profile.'}</p></div> : <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-y border-slate-200 bg-slate-50"><tr><th scope="col" className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Title</th><th scope="col" className="w-20 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Year</th><th scope="col" className="relative w-10"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">{papers.data.items.map(paper => <tr key={paper.id} className="group transition-colors hover:bg-blue-50">
                <td className="min-w-[180px] px-5 py-3.5"><Link className="text-[13px] font-medium leading-5 text-slate-800 hover:text-blue-600 hover:underline" to={`/library/paper/${encodeURIComponent(paper.id)}`}>{paper.title}</Link><p className="mt-1 text-xs leading-5 text-slate-500">{paper.authors.join(', ') || 'No authors listed'}</p></td>
                <td className="whitespace-nowrap px-2 py-3.5 align-top text-[13px] tabular-nums text-slate-500">{paper.year || '—'}</td>
                <td className="py-3.5 pr-3 align-top"><button className="inline-flex rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 focus-visible:text-red-600 disabled:opacity-40" disabled={!!busy} onClick={() => removePaper(paper.id)} aria-label={`Remove paper ${paper.title}`} title="Remove paper from lab"><Icon name="delete" className="text-[17px]" /></button></td>
              </tr>)}</tbody>
            </table>
          </div>}
          {(papers.data.total > papers.data.limit || paperOffset > 0) && <div className="border-t border-slate-100 px-5 pb-4"><Pagination page={papers.data} onChange={setPaperOffset} label="Papers" /></div>}
        </>}
      </section>
    </div>
    {editing && <LabForm lab={lab.data} onClose={() => setEditing(false)} onSaved={saved => lab.setData(saved)} />}
    {addingPis && <AddLabPeople labId={id} isPi pis={lab.data.principalInvestigators || []} onClose={() => setAddingPis(false)} onChanged={saved => { lab.setData(saved); membershipChanged() }} onPapersChanged={papersChanged} />}
    {adding && <AddLabPeople labId={id} onClose={() => setAdding(false)} onChanged={membershipChanged} onPapersChanged={papersChanged} />}
    {paperPicker && <PaperPicker key={paperPicker.author?.authorId || 'all-papers'} labId={id} author={paperPicker.author} onClose={() => setPaperPicker(null)} onSaved={papersChanged} />}
    {deleting && <WindowModal open title="Delete lab" onClose={() => setDeleting(false)} disableClose={!!busy} bodyClassName="p-5">
      <p className="text-sm text-slate-600">Delete {lab.data.name} and its PI, member, and paper associations? Author profiles and papers will be kept.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className={BUTTON} disabled={!!busy} onClick={() => setDeleting(false)}>Cancel</button><button className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-40" disabled={!!busy} onClick={deleteLab}>{busy ? 'Deleting…' : 'Confirm delete'}</button></div>
    </WindowModal>}
  </div>
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
}

export function LabDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const backTo = location.state?.from?.startsWith('/labs?') ? location.state.from : '/labs'
  return <div className="min-w-0 flex-1 overflow-auto bg-slate-50"><LabDetail key={id} id={id} backTo={backTo} onDeleted={() => navigate('/labs', { replace: true })} /></div>
}

export default function Labs() {
  const [params] = useSearchParams()
  const legacyId = params.get('lab')
  return legacyId ? <Navigate to={`/labs/${encodeURIComponent(legacyId)}`} replace /> : <LabsDirectory />
}

function LabsDirectory() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const search = params.get('search') || ''
  const rawOffset = Number(params.get('offset') || 0)
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0
  const [creating, setCreating] = useState(false)
  const labs = useResource(useCallback(() => labsApi.list({ search: search.trim(), limit: 30, offset }), [search, offset]), search ? 300 : 0)
  const listPath = `/labs${params.size ? `?${params}` : ''}`
  function changeSearch(value) {
    setParams(value ? { search: value } : {}, { replace: true })
  }
  function changePage(value) {
    setParams({ ...(search ? { search } : {}), ...(value ? { offset: String(value) } : {}) })
  }
  return <div className="min-w-0 flex-1 overflow-auto bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Labs</h1>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700" onClick={() => setCreating(true)}><Icon name="add" className="text-[16px]" />Create lab</button>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-sm"><Icon name="search" className="pointer-events-none absolute left-3 top-2.5 text-[18px] text-slate-400" /><input aria-label="Search labs" maxLength={200} className={`${INPUT} bg-white pl-10`} placeholder="Find a lab…" value={search} onChange={event => changeSearch(event.target.value)} /></div>
        {!labs.loading && !labs.error && <p className="text-xs text-slate-400">{labs.data.total} {labs.data.total === 1 ? 'lab' : 'labs'}{search ? ' found' : ' in your directory'}</p>}
      </div>
      {labs.loading ? <div role="status"><span className="sr-only">Loading labs…</span><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white" />)}</div></div> : labs.error ? <LoadError resource={labs} /> : <>
        <ul aria-label="Labs directory" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{labs.data.items.map(lab => <li key={lab.id} className="min-w-0">
          <Link to={`/labs/${encodeURIComponent(lab.id)}`} state={{ from: listPath }} aria-label={`Open ${lab.name}`} className="group flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">
            <h2 className="break-words text-sm font-semibold leading-5 text-slate-800">{lab.name}</h2>
            {!!lab.principalInvestigators?.length && <p aria-label="Principal investigators" className="mt-1 break-words text-xs leading-5 text-slate-500">{lab.principalInvestigators.map(pi => pi.name).join(', ')}</p>}
            {lab.description && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">{lab.description}</p>}
            {!!lab.websites?.length && <p className="mt-auto truncate pt-3 text-[11px] text-slate-400">{lab.websites[0].replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>}
          </Link>
        </li>)}</ul>
        {!labs.data.items.length && <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-8 text-center"><h2 className="text-sm font-semibold text-slate-800">{search ? 'No matching labs.' : 'Build your research directory'}</h2><p className="mt-2 text-sm text-slate-500">{search ? 'Try a different name or clear your search.' : 'No labs yet. Create your first lab to get started.'}</p>{search && <button className={`${BUTTON} mt-5`} onClick={() => changeSearch('')}>Clear search</button>}</div>}
        <Pagination page={labs.data} onChange={changePage} label="Labs" />
      </>}
    </div>
    {creating && <LabForm onClose={() => setCreating(false)} onSaved={lab => navigate(`/labs/${encodeURIComponent(lab.id)}`)} />}
  </div>
}
