import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { labsApi } from '../services/api'
import WindowModal from './WindowModal'

const BUTTON = 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40'

export default function AuthorLabManager({ author, onChange, onClose }) {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    const timer = setTimeout(async () => {
      try {
        const result = await labsApi.list({ search: search.trim(), offset, limit: 20 })
        if (active) setPage(result)
      } catch (err) {
        if (active) setLoadError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }, search ? 300 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [search, offset, revision])

  async function changeMembership(lab, action) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await labsApi[action](lab.id, author.id)
      const remaining = (author.labs || []).filter(item => item.id !== lab.id)
      const next = action === 'removeMember' ? remaining : [
        ...remaining,
        { id: lab.id, name: lab.name, isMember: true, isPi: action === 'addPi' },
      ]
      onChange(next)
      setNotice(action === 'removeMember' ? 'Removed from ' + lab.name + '.' : lab.name + ' membership updated.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return <WindowModal open title="Manage labs" iconName="groups" onClose={onClose} disableClose={busy} normalPanelClassName="w-full max-w-2xl rounded-2xl" bodyClassName="max-h-[75vh] overflow-y-auto p-5">
    <p className="text-sm text-slate-500">Manage lab membership for {author.name}. PIs are also members. Removing a PI role keeps the membership; removing a membership removes both roles.</p>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="mt-3 text-xs text-emerald-700">{notice}</p>}
    <h3 className="mt-5 text-xs font-semibold text-slate-800">Current labs</h3>
    {!author.labs?.length ? <p className="mt-2 text-xs text-slate-400">No labs associated.</p> : <ul className="mt-2 divide-y divide-slate-100">
      {author.labs.map(lab => <li key={lab.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><Link to={'/labs/' + encodeURIComponent(lab.id)} className="break-words text-sm font-medium text-slate-700 hover:text-blue-600">{lab.name}</Link><p className="mt-1 text-xs text-slate-400">{lab.isPi ? 'Principal investigator' : 'Member'}</p></div>
        <div className="flex gap-2">
          <button className={BUTTON} disabled={busy} aria-label={(lab.isPi ? 'Remove PI role in ' : 'Make PI in ') + lab.name} onClick={() => changeMembership(lab, lab.isPi ? 'removePi' : 'addPi')}>{lab.isPi ? 'Remove PI role' : 'Make PI'}</button>
          <button className={BUTTON + ' hover:text-red-600'} disabled={busy} aria-label={'Remove membership in ' + lab.name} onClick={() => changeMembership(lab, 'removeMember')}>Remove</button>
        </div>
      </li>)}
    </ul>}
    <label className="mt-6 block text-xs font-semibold text-slate-800" htmlFor="author-lab-search">Add to a lab</label>
    <input id="author-lab-search" aria-label="Search labs to join" maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setOffset(0) }} placeholder="Search lab names…" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
    {loading ? <p className="py-5 text-sm text-slate-400">Loading labs…</p> : loadError ? <div className="py-4"><p role="alert" className="text-sm text-red-600">{loadError}</p><button className={BUTTON + ' mt-2'} onClick={() => setRevision(value => value + 1)}>Retry</button></div> : <>
      {!page?.items.length && <p className="py-5 text-sm text-slate-400">No labs match this search.</p>}
      <ul className="mt-2 divide-y divide-slate-100">{page?.items.map(lab => {
        const joined = author.labs?.some(item => item.id === lab.id)
        return <li key={lab.id} className="flex items-center justify-between gap-3 py-3">
          <span className="min-w-0 break-words text-sm text-slate-700">{lab.name}</span>
          {joined ? <span className="shrink-0 text-xs text-slate-400">Already joined</span> : <button className={BUTTON + ' shrink-0'} disabled={busy} aria-label={'Join ' + lab.name} onClick={() => changeMembership(lab, 'addMember')}>Join lab</button>}
        </li>
      })}</ul>
      {page && page.total > page.limit && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500"><button className={BUTTON} disabled={!offset || busy} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous</button><span>{offset + 1}–{Math.min(offset + 20, page.total)} of {page.total}</span><button className={BUTTON} disabled={offset + 20 >= page.total || busy} onClick={() => setOffset(value => value + 20)}>Next</button></div>}
    </>}
    <div className="mt-5 flex justify-end"><button className={BUTTON} disabled={busy} onClick={onClose}>Done</button></div>
  </WindowModal>
}
