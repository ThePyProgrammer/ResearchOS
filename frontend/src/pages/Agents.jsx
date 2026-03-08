import { useState, useEffect } from 'react'
import { workflowsApi, runsApi } from '../services/api'
import WindowModal from '../components/WindowModal'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

const statusConfig = {
  stable: { label: 'Stable', class: 'bg-emerald-100 text-emerald-700' },
  beta: { label: 'Beta', class: 'bg-amber-100 text-amber-700' },
  experimental: { label: 'Experimental', class: 'bg-red-100 text-red-700' },
}

function ConfigModal({ workflow, onClose }) {
  return (
    <WindowModal
      open={Boolean(workflow)}
      onClose={onClose}
      title={`Configure: ${workflow.name}`}
      iconName="tune"
      iconWrapClassName="bg-indigo-100"
      iconClassName="text-[16px] text-indigo-600"
      normalPanelClassName="w-full max-w-md rounded-2xl"
    >
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Collection</label>
          <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400">
            <option>ML / Transformers</option>
            <option>Multi-Agent Systems</option>
            <option>RAG Optimization</option>
            <option>New Collection...</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Research Focus</label>
          <textarea
            placeholder="e.g. Multi-agent coordination patterns for LLM-based systems (2023+)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Year filter (min)</label>
          <input
            type="number"
            defaultValue={2023}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <strong>Required tools:</strong> {workflow.tools.join(', ')}. Estimated cost: ~$0.05-0.20 based on scope.
        </div>
      </div>
      <div className="flex gap-3 px-6 pb-5">
        <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          Run Workflow
        </button>
      </div>
    </WindowModal>
  )
}
function WorkflowCard({ workflow, onConfigure }) {
  const status = statusConfig[workflow.status]

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${workflow.iconBg} flex items-center justify-center`}>
          <Icon name={workflow.icon} className={`text-[22px] ${workflow.iconColor}`} />
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.class}`}>
          {status.label}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-slate-900 mb-1">{workflow.name}</h3>
      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-4">{workflow.description}</p>

      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {workflow.steps.map((step, i) => (
          <span key={step} className="flex items-center gap-1">
            <span className="text-[11px] text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
              {step}
            </span>
            {i < workflow.steps.length - 1 && (
              <Icon name="arrow_forward" className="text-slate-300 text-[12px]" />
            )}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {workflow.tools.map((tool, i) => (
          <span key={tool} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${workflow.toolColors[i] || 'bg-slate-100 text-slate-600'}`}>
            {tool}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <Icon name="schedule" className="text-[14px]" />
          {workflow.estimatedTime}
        </span>
        {workflow.canRunDirectly ? (
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Icon name="play_arrow" className="text-[16px]" />
            Run
          </button>
        ) : (
          <button
            onClick={() => onConfigure(workflow)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Icon name="tune" className="text-[16px]" />
            Configure
          </button>
        )}
      </div>
    </div>
  )
}

function ActiveRunCard({ run }) {
  if (run.status === 'completed') {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 opacity-75">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700 leading-tight">{run.workflowName}</p>
          <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">Done</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Completed {run.startedAt}{run.duration ? ` · ${run.duration}` : ''}
        </p>
        <button className="w-full py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-white transition-colors">
          View Artifacts
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white border-2 border-blue-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-slate-800 leading-tight">{run.workflowName}</p>
        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          Running
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Started {run.startedAt} by {run.startedBy}
      </p>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{run.currentStep}</span>
          <span>{run.progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${run.progress}%` }}
          />
        </div>
      </div>

      {run.logs && (
        <div className="bg-slate-900 rounded-lg p-3 h-36 overflow-y-auto log-viewer">
          {run.logs.map((log, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-slate-500 flex-shrink-0">[{log.time}]</span>
              <span className={`flex-shrink-0 ${
                log.level === 'TOOL' ? 'text-amber-400' :
                log.level === 'AGENT' ? 'text-purple-400' :
                'text-emerald-400'
              }`}>{log.level}:</span>
              <span className="text-slate-300 break-all">{log.message}</span>
            </div>
          ))}
        </div>
      )}
      <button className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
        View Full Logs
        <Icon name="arrow_forward" className="text-[12px]" />
      </button>
    </div>
  )
}

export default function Agents() {
  const [configWorkflow, setConfigWorkflow] = useState(null)
  const [search, setSearch] = useState('')
  const [workflows, setWorkflows] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([workflowsApi.list(), runsApi.list()])
      .then(([wf, r]) => {
        setWorkflows(wf)
        setRuns(r)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = workflows.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.description.toLowerCase().includes(search.toLowerCase())
  )

  // Show only non-completed runs in the side panel (running + last completed)
  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'completed')
    .slice(0, 3)
  const runningCount = runs.filter(r => r.status === 'running').length

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Agent Workflow Catalog</h1>
            <p className="text-slate-500 mt-1">Select and run AI-powered research workflows.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
              <input
                type="text"
                placeholder="Search workflows…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              <Icon name="filter_list" className="text-[16px]" />
              Filter
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
            Failed to load workflows: {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-white rounded-xl border border-slate-200 p-5 h-52" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(wf => (
              <WorkflowCard key={wf.id} workflow={wf} onConfigure={setConfigWorkflow} />
            ))}
          </div>
        )}
      </div>

      {/* Active Runs Panel */}
      <div className="w-72 flex-shrink-0 border-l border-slate-200 bg-white p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">Active Runs</h2>
          {runningCount > 0 && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
              {runningCount} Running
            </span>
          )}
        </div>
        <div className="space-y-3">
          {activeRuns.map(run => (
            <ActiveRunCard key={run.id} run={run} />
          ))}
          {!loading && activeRuns.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No recent runs.</p>
          )}
        </div>
      </div>

      {configWorkflow && (
        <ConfigModal workflow={configWorkflow} onClose={() => setConfigWorkflow(null)} />
      )}
    </div>
  )
}


