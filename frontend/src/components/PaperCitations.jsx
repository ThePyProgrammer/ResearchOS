import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { papersApi } from '../services/api'

// Remount on paper/library change so old reads, mutations and polls cannot leak state.
export default function PaperCitations({ paperId, libraryId, sourceVersion = '', hasStoredPdf = false }) {
  return <CitationLists key={`${libraryId || ''}:${paperId}:${sourceVersion}`} paperId={paperId} hasStoredPdf={hasStoredPdf} />
}

function CitationLists({ paperId, hasStoredPdf }) {
  const [direction, setDirection] = useState('outgoing')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [queueing, setQueueing] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    let cancelled = false
    let timer
    setLoading(true)
    setError(null)
    async function load() {
      try {
        const page = await papersApi.citations(paperId, { direction, offset, limit: 10 })
        if (cancelled) return
        if (!Array.isArray(page?.items) || !Array.isArray(page?.jobs) || !Array.isArray(page?.runs)) {
          throw new Error('Citation data could not be loaded.')
        }
        setData(page)
        setLoading(false)
        // Incoming links can arrive when any source in the library is indexed.
        if (page.pendingJobs > 0 || page.jobs.some(job => ['pending', 'running'].includes(job.status))) {
          timer = setTimeout(load, 10000)
        }
      } catch (err) {
        if (!cancelled) { setError(err.message); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [paperId, direction, offset, refresh])

  async function reindex(pdf = false) {
    setQueueing(true)
    setError(null)
    try {
      if (pdf) await papersApi.reindexPdfCitations(paperId)
      else await papersApi.reindexCitations(paperId)
      if (alive.current) setRefresh(value => value + 1)
    } catch (err) {
      if (alive.current) setError(err.message)
    } finally {
      if (alive.current) setQueueing(false)
    }
  }

  const jobs = data?.jobs || []
  const busy = queueing || jobs.some(job => ['pending', 'running'].includes(job.status))
  const activeRuns = (data?.runs || []).filter(run => run.active)
  const failed = jobs.some(job => job.status === 'failed')
  const partial = jobs.some(job => ['partial', 'not_found'].includes(job.status))
  const lastIndexed = activeRuns.map(run => run.indexedAt).sort().at(-1)
  const label = direction === 'outgoing' ? 'References in this library' : 'Cited by in this library'

  return (
    <section className="border-t border-slate-200 p-4 text-sm" aria-label="Paper citations">
      <h3 className="font-semibold text-slate-800 mb-3">Citations</h3>
      <div className="flex gap-2 mb-3" aria-label="Citation direction">
        {['outgoing', 'incoming'].map(value => (
          <button key={value} type="button" aria-pressed={direction === value} disabled={direction === value}
            className={`rounded px-2 py-1 text-xs ${direction === value ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}
            onClick={() => { setDirection(value); setOffset(0); setData(null) }}>
            {value === 'outgoing' ? 'References' : 'Cited by'}
          </button>
        ))}
      </div>
      <h4 className="text-xs font-semibold mb-2">{label}{data ? ` (${data.total})` : ''}</h4>
      {error && <div role="alert" className="text-red-700 mb-2">{error} <button className="underline" onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
      {loading && <p role="status" className="text-slate-500">Loading citations…</p>}
      {data && <>
        {busy && <p role="status" className="text-slate-500 mb-2">Indexing queued or in progress.</p>}
        {failed && <p className="text-amber-700 mb-2">Indexing failed. {activeRuns.length > 0 && 'Showing previously indexed evidence.'}</p>}
        {partial && <p className="text-slate-500 mb-2">Some references or paper identities are unavailable. Coverage is incomplete.</p>}
        {!activeRuns.length && !busy && !failed && !partial && <p className="text-slate-500">Not indexed yet.</p>}
        {lastIndexed && <p className="text-xs text-slate-500 mb-2">Last indexed: {new Date(lastIndexed).toLocaleString()}</p>}
        {!data.items.length && <p className="text-slate-500 mb-2">No indexed citations found.</p>}
        <ul className="space-y-3">
          {data.items.map(item => <li key={item.id}>
            <Link to={`/library/paper/${encodeURIComponent(item.id)}`} className="text-blue-700 hover:underline">{item.title}</Link>
            <p className="text-xs text-slate-500">{item.authors.slice(0, 2).join(', ')}{item.year ? ` · ${item.year}` : ''}</p>
            <details className="text-xs text-slate-500 mt-1">
              <summary className="cursor-pointer">Citation evidence</summary>
              {item.evidence.map((evidence, index) => <div key={index} className="mt-1">
                <p>{{ openalex: 'OpenAlex', crossref: 'Crossref', grobid: 'PDF bibliography (GROBID)', pymupdf: 'PDF bibliography (local)' }[evidence.provider] || evidence.provider} · identifier match · {new Date(evidence.indexedAt).toLocaleDateString()}</p>
                {evidence.provider === 'openalex' && /^W\d+$/.test(evidence.reference.source_work) &&
                  <a className="underline" href={`https://openalex.org/${evidence.reference.source_work}`} target="_blank" rel="noreferrer">Source record</a>}
                {evidence.reference.unstructured && <p className="mt-1">{evidence.reference.unstructured}</p>}
                {evidence.reference.DOI && <p className="mt-1">DOI: {evidence.reference.DOI}</p>}
                {evidence.reference.target_work && <p className="mt-1">Referenced work: {evidence.reference.target_work}</p>}
                {['grobid', 'pymupdf'].includes(evidence.provider) && evidence.reference.title && <p className="mt-1">{evidence.reference.title}</p>}
                {['grobid', 'pymupdf'].includes(evidence.provider) && evidence.reference.pdf_sha256 && <p className="mt-1 break-all" title={evidence.reference.pdf_sha256}>PDF fingerprint: {evidence.reference.pdf_sha256.slice(0, 12)}…</p>}
              </div>)}
            </details>
          </li>)}
        </ul>
        {data.total > 10 && <div className="flex items-center gap-3 mt-3">
          <button disabled={offset === 0 || loading} onClick={() => { setData(null); setOffset(n => Math.max(0, n - 10)) }}>Previous</button>
          <span className="text-xs">{offset + 1}–{Math.min(offset + 10, data.total)} of {data.total}</span>
          <button disabled={offset + 10 >= data.total || loading} onClick={() => { setData(null); setOffset(n => n + 10) }}>Next</button>
        </div>}
        <p className="text-xs text-slate-500 mt-3">{data.indexedPapers} of {data.libraryPapers} library papers have indexed reference data.</p>
        {data.unresolvedCount > 0 && <p className="text-xs text-slate-500">{data.unresolvedCount} reference records not matched to a unique local citation.</p>}
      </>}
      <button type="button" disabled={busy} onClick={() => reindex()} className="mt-3 text-xs text-blue-700 disabled:text-slate-400">
        {busy ? 'Indexing…' : 'Index this paper'}
      </button>
      {hasStoredPdf && <div className="mt-3">
        <button type="button" disabled={busy} onClick={() => reindex(true)} className="text-xs text-blue-700 disabled:text-slate-400">Index PDF bibliography</button>
        <p className="text-xs text-slate-500 mt-1">Reads numbered bibliographies locally. Matches explicit DOI/arXiv identifiers; no GROBID setup needed.</p>
      </div>}
    </section>
  )
}
