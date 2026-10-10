import { Link } from 'react-router-dom'

export default function AuthorLabLinks({ labs = [], emptyText = '—' }) {
  if (!labs.length) return <span className="text-xs text-slate-400">{emptyText}</span>
  return <ul className="flex flex-wrap gap-1.5">
    {labs.map(lab => <li key={lab.id} className="min-w-0 max-w-full">
      <Link to={`/labs/${encodeURIComponent(lab.id)}`} onClick={event => event.stopPropagation()}
        className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
        <span className="break-words font-medium">{lab.name}</span>
        <span className="text-[10px] text-slate-500">{lab.isPi ? 'PI' : lab.isMember ? 'Member' : ''}</span>
      </Link>
    </li>)}
  </ul>
}
