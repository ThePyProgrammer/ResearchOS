import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { activityApi, runsApi, papersApi, collectionsApi, githubReposApi, websitesApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function formatTime(raw) {
  if (!raw) return ''
  // Truncate microseconds so all JS engines handle ISO 8601 correctly
  const normalized = raw.replace(/(\.\d{3})\d+/, '$1')
  const date = new Date(normalized)
  if (isNaN(date.getTime())) return raw  // unparseable legacy string — show as-is

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay} days ago`

  // Older than a week — just the date, no time (avoids UTC vs local clock issues)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function StatCard({ icon, label, value, sub, pulse }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Icon name={icon} className="text-blue-500 text-[22px]" />
        </div>
        {pulse && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function ActivityItem({ item }) {
  return (
    <div className="flex gap-3 py-4 border-b border-slate-100 last:border-0">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
        <Icon name={item.icon} className={`text-[16px] ${item.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">{item.title}</p>
          <span className="text-xs text-slate-400 flex-shrink-0">{formatTime(item.time)}</span>
        </div>
        {item.detail && <p className="text-sm text-slate-500 mt-0.5">{item.detail}</p>}
        {item.badges && (
          <div className="flex gap-1.5 mt-1.5">
            {item.badges.map(b => (
              <span key={b} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{b}</span>
            ))}
          </div>
        )}
        {item.running && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{item.currentStep}</span>
              <span>{item.progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
        )}
        {item.action && (
          <Link
            to={item.action.href}
            className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            {item.action.label}
            <Icon name="arrow_forward" className="text-[14px]" />
          </Link>
        )}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 px-5 py-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { activeLibrary } = useLibrary()
  const [tab, setTab] = useState('all')
  const [activityPage, setActivityPage] = useState(1)
  const [chartMode, setChartMode] = useState('cumulative')
  const [chartItemType, setChartItemType] = useState('all')
  const [chartSplit, setChartSplit] = useState('combined')
  const [chartTypeOpen, setChartTypeOpen] = useState(false)
  const chartTypeRef = useRef(null)
  const [activity, setActivity] = useState([])
  const [runs, setRuns] = useState([])
  const [papers, setPapers] = useState([])
  const [githubRepos, setGithubRepos] = useState([])
  const [websites, setWebsites] = useState([])
  const [collectionCount, setCollectionCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const lib = activeLibrary?.id ? { library_id: activeLibrary.id } : {}
    Promise.all([
      activityApi.list(lib),
      runsApi.list(lib),
      papersApi.list(lib),
      collectionsApi.list(lib),
      githubReposApi.list(lib),
      websitesApi.list(lib),
    ])
      .then(([activityData, runsData, papersData, collectionsData, reposData, websitesData]) => {
        setActivity(activityData)
        setRuns(runsData)
        setPapers(papersData)
        setCollectionCount(collectionsData.length)
        setGithubRepos(reposData)
        setWebsites(websitesData)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeLibrary?.id])

  // Close type dropdown when clicking outside
  useEffect(() => {
    if (!chartTypeOpen) return
    function handleClick(e) {
      if (chartTypeRef.current && !chartTypeRef.current.contains(e.target)) {
        setChartTypeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [chartTypeOpen])

  // Filter locally — data is already scoped to the active library
  const filtered = tab === 'all' ? activity : activity.filter(a => a.type === tab)
  const runningCount = runs.filter(r => r.status === 'running').length

  const ACTIVITY_PAGE_SIZE = 5
  const totalActivityPages = Math.ceil(filtered.length / ACTIVITY_PAGE_SIZE)
  const paginatedActivity = filtered.slice(
    (activityPage - 1) * ACTIVITY_PAGE_SIZE,
    activityPage * ACTIVITY_PAGE_SIZE,
  )

  // Build "items added over time" chart data grouped by day across all item types
  const chartData = useMemo(() => {
    const allItems = [
      ...papers.map(p => ({ createdAt: p.createdAt, _type: 'papers' })),
      ...githubRepos.map(r => ({ createdAt: r.createdAt, _type: 'repos' })),
      ...websites.map(w => ({ createdAt: w.createdAt, _type: 'websites' })),
    ]
    if (!allItems.length) return []
    const counts = {}
    for (const item of allItems) {
      const normalized = (item.createdAt || '').replace(/(\.\d{3})\d+/, '$1')
      const d = new Date(normalized)
      if (isNaN(d)) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!counts[key]) counts[key] = { papers: 0, repos: 0, websites: 0 }
      counts[key][item._type]++
    }
    const sorted = Object.keys(counts).sort()
    let cPapers = 0, cRepos = 0, cWebsites = 0
    return sorted.map(key => {
      const { papers: p = 0, repos: r = 0, websites: w = 0 } = counts[key]
      cPapers += p; cRepos += r; cWebsites += w
      const [year, month, day] = key.split('-')
      const label = new Date(Number(year), Number(month) - 1, Number(day))
        .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return {
        label,
        papers: p, repos: r, websites: w, added: p + r + w,
        papersTotal: cPapers, reposTotal: cRepos, websitesTotal: cWebsites,
        total: cPapers + cRepos + cWebsites,
      }
    })
  }, [papers, githubRepos, websites])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{activeLibrary?.name ?? 'Dashboard'}</h1>
        <p className="text-slate-500 mt-1">Your research activity at a glance.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard
          icon="collections_bookmark"
          label="Total Items"
          value={loading ? '—' : (papers.length + githubRepos.length + websites.length).toLocaleString()}
          sub={collectionCount === null ? null : `Across ${collectionCount} collection${collectionCount === 1 ? '' : 's'}`}
        />
        <StatCard
          icon="smart_toy"
          label="Active Workflows"
          value={runningCount}
          pulse={runningCount > 0}
          sub={runningCount > 0 ? `${runningCount} running now` : 'None running'}
        />
      </div>

      {/* Items over time */}
      {chartData.length > 0 && (() => {
        const typeOptions = [
          { key: 'all',      label: 'Items' },
          { key: 'papers',   label: 'Papers' },
          { key: 'websites', label: 'Websites' },
          { key: 'repos',    label: 'Repos' },
        ]
        const typeConfig = {
          all:      { label: 'Items',        dataKey: chartMode === 'cumulative' ? 'total'         : 'added',    stroke: '#f97316', gradientId: 'chartGradient' },
          papers:   { label: 'Papers',       dataKey: chartMode === 'cumulative' ? 'papersTotal'   : 'papers',   stroke: '#3b82f6', gradientId: 'chartGradient' },
          repos:    { label: 'Repos',        dataKey: chartMode === 'cumulative' ? 'reposTotal'    : 'repos',    stroke: '#8b5cf6', gradientId: 'chartGradient' },
          websites: { label: 'Websites',     dataKey: chartMode === 'cumulative' ? 'websitesTotal' : 'websites', stroke: '#10b981', gradientId: 'chartGradient' },
        }
        const cfg = typeConfig[chartItemType]
        const totalCount = {
          all:      papers.length + githubRepos.length + websites.length,
          papers:   papers.length,
          repos:    githubRepos.length,
          websites: websites.length,
        }[chartItemType]
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-1.5">
                  {/* Clickable type word opens dropdown */}
                  <span ref={chartTypeRef} className="relative">
                    <button
                      onClick={() => setChartTypeOpen(o => !o)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
                    >
                      {cfg.label}
                      <Icon name="unfold_more" className="text-[14px] text-slate-500" />
                    </button>
                    {chartTypeOpen && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                        {typeOptions.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => { setChartItemType(opt.key); setChartTypeOpen(false) }}
                            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                              chartItemType === opt.key
                                ? 'text-blue-600 font-medium bg-blue-50'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                  <span className="text-slate-800"> Added Over Time</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {chartMode === 'cumulative' ? 'Cumulative library growth' : 'Daily additions'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{totalCount.toLocaleString()} total</span>
                {chartItemType === 'all' && (
                  <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
                    <button
                      onClick={() => setChartSplit('combined')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        chartSplit === 'combined' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Combined
                    </button>
                    <button
                      onClick={() => setChartSplit('separate')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        chartSplit === 'separate' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Separate
                    </button>
                  </div>
                )}
                <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => setChartMode('cumulative')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      chartMode === 'cumulative' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Cumulative
                  </button>
                  <button
                    onClick={() => setChartMode('daily')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      chartMode === 'daily' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Daily
                  </button>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cfg.stroke} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={cfg.stroke} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="chartGradientPapers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="chartGradientRepos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="chartGradientWebsites" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  formatter={(value, name) => {
                    const nameMap = {
                      papersTotal: 'Papers', reposTotal: 'Repos', websitesTotal: 'Websites',
                      papers: 'Papers', repos: 'Repos', websites: 'Websites',
                    }
                    const label = nameMap[name] ?? (chartMode === 'cumulative' ? `Total ${cfg.label}` : `${cfg.label} Added`)
                    return [value, label]
                  }}
                  labelStyle={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}
                />
                {chartItemType === 'all' && chartSplit === 'separate' ? (
                  <>
                    <Area type="monotone" dataKey={chartMode === 'cumulative' ? 'papersTotal'   : 'papers'}   stroke="#3b82f6" strokeWidth={2} fill="url(#chartGradientPapers)"   dot={false} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey={chartMode === 'cumulative' ? 'reposTotal'    : 'repos'}    stroke="#8b5cf6" strokeWidth={2} fill="url(#chartGradientRepos)"    dot={false} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey={chartMode === 'cumulative' ? 'websitesTotal' : 'websites'} stroke="#10b981" strokeWidth={2} fill="url(#chartGradientWebsites)" dot={false} activeDot={{ r: 4 }} />
                  </>
                ) : (
                  <Area
                    type="monotone"
                    dataKey={cfg.dataKey}
                    stroke={cfg.stroke}
                    strokeWidth={2}
                    fill="url(#chartGradient)"
                    dot={{ r: 3, fill: cfg.stroke, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* Triage + Budget grid */}
      {!loading && (papers.length > 0 || githubRepos.length > 0 || websites.length > 0 || runs.some(r => r.cost)) && (() => {
        const allItems = [...papers, ...githubRepos, ...websites]
        const inbox  = allItems.filter(i => i.status === 'inbox').length
        const toRead = allItems.filter(i => i.status === 'to-read').length
        const read   = allItems.filter(i => i.status === 'read').length
        const total  = allItems.length
        const pct    = n => total ? Math.round((n / total) * 100) : 0
        const hasTriage = total > 0
        const hasBudget = runs.some(r => r.cost)
        return (
          <div className={`mb-8 ${hasTriage && hasBudget ? 'grid grid-cols-2 gap-4 items-start' : ''}`}>

            {hasTriage && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-base font-semibold text-slate-800 mb-4">Triage Health</h2>
                <div className="space-y-4">
                  {[
                    { label: 'Inbox',   value: inbox,  pct: pct(inbox),  color: 'text-blue-600',    dot: 'bg-blue-400',    bar: 'bg-blue-400',    status: 'inbox'   },
                    { label: 'To Read', value: toRead, pct: pct(toRead), color: 'text-amber-600',   dot: 'bg-amber-400',   bar: 'bg-amber-400',   status: 'to-read' },
                    { label: 'Read',    value: read,   pct: pct(read),   color: 'text-emerald-600', dot: 'bg-emerald-400', bar: 'bg-emerald-400', status: 'read'    },
                  ].map(({ label, value, pct: p, color, dot, bar, status }) => (
                    <button
                      key={label}
                      onClick={() => navigate(`/library?status=${status}`)}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
                          <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${color}`}>{value.toLocaleString()}</span>
                          <span className="text-xs text-slate-400 w-7 text-right">{p}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${p}%` }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasBudget && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-base font-semibold text-slate-800 mb-4">Budget & API Usage</h2>
                <div className="space-y-6">
                  {runs.filter(r => r.cost).map(run => (
                    <div key={run.id}>
                      {runs.filter(r => r.cost).length > 1 && (
                        <p className="text-xs font-medium text-slate-500 mb-3">{run.workflowName}</p>
                      )}
                      <div className="space-y-3">
                        {Object.entries(run.cost).filter(([k]) => k !== 'total').map(([key, item]) => (
                          <div key={key}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-600">{item.label}</span>
                              <span className="font-semibold text-slate-800">{item.amount}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${item.pct || 0}%` }} />
                            </div>
                            {item.tokens && <p className="text-[10px] text-slate-400 mt-0.5">{item.tokens}</p>}
                            {item.calls && <p className="text-[10px] text-slate-400 mt-0.5">{item.calls}{item.limit ? ` · ${item.limit}` : ''}</p>}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-600">Total Run Cost</span>
                        <span className="text-sm font-bold text-emerald-600">{run.cost.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )
      })()}

      {/* Activity Feed */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Recent Activity</h2>
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-sm">
            {[
              { key: 'all', label: 'All' },
              { key: 'agent', label: 'Agents' },
              { key: 'human', label: 'Human' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setActivityPage(1) }}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-red-600 bg-red-50 border-b border-red-100">
            Failed to load activity: {error}
          </div>
        )}

        <div className="px-5 divide-y divide-slate-100">
          {loading ? (
            <LoadingSkeleton />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No activity to show.</p>
          ) : (
            paginatedActivity.map(item => <ActivityItem key={item.id} item={item} />)
          )}
        </div>

        {!loading && totalActivityPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400 leading-none self-center">
              {(activityPage - 1) * ACTIVITY_PAGE_SIZE + 1}–{Math.min(activityPage * ACTIVITY_PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActivityPage(1)}
                disabled={activityPage === 1}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Icon name="first_page" className="text-[18px] leading-none" />
              </button>
              <button
                onClick={() => setActivityPage(p => p - 1)}
                disabled={activityPage === 1}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Icon name="chevron_left" className="text-[18px] leading-none" />
              </button>
              <span className="text-xs text-slate-500 px-1 leading-none self-center">{activityPage} / {totalActivityPages}</span>
              <button
                onClick={() => setActivityPage(p => p + 1)}
                disabled={activityPage === totalActivityPages}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Icon name="chevron_right" className="text-[18px] leading-none" />
              </button>
              <button
                onClick={() => setActivityPage(totalActivityPages)}
                disabled={activityPage === totalActivityPages}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Icon name="last_page" className="text-[18px] leading-none" />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
