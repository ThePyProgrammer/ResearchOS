import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { proposalsApi } from '../../services/api'
import { user } from '../../data/mockData'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function SidebarLink({ to, icon, label, badge, active, collapsed }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center rounded-lg text-sm font-medium transition-colors ${
          collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-2'
        } ${
          (active !== undefined ? active : isActive)
            ? 'bg-white/10 text-white'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        }`
      }
    >
      <Icon name={icon} className="text-[18px] flex-shrink-0" />
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && badge && (
        <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {badge}
        </span>
      )}
      {collapsed && badge && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
      )}
    </NavLink>
  )
}


export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isMyLibrary = location.pathname === '/library'
  const [pendingCount, setPendingCount] = useState(null)

  useEffect(() => {
    proposalsApi.list().then(data => setPendingCount(data.filter(p => p.status === 'pending').length)).catch(() => {})
  }, [])

  return (
    <aside
      className={`flex-shrink-0 bg-slate-800 flex flex-col h-screen sticky top-0 dark-scroll overflow-y-auto transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Logo + toggle */}
      <div className={`flex items-center border-b border-white/10 ${collapsed ? 'flex-col gap-2 px-0 py-3' : 'px-4 py-4 justify-between'}`}>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          title="ResearchOS"
        >
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon name="hub" className="text-white text-[18px]" />
          </div>
          {!collapsed && (
            <span className="text-white font-semibold text-base tracking-tight">ResearchOS</span>
          )}
        </button>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
        >
          <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} className="text-[18px]" />
        </button>
      </div>

      <nav className={`flex-1 p-2 space-y-5 ${collapsed ? 'pt-3' : 'p-3'}`}>
        {/* Library section */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Library
            </p>
          )}
          <div className="space-y-0.5">
            <SidebarLink to="/dashboard" icon="dashboard" label="Dashboard" collapsed={collapsed} />
            <SidebarLink to="/library" icon="collections_bookmark" label="My Library" active={isMyLibrary} collapsed={collapsed} />
          </div>
        </div>

        {/* Agent Workflows section */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Agent Workflows
            </p>
          )}
          <div className="space-y-0.5">
            <SidebarLink to="/agents" icon="smart_toy" label="Workflow Catalog" collapsed={collapsed} />
            <SidebarLink to="/proposals" icon="rate_review" label="Agent Proposals" badge={pendingCount} collapsed={collapsed} />
            <div className={`flex items-center rounded-lg text-sm text-slate-400 ${collapsed ? 'justify-center py-2' : 'gap-2.5 px-3 py-2'}`}>
              <Icon name="sensors" className="text-[18px] text-emerald-400 flex-shrink-0" />
              {!collapsed && <span className="flex-1">Daily arXiv Scanner</span>}
              {!collapsed && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tags section — hidden when collapsed */}
        {!collapsed && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5 px-3">
              {['#survey', '#important', '#methods', '#dataset', '#rlhf', '#transformers'].map(tag => (
                <button
                  key={tag}
                  className="text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/5 px-2 py-0.5 rounded-full transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* User profile */}
      <div className="p-2 border-t border-white/10">
        {collapsed ? (
          <button
            title={`${user.name} — ${user.org}`}
            className="w-full flex justify-center py-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-bold">
              {user.initials}
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              {user.initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.org}</p>
            </div>
            <Icon name="settings" className="text-slate-500 text-[16px] ml-auto flex-shrink-0" />
          </div>
        )}
      </div>
    </aside>
  )
}
