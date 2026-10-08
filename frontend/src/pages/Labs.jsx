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
  const [websites, setWebsites] = useState(lab?.websites?.length ? lab.websites : [''])
  const [pis, setPis] = useState(lab?.principalInvestigators || [])
  const [piSearch, setPiSearch] = useState('')
  const piQuery = piSearch.trim()
  const piOptions = useResource(useCallback(() => piQuery.length < 2 ? Promise.resolve([]) : labsApi.piOptions(piQuery), [piQuery]), 300)
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
      const data = { name: name.trim(), description: description.trim() || null, websites: urls, piAuthorIds: pis.map(pi => pi.authorId) }
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
      <section aria-label="Select principal investigators" className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">Principal investigators (PIs)</h3>
        <p className="text-xs text-slate-500">Select existing authors. PI assignments are independent of members and papers.</p>
        <ul className="flex flex-wrap gap-2">{pis.map(pi => <li key={pi.authorId} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-sm text-blue-700">{pi.name}<button type="button" className="inline-flex rounded p-1 hover:bg-blue-100" aria-label={`Remove PI ${pi.name}`} onClick={() => setPis(previous => previous.filter(item => item.authorId !== pi.authorId))}><Icon name="close" className="text-[16px]" /></button></li>)}</ul>
        <label className="block text-sm text-slate-700">Search PI authors
          <input maxLength={200} value={piSearch} onChange={event => setPiSearch(event.target.value)} className={`${INPUT} mt-1`} placeholder="Type at least 2 characters" />
        </label>
        {piQuery.length >= 2 && (piOptions.loading ? <p className="text-xs text-slate-500">Searching authors…</p> : piOptions.error ? <div role="alert" className="text-sm text-red-600">{piOptions.error} <button type="button" className="underline" onClick={piOptions.retry}>Retry author search</button></div> : <>
          <ul className="max-h-48 divide-y divide-slate-100 overflow-auto">{piOptions.data?.map(author => <li key={author.authorId} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0 text-sm text-slate-700">{author.name}<span className="block text-xs text-slate-500">{author.orcid || author.authorId}</span></span>
            <button type="button" className={BUTTON} disabled={pis.length >= 50 || pis.some(pi => pi.authorId === author.authorId)} aria-label={`Select PI ${author.name}`} onClick={() => setPis(previous => [...previous, author])}>{pis.some(pi => pi.authorId === author.authorId) ? 'Selected' : 'Select'}</button>
          </li>)}</ul>
          {!piOptions.data?.length && <p className="text-xs text-slate-500">No matching authors. Create an author on the Authors page first.</p>}
          {piOptions.data?.length === 20 && <p className="text-xs text-slate-500">Showing the first 20 matches. Refine your search for more.</p>}
        </>)}
        {pis.length >= 50 && <p className="text-xs text-slate-500">You can select up to 50 PIs.</p>}
      </section>
      <p className="text-xs text-slate-500">Add members and choose papers independently. A lab can track papers without any members.</p>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BUTTON} onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className={PRIMARY} disabled={saving || !name.trim()}>{saving ? 'Saving…' : lab ? 'Save changes' : 'Create lab'}</button>
      </div>
    </form>
  </WindowModal>
}

function PaperPicker({ labId, author = null, memberJustAdded = false, onSaved, onClose }) {
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
    {memberJustAdded && <p role="status" className="mb-2 text-sm text-green-700">{author.name} added as a member.</p>}
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
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={BUTTON} disabled={saving} onClick={onClose}>{memberJustAdded ? 'Done without adding papers' : 'Cancel'}</button><button className={PRIMARY} disabled={saving || !selected.size} onClick={save}>{saving ? 'Adding…' : `Add selected papers (${selected.size})`}</button></div>
  </WindowModal>
}

function AddMembers({ labId, onChanged, onPapersChanged, onClose }) {
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [addedAuthor, setAddedAuthor] = useState(null)
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
      setAddedAuthor(author)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }
  if (addedAuthor) return <PaperPicker labId={labId} author={addedAuthor} memberJustAdded onSaved={onPapersChanged} onClose={() => { setAddedAuthor(null); setRevision(value => value + 1) }} />
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
  const [memberRevision, setMemberRevision] = useState(0)
  const [paperRevision, setPaperRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [paperPicker, setPaperPicker] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const lab = useResource(useCallback(() => labsApi.get(id), [id]))
  const members = useResource(useCallback(() => labsApi.members(id, { offset: memberOffset, limit: 50 }), [id, memberOffset, memberRevision]))
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

    <div className="grid gap-4 sm:grid-cols-2">
      <section aria-label="Websites"><h3 className="text-sm font-semibold text-slate-800">Websites</h3>
        {lab.data.websites?.length ? <ul className="mt-2 space-y-1">{lab.data.websites.map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-blue-600 hover:underline">{url}<Icon name="open_in_new" className="ml-1 align-middle text-[14px]" /></a></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">No websites added. Use Edit lab to add links.</p>}
      </section>
      <section aria-label="Principal investigators"><h3 className="text-sm font-semibold text-slate-800">Principal investigators (PIs)</h3>
        {lab.data.principalInvestigators?.length ? <ul className="mt-2 space-y-1">{lab.data.principalInvestigators.map(pi => <li key={pi.authorId}><Link to={`/authors/${encodeURIComponent(pi.authorId)}`} className="text-sm text-blue-600 hover:underline">{pi.name}</Link></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">No PIs selected. Use Edit lab to choose authors.</p>}
      </section>
    </div>

    <section aria-label="Lab members">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">Members{!members.loading && !members.error && ` (${members.data.total})`}</h3><button className={BUTTON} disabled={!!busy} onClick={() => setAdding(true)}>Add members</button></div>
      <p className="mt-1 text-xs text-slate-500">Membership does not add papers automatically. Removing a member keeps the lab’s paper associations.</p>
      {members.loading ? <p className="py-4 text-sm text-slate-500">Loading members…</p> : members.error ? <LoadError resource={members} /> : <>
        {!members.data.items.length && <p className="py-6 text-sm text-slate-500">No members yet. You can still add papers directly.</p>}
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {members.data.items.map(member => <li key={member.authorId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <Link to={`/authors/${encodeURIComponent(member.authorId)}`} className="min-w-0 text-sm font-medium text-blue-600 hover:underline"><span className="block truncate">{member.name}</span>{member.orcid && <span className="block text-xs font-normal text-slate-500">{member.orcid}</span>}</Link>
            <div className="flex shrink-0 items-center gap-1"><button className="rounded p-1 text-blue-600 hover:bg-blue-50 disabled:opacity-40" aria-label={`Choose papers by ${member.name}`} title={`Choose papers by ${member.name}`} disabled={!!busy} onClick={() => setPaperPicker({ author: member })}><Icon name="article" className="text-[18px]" /></button><button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" aria-label={`Remove ${member.name}`} title={`Remove ${member.name} from lab`} disabled={!!busy} onClick={() => removeMember(member.authorId)}><Icon name="person_remove" className="text-[18px]" /></button></div>
          </li>)}
        </ul>
        <Pagination page={members.data} onChange={setMemberOffset} label="Members" />
      </>}
    </section>

    <section aria-label="Lab papers" className="border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">Papers{!papers.loading && !papers.error && ` (${papers.data.total})`}</h3><button className={BUTTON} disabled={!!busy} onClick={() => setPaperPicker({})}>Add papers</button></div>
      <p className="mb-3 mt-1 text-xs leading-relaxed text-slate-500">Papers explicitly selected for this lab, across all libraries. Removing a paper here only unlinks it from the lab.</p>
      <input aria-label="Search lab papers" maxLength={200} value={paperSearch} onChange={event => { setPaperSearch(event.target.value); setPaperOffset(0) }} placeholder="Search paper titles…" className={INPUT} />
      {papers.loading ? <p className="py-6 text-sm text-slate-500">Loading papers…</p> : papers.error ? <LoadError resource={papers} /> : <>
        {!papers.data.items.length ? <p className="py-8 text-sm text-slate-500">{paperSearch ? 'No papers match this search.' : 'No papers selected yet. Use Add papers, or choose papers from a member’s profile.'}</p> : <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500"><tr>{['Paper', 'Year'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium first:pl-0">{label}</th>)}<th scope="col" className="w-10"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{papers.data.items.map(paper => <tr key={paper.id} className="hover:bg-slate-50">
              <td className="min-w-[220px] py-3 pr-3"><Link className="font-medium text-blue-600 hover:underline" to={`/library/paper/${encodeURIComponent(paper.id)}`}>{paper.title}</Link><p className="mt-1 text-xs text-slate-500">{paper.authors.join(', ')}</p></td>
              <td className="px-3 py-3 align-top text-slate-600">{paper.year || '—'}</td>
              <td className="py-3 pl-3 text-right align-top"><button className="inline-flex rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={!!busy} onClick={() => removePaper(paper.id)} aria-label={`Remove paper ${paper.title}`} title="Remove paper from lab"><Icon name="delete" className="text-[18px]" /></button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        <Pagination page={papers.data} onChange={setPaperOffset} label="Papers" />
      </>}
    </section>
    {editing && <LabForm lab={lab.data} onClose={() => setEditing(false)} onSaved={saved => { lab.setData(saved); onUpdated() }} />}
    {adding && <AddMembers labId={id} onClose={() => setAdding(false)} onChanged={membershipChanged} onPapersChanged={papersChanged} />}
    {paperPicker && <PaperPicker key={paperPicker.author?.authorId || 'all-papers'} labId={id} author={paperPicker.author} onClose={() => setPaperPicker(null)} onSaved={papersChanged} />}
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
        <div><h1 className="text-2xl font-bold text-slate-800">Labs</h1><p className="mt-1 text-sm text-slate-500">Track research groups, their members, and selected papers.</p></div>
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
          {selectedId ? <LabDetail key={selectedId} id={selectedId} onUpdated={refreshList} onDeleted={() => { setParams({}); setOffset(0); refreshList() }} /> : <div className="px-6 py-16 text-center"><Icon name="science" className="text-[40px] text-slate-300" /><h2 className="mt-3 font-semibold text-slate-700">Select a lab to explore its work</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create a lab, optionally add members, and choose the papers you want to associate with it.</p></div>}
        </div>
      </div>
    </div>
    {creating && <LabForm onClose={() => setCreating(false)} onSaved={lab => { setSearch(''); setOffset(0); refreshList(); setParams({ lab: lab.id }) }} />}
  </div>
}
