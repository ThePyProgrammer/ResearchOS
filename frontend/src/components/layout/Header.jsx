import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export default function Header() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
      {/* Search */}
      <div className="flex-1 max-w-xl relative">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
        <input
          type="text"
          placeholder="Search library lexically or semantically…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-16 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Notification */}
        <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <Icon name="notifications" className="text-[20px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Quick Add */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Icon name="add" className="text-[18px]" />
            Quick Add
            <Icon name="expand_more" className="text-[16px]" />
          </button>
          <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            {[
              { icon: 'tag', label: 'Add by DOI' },
              { icon: 'science', label: 'Add by arXiv ID' },
              { icon: 'link', label: 'Add by URL' },
              { icon: 'upload_file', label: 'Upload PDF' },
              { icon: 'import_export', label: 'Import BibTeX/RIS' },
            ].map(item => (
              <button
                key={item.label}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl transition-colors"
              >
                <Icon name={item.icon} className="text-[16px] text-slate-400" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
