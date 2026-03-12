import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { activityApi, runsApi, papersApi, collectionsApi } from '../services/api'
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
  const [chartMode, setChartMode] = useState('cumulative')
  const [activity, setActivity] = useState([])
  const [runs, setRuns] = useState([])
  const [papers, setPapers] = useState([])
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
    ])
      .then(([activityData, runsData, papersData, collectionsData]) => {
        setActivity(activityData)
        setRuns(runsData)
        setPapers(papersData)
        setCollectionCount(collectionsData.length)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeLibrary?.id])

  // Filter locally — data is already scoped to the active library
  const filtered = tab === 'all' ? activity : activity.filter(a => a.type === tab)
  const runningCount = runs.filter(r => r.status === 'running').length

  // Build cumulative "papers added over time" chart data grouped by day
  const chartData = useMemo(() => {
    if (!papers.length) return []
    const counts = {}
    for (const p of papers) {
      const normalized = (p.createdAt || '').replace(/(\.\d{3})\d+/, '$1')
      const d = new Date(normalized)
      if (isNaN(d)) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      counts[key] = (counts[key] || 0) + 1
    }
    const sorted = Object.keys(counts).sort()
    let cumulative = 0
    return sorted.map(key => {
      cumulative += counts[key]
      const [year, month, day] = key.split('-')
      const label = new Date(Number(year), Number(month) - 1, Number(day))
        .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return { label, added: counts[key], total: cumulative }
    })
  }, [papers])

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
          label="Total Papers"
          value={loading ? '—' : papers.length.toLocaleString()}
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

      {/* Status Breakdown */}
      {!loading && papers.length > 0 && (() => {
        const inbox   = papers.filter(p => p.status === 'inbox').length
        const toRead  = papers.filter(p => p.status === 'to-read').length
        const read    = papers.filter(p => p.status === 'read').length
        const total   = papers.length
        const pct     = n => total ? Math.round((n / total) * 100) : 0
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Triage Health</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Inbox',   value: inbox,  pct: pct(inbox),  color: 'text-blue-600',    bg: 'bg-blue-50',    bar: 'bg-blue-400',   status: 'inbox'   },
                { label: 'To Read', value: toRead, pct: pct(toRead), color: 'text-amber-600',   bg: 'bg-amber-50',   bar: 'bg-amber-400',  status: 'to-read' },
                { label: 'Read',    value: read,   pct: pct(read),   color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-400', status: 'read'    },
              ].map(({ label, value, pct: p, color, bg, status }) => (
                <button
                  key={label}
                  onClick={() => navigate(`/library?status=${status}`)}
                  className={`${bg} rounded-lg p-3 text-center transition-opacity hover:opacity-80 cursor-pointer`}
                >
                  <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  <p className="text-xs text-slate-400">{p}%</p>
                </button>
              ))}
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
              {[
                { pct: pct(inbox),  bar: 'bg-blue-400'    },
                { pct: pct(toRead), bar: 'bg-amber-400'   },
                { pct: pct(read),   bar: 'bg-emerald-400' },
              ].filter(s => s.pct > 0).map(({ pct: p, bar }, i) => (
                <div key={i} className={`${bar} rounded-full`} style={{ width: `${p}%` }} />
              ))}
            </div>
          </div>
        )
      })()}

      {/* Papers over time */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Papers Added Over Time</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {chartMode === 'cumulative' ? 'Cumulative library growth' : 'Daily additions'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{papers.length} total</span>
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
            {chartMode === 'cumulative' ? (
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="paperGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  formatter={(value, name) => [value, name === 'total' ? 'Total' : 'Added']}
                  labelStyle={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}
                />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} fill="url(#paperGradient)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </AreaChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  formatter={(value) => [value, 'Added']}
                  labelStyle={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}
                />
                <Area type="monotone" dataKey="added" stroke="#8b5cf6" strokeWidth={2} fill="url(#dailyGradient)" dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

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
                onClick={() => setTab(key)}
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
            filtered.map(item => <ActivityItem key={item.id} item={item} />)
          )}
        </div>
      </div>

      {/* Budget & API Usage */}
      {!loading && runs.some(r => r.cost) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mt-8">
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
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
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
}
