import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authorsApi } from '../services/api'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function AddAuthorModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [orcid, setOrcid] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const author = await authorsApi.create({ name: name.trim(), orcid: orcid.trim() || null })
      onCreate(author)
      onClose()
    } catch (err) {
      alert(`Failed to create author: ${err.message}`)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Author</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ORCID</label>
            <input
              type="text"
              value={orcid}
              onChange={e => setOrcid(e.target.value)}
              placeholder="0000-0000-0000-0000"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Authors() {
  const navigate = useNavigate()
  const [authors, setAuthors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    loadAuthors()
  }, [search])

  async function loadAuthors() {
    try {
      setLoading(true)
      const data = await authorsApi.list({ search: search || undefined })
      setAuthors(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function profileLinks(author) {
    const links = []
    if (author.orcid) links.push({ icon: 'badge', url: `https://orcid.org/${author.orcid}`, title: 'ORCID' })
    if (author.googleScholarUrl) links.push({ icon: 'school', url: author.googleScholarUrl, title: 'Google Scholar' })
    if (author.githubUsername) links.push({ icon: 'code', url: `https://github.com/${author.githubUsername}`, title: 'GitHub' })
    if (author.openreviewUrl) links.push({ icon: 'rate_review', url: author.openreviewUrl, title: 'OpenReview' })
    if (author.websiteUrl) links.push({ icon: 'language', url: author.websiteUrl, title: 'Website' })
    return links
  }

  function currentAffiliation(author) {
    const affs = author.affiliations || []
    if (!affs.length) return null
    const active = affs.filter(a => !a.endDate)
    return (active.length ? active[active.length - 1] : affs[affs.length - 1])?.institution
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Authors</h1>
            <p className="text-sm text-slate-500 mt-1">
              {authors.length} author{authors.length !== 1 ? 's' : ''} in database
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Icon name="person_add" className="text-[18px]" />
            Add Author
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search authors..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : authors.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="groups" className="text-[48px] text-slate-300 mb-3" />
            <p className="text-slate-500">
              {search ? 'No authors match your search' : 'No authors yet. Add one to get started.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Affiliation</th>
                  <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Papers</th>
                  <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {authors.map(author => (
                  <tr
                    key={author.id}
                    onClick={() => navigate(`/authors/${author.id}`)}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0">
                          <Icon name="person" className="text-[16px]" />
                        </div>
                        <span className="text-sm font-medium text-slate-800">{author.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {currentAffiliation(author) || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                        {author.paperCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {profileLinks(author).map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            title={link.title}
                            onClick={e => e.stopPropagation()}
                            className="text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Icon name={link.icon} className="text-[16px]" />
                          </a>
                        ))}
                        {profileLinks(author).length === 0 && <span className="text-slate-300">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddAuthorModal
          onClose={() => setShowAdd(false)}
          onCreate={() => loadAuthors()}
        />
      )}
    </div>
  )
}
