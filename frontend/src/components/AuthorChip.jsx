import { Link } from 'react-router-dom'

export default function AuthorChip({ author, className = '' }) {
  return <Link to={`/authors/${encodeURIComponent(author.authorId)}`}
    className={`inline-flex min-w-0 max-w-full items-center rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${className}`}>
    <span className="break-words font-medium">{author.name}</span>
  </Link>
}
