import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { proposalsApi, runsApi } from '../services/api'

const PROPOSAL_RUN_ID = 'wrk_7a9b2c'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function ProposalItem({ proposal, onToggle, onApprove, onReject, onUndo }) {
  const { paper, status, checked } = proposal
  const isPending = status === 'pending'
  const isRejected = status === 'rejected'

  return (
    <div className={`border border-slate-200 rounded-xl p-4 transition-all ${isRejected ? 'opacity-60 bg-slate-50' : 'bg-white'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300 text-blue-600 disabled:opacity-40"
          checked={checked}
          onChange={() => onToggle(proposal.id)}
          disabled={isRejected}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold leading-snug ${isRejected ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                {paper.title}
              </span>
              {isRejected && (
                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                  Rejected
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ', et al.' : ''} · {paper.venue} {paper.year}
          </p>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon name="smart_toy" className="text-blue-500 text-[14px]" />
              <span className="text-[11px] font-semibold text-blue-700">
                Relevance Score: {paper.relevanceScore}/100
              </span>
            </div>
            <p className="text-xs text-blue-700 leading-relaxed">{paper.agentReasoning}</p>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {paper.doi && (
              <span className="text-[10px] text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                DOI
              </span>
            )}
            {paper.arxivId && (
              <span className="text-[10px] text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                arXiv: {paper.arxivId}
              </span>
            )}
            <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full">
              Open Access PDF available
            </span>
            <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full bg-slate-100">
              Proposed tags: {paper.tags.slice(0, 2).join(', ')}
            </span>
          </div>

          {isPending ? (
            <div className="flex gap-2">
              <button
                onClick={() => onReject(proposal.id)}
                className="flex items-center gap-1 px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
              >
                <Icon name="close" className="text-[14px]" />
                Reject
              </button>
              <button
                onClick={() => onApprove(proposal.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Icon name="check" className="text-[14px]" />
                Approve
              </button>
            </div>
          ) : isRejected ? (
            <button
              onClick={() => onUndo(proposal.id)}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Icon name="undo" className="text-[14px]" />
              Undo
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
              <Icon name="check_circle" className="text-[16px]" />
              Approved — will be added to library
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RunDetails({ details }) {
  if (!details) return null
  const traceIcons = { done: 'check_circle', pending: 'radio_button_unchecked', running: 'autorenew' }
  const traceColors = { done: 'text-emerald-500', pending: 'text-blue-500', running: 'text-amber-500' }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Run Details</h3>
        <div className="space-y-2">
          {details.prompt && (
            <div>
              <p className="text-[11px] text-slate-400 font-medium mb-0.5">Prompt trigger</p>
              <p className="text-xs text-slate-700 leading-relaxed italic">"{details.prompt}"</p>
            </div>
          )}
          {details.targetCollection && (
            <div>
              <p className="text-[11px] text-slate-400 font-medium mb-0.5">Target collection</p>
              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                <Icon name="folder" className="text-[14px] text-slate-400" />
                {details.targetCollection}
              </div>
            </div>
          )}
          {details.constraints && (
            <div>
              <p className="text-[11px] text-slate-400 font-medium mb-1">Constraints applied</p>
              <ul className="space-y-0.5">
                {details.constraints.map(c => (
                  <li key={c} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Icon name="check" className="text-[12px] text-emerald-500" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Link to="/agents" className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
          Back to Workflow Catalog
          <Icon name="arrow_forward" className="text-[12px]" />
        </Link>
      </div>

      {details.cost && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Budget & API Usage</h3>
          <div className="space-y-3">
            {Object.entries(details.cost).filter(([k]) => k !== 'total').map(([key, item]) => (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="font-semibold text-slate-800">{item.amount}</span>
                </div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${item.pct || 0}%` }}
                  />
                </div>
                {item.tokens && <p className="text-[10px] text-slate-400 mt-0.5">{item.tokens}</p>}
                {item.calls && <p className="text-[10px] text-slate-400 mt-0.5">{item.calls}{item.limit ? ` · ${item.limit}` : ''}</p>}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-600">Total Run Cost</span>
            <span className="text-sm font-bold text-emerald-600">{details.cost.total}</span>
          </div>
        </div>
      )}

      {details.trace && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Run Trace</h3>
          <div className="space-y-3">
            {details.trace.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <Icon
                    name={traceIcons[step.status]}
                    className={`text-[18px] ${traceColors[step.status]}`}
                  />
                  {i < details.trace.length - 1 && (
                    <div className="w-px flex-1 bg-slate-200 mt-1 mb-0" style={{ minHeight: '16px' }} />
                  )}
                </div>
                <div className="pb-3">
                  <p className="text-xs font-semibold text-slate-700">{step.step}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Proposals() {
  const [proposalList, setProposalList] = useState([])
  const [runDetails, setRunDetails] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      proposalsApi.list({ run_id: PROPOSAL_RUN_ID }),
      runsApi.get(PROPOSAL_RUN_ID),
    ])
      .then(([proposals, run]) => {
        setProposalList(proposals)
        setRunDetails(run)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const pendingCount = proposalList.filter(p => p.status === 'pending').length
  const approvedCount = proposalList.filter(p => p.status === 'approved').length

  const handleToggle = (id) => {
    setProposalList(list => list.map(p => p.id === id ? { ...p, checked: !p.checked } : p))
  }

  const handleApprove = async (id) => {
    try {
      const updated = await proposalsApi.approve(id)
      setProposalList(list => list.map(p => p.id === id ? updated : p))
      showToast('Paper approved and added to library.')
    } catch (err) {
      showToast(`Failed to approve: ${err.message}`, 'error')
    }
  }

  const handleReject = async (id) => {
    try {
      const updated = await proposalsApi.reject(id)
      setProposalList(list => list.map(p => p.id === id ? updated : p))
      showToast('Paper rejected.', 'info')
    } catch (err) {
      showToast(`Failed to reject: ${err.message}`, 'error')
    }
  }

  const handleUndo = async (id) => {
    // Undo re-opens as pending — for now optimistic local update only
    setProposalList(list => list.map(p => p.id === id ? { ...p, status: 'pending', checked: true } : p))
  }

  const handleBatchApprove = async () => {
    const ids = proposalList.filter(p => p.checked && p.status === 'pending').map(p => p.id)
    if (!ids.length) return
    try {
      const results = await proposalsApi.batch(ids, 'approve')
      const resultMap = Object.fromEntries(results.map(r => [r.id, r]))
      setProposalList(list => list.map(p => resultMap[p.id] || p))
      showToast(`Approved ${ids.length} papers.`)
    } catch (err) {
      showToast(`Batch approve failed: ${err.message}`, 'error')
    }
  }

  const handleRejectAll = async () => {
    const ids = proposalList.filter(p => p.status === 'pending').map(p => p.id)
    if (!ids.length) return
    try {
      const results = await proposalsApi.batch(ids, 'reject')
      const resultMap = Object.fromEntries(results.map(r => [r.id, r]))
      setProposalList(list => list.map(p => resultMap[p.id] || p))
      showToast('All pending proposals rejected.', 'info')
    } catch (err) {
      showToast(`Batch reject failed: ${err.message}`, 'error')
    }
  }

  const visible = showAll ? proposalList : proposalList.slice(0, 3)

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          <div className="animate-pulse h-6 bg-slate-200 rounded w-64 mb-2" />
          <div className="animate-pulse h-4 bg-slate-100 rounded w-48" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-white border border-slate-200 rounded-xl p-4 h-40" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Review Proposal: Literature Sweep for "Multi-Agent Systems"
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Run ID: <span className="font-mono">{PROPOSAL_RUN_ID}</span> · Generated 2 hours ago by Agent Researcher
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleRejectAll}
            className="px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          >
            Reject All
          </button>
          <button
            onClick={handleBatchApprove}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Icon name="check" className="text-[16px]" />
            Approve Batch ({pendingCount})
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 px-4 py-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              Failed to load proposals: {error}
            </div>
          )}

          {toast && (
            <div className={`mb-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-md ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white'
                : toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-slate-700 text-white'
            }`}>
              <Icon name={toast.type === 'success' ? 'check_circle' : 'info'} className="text-[18px]" />
              {toast.msg}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Proposed Diff: +{proposalList.length} Papers
              </h2>
              <span className="text-xs text-slate-400">
                {approvedCount} approved · {proposalList.filter(p => p.status === 'rejected').length} rejected · {pendingCount} pending
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-blue-600"
                checked={proposalList.filter(p => p.status === 'pending').every(p => p.checked)}
                onChange={() => {
                  const allChecked = proposalList.filter(p => p.status === 'pending').every(p => p.checked)
                  setProposalList(list => list.map(p =>
                    p.status === 'pending' ? { ...p, checked: !allChecked } : p
                  ))
                }}
              />
              Select All
            </label>
          </div>

          <div className="space-y-3">
            {visible.map(proposal => (
              <ProposalItem
                key={proposal.id}
                proposal={proposal}
                onToggle={handleToggle}
                onApprove={handleApprove}
                onReject={handleReject}
                onUndo={handleUndo}
              />
            ))}
          </div>

          {proposalList.length > 3 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-4 w-full py-3 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors font-medium"
            >
              Show {proposalList.length - 3} more proposals
            </button>
          )}
        </div>

        <div className="w-72 flex-shrink-0 border-l border-slate-200 bg-slate-50 p-4 overflow-y-auto">
          <RunDetails details={runDetails} />
        </div>
      </div>
    </div>
  )
}
