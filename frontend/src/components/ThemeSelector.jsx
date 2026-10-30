import { useTheme } from '../context/ThemeContext'

export default function ThemeSelector({ collapsed = false, sidebar = false }) {
  const { mode, setMode } = useTheme()
  return (
    <label className={`relative flex items-center gap-2 text-xs rounded-md focus-within:ring-2 focus-within:ring-violet-400 ${sidebar ? 'text-slate-300 px-2 py-2' : 'text-slate-700'} ${collapsed ? 'justify-center' : ''}`}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
        {mode === 'system' ? 'contrast' : mode === 'dark' ? 'dark_mode' : 'light_mode'}
      </span>
      {!collapsed && <span>Theme</span>}
      <select
        aria-label="Color theme"
        title="Color theme"
        value={mode}
        onChange={event => setMode(event.target.value)}
        className={`${collapsed ? 'absolute inset-0 opacity-0 cursor-pointer' : 'ml-auto rounded-md border px-2 py-1.5 max-w-[130px]'} ${sidebar ? 'bg-sidebar border-white/10 text-slate-200' : 'bg-white border-slate-300'}`}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  )
}
