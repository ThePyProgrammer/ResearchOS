import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { labsApi, papersApi } from '../services/api'

const PAGE_SIZE = 10
const BUTTON = 'rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-500'

export default function PaperLabs({ paperId }) {
  return <PaperLabsContent key={paperId} paperId={paperId} />
}

function LabPicker({ paperId, labs, onAdd }) {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [addingId, setAddingId] = useState(null)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    const timer = setTimeout(async () => {
      try {
        const result = await labsApi.list({ search: search.trim(), offset, limit: PAGE_SIZE })
        if (active) setPage(result)
      } catch (err) {
        if (active) setLoadError(err.message || 'Unable to load labs.')
      } finally {
        if (active) setLoading(false)
      }
    }, search ? 300 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [search, offset, revision])

  async function addLab(lab) {
    setAddingId(lab.id)
    setError(null)
    setNotice(null)
    try {
      await labsApi.addPapers(lab.id, [paperId])
      onAdd({ id: lab.id, name: lab.name })
      setNotice('Added to ' + lab.name + '.')
    } catch (err) {
      setError(err.message || 'Unable to add paper to lab.')
    } finally {
      setAddingId(null)
    }
  }

  return <div className="mt-3 rounded-lg border border-slate-200 p-2">
    <input autoFocus aria-label="Search existing labs" maxLength={200} value={search}
      onChange={event => { setSearch(event.target.value); setOffset(0) }} placeholder="Search labs…"
      className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {notice && <p role="status" className="mt-2 text-xs text-emerald-700">{notice}</p>}
    {loading ? <p role="status" className="py-3 text-xs text-slate-400">Loading available labs…</p> : loadError ? (
      <div className="py-2"><p role="alert" className="text-xs text-red-600">{loadError}</p><button className={BUTTON} onClick={() => setRevision(value => value + 1)}>Retry</button></div>
    ) : <>
      {!page?.items.length && <p className="py-3 text-xs text-slate-400">{search.trim() ? 'No labs match this search.' : 'No existing labs available.'}</p>}
      <ul className="mt-1 max-h-60 overflow-y-auto divide-y divide-slate-100">
        {page?.items.map(lab => <li key={lab.id} className="flex items-center justify-between gap-2 py-2">
          <span className="min-w-0 break-words text-xs text-slate-700">{lab.name}</span>
          {labs.some(linked => linked.id === lab.id) ? <span className="shrink-0 text-[10px] text-slate-400">Already linked</span> : (
            <button className={BUTTON + ' shrink-0'} disabled={addingId !== null} aria-label={'Add to ' + lab.name} onClick={() => addLab(lab)}>{addingId === lab.id ? 'Adding…' : 'Add'}</button>
          )}
        </li>)}
      </ul>
      {page && page.total > PAGE_SIZE && <div className="mt-2 flex items-center justify-between gap-1 text-[10px] text-slate-500">
        <button className={BUTTON} disabled={!offset || addingId !== null} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Previous</button>
        <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} of {page.total}</span>
        <button className={BUTTON} disabled={offset + PAGE_SIZE >= page.total || addingId !== null} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next</button>
      </div>}
    </>}
  </div>
}

function PaperLabsContent({ paperId }) {
  const [labs, setLabs] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setLabs([])
    async function load() {
      try {
        const result = await papersApi.labs(paperId)
        if (active) setLabs(result)
      } catch (err) {
        if (active) setError(err.message || 'Unable to load labs.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [paperId, revision])

  return (
    <section aria-label="Paper labs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Labs</h4>
        <button className={BUTTON} disabled={loading || !!error} aria-expanded={pickerOpen} onClick={() => setPickerOpen(value => !value)}>{pickerOpen ? 'Done' : 'Add to lab'}</button>
      </div>
      {loading ? <p role="status" className="text-xs text-slate-400">Loading labs…</p> : error ? (
        <div role="alert" className="text-xs text-red-600">
          <p>{error}</p>
          <button onClick={() => setRevision(value => value + 1)} className="mt-1 font-medium underline rounded focus-visible:ring-2 focus-visible:ring-blue-500">Retry</button>
        </div>
      ) : labs.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {labs.map(lab => (
            <li key={lab.id} className="min-w-0 max-w-full">
              <Link to={'/labs/' + encodeURIComponent(lab.id)}
                className="inline-block max-w-full break-words rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                {lab.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-400">No labs linked to this paper.</p>}
      {pickerOpen && <LabPicker paperId={paperId} labs={labs} onAdd={lab => setLabs(current => current.some(item => item.id === lab.id) ? current : [...current, lab].sort((a, b) => a.name.localeCompare(b.name)))} />}
    </section>
  )
}
