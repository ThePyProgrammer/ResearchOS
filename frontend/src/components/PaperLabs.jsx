import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { papersApi } from '../services/api'

export default function PaperLabs({ paperId }) {
  const [labs, setLabs] = useState([])
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
      <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Labs</h4>
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
    </section>
  )
}
