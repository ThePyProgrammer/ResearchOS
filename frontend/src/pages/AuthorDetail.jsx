import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { authorsApi } from '../services/api'

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

function EmailChips({ emails = [], onSave }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  async function addEmail() {
    const email = draft.trim()
    if (!email) return
    await onSave([...emails, email])
    setDraft('')
    setAdding(false)
  }

  async function removeEmail(idx) {
    await onSave(emails.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {emails.map((email, i) => (
          <span key={i} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 group">
            <Icon name="mail" className="text-[11px] text-slate-400" />
            {email}
            <button onClick={() => removeEmail(i)} className="text-slate-400 hover:text-red-500 transition-colors ml-0.5">
              <Icon name="close" className="text-[11px]" />
            </button>
          </span>
        ))}
        {emails.length === 0 && !adding && <span className="text-xs text-slate-400 italic">No emails</span>}
      </div>
      {adding ? (
        <div className="flex gap-1.5 items-center">
          <input
            autoFocus
            type="email"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addEmail(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
            onBlur={() => { if (draft.trim()) addEmail(); else setAdding(false) }}
            placeholder="email@example.com"
            className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono"
          />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1">
          <Icon name="add" className="text-[12px]" />
          Add email
        </button>
      )}
    </div>
  )
}

function AffiliationTimeline({ affiliations = [], onSave }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ institution: '', role: '' })

  async function addAffiliation() {
    if (!draft.institution.trim()) return
    const newAff = { institution: draft.institution.trim(), role: draft.role.trim() || null }
    await onSave([...affiliations, newAff])
    setDraft({ institution: '', role: '' })
    setAdding(false)
  }

  async function removeAffiliation(idx) {
    await onSave(affiliations.filter((_, i) => i !== idx))
  }

  return (
    <div>
      {affiliations.map((aff, i) => (
        <div key={i} className="flex items-start gap-3 py-2 group">
          <div className="mt-1 w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700">{aff.institution}</p>
            {aff.role && <p className="text-xs text-slate-500">{aff.role}</p>}
          </div>
          <button
            onClick={() => removeAffiliation(i)}
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 flex-shrink-0 transition-opacity"
          >
            <Icon name="close" className="text-[14px]" />
          </button>
        </div>
      ))}
      {affiliations.length === 0 && !adding && (
        <p className="text-xs text-slate-400 italic mb-2">No affiliations</p>
      )}
      {adding ? (
        <div className="space-y-2 p-3 bg-slate-50 rounded-lg">
          <input
            autoFocus
            type="text"
            value={draft.institution}
            onChange={e => setDraft(d => ({ ...d, institution: e.target.value }))}
            placeholder="Institution"
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          <input
            type="text"
            value={draft.role}
            onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addAffiliation(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Role (optional)"
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          <div className="flex gap-2">
            <button onClick={addAffiliation} disabled={!draft.institution.trim()} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">Add</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-slate-400 text-xs rounded-lg hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1">
          <Icon name="add" className="text-[12px]" />
          Add affiliation
        </button>
      )}
    </div>
  )
}

const PROFILE_FIELDS = [
  { key: 'orcid', icon: 'badge', label: 'ORCID', placeholder: '0000-0000-0000-0000', toUrl: v => `https://orcid.org/${v}`, display: v => v },
  { key: 'googleScholarUrl', icon: 'school', label: 'Scholar', placeholder: 'https://scholar.google.com/...', toUrl: v => v, display: v => v.replace(/^https?:\/\//, '').replace(/\/$/, '') },
  { key: 'githubUsername', icon: 'code', label: 'GitHub', placeholder: 'username', toUrl: v => `https://github.com/${v}`, display: v => v },
  { key: 'openreviewUrl', icon: 'rate_review', label: 'OpenReview', placeholder: 'https://openreview.net/...', toUrl: v => v, display: v => v.replace(/^https?:\/\//, '').replace(/\/$/, '') },
  { key: 'websiteUrl', icon: 'language', label: 'Website', placeholder: 'https://...', toUrl: v => v, display: v => v.replace(/^https?:\/\//, '').replace(/\/$/, '') },
]

function ProfileLinkRow({ field, value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  function startEdit() { setDraft(value || ''); setEditing(true) }
  function cancel() { setEditing(false) }
  async function save() { await onSave(draft.trim() || null); setEditing(false) }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Icon name={field.icon} className="text-[15px] text-slate-400 flex-shrink-0" />
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          onBlur={save}
          placeholder={field.placeholder}
          className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono"
        />
        <button onClick={save} className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 flex-shrink-0">Save</button>
        <button onClick={cancel} className="px-2 py-1 text-slate-400 text-xs rounded-lg hover:bg-slate-100 flex-shrink-0">&times;</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group">
      <Icon name={field.icon} className="text-[15px] text-slate-400 flex-shrink-0" />
      <span className="text-slate-400 text-xs w-16 flex-shrink-0">{field.label}</span>
      {value ? (
        <>
          <a
            href={field.toUrl(value)}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-xs text-blue-600 hover:underline truncate font-mono"
            title={value}
          >
            {field.display(value)}
          </a>
          <button onClick={startEdit} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 flex-shrink-0 transition-opacity">
            <Icon name="edit" className="text-[13px]" />
          </button>
          <button onClick={() => onSave(null)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 flex-shrink-0 transition-opacity">
            <Icon name="close" className="text-[13px]" />
          </button>
        </>
      ) : (
        <button onClick={startEdit} className="text-xs text-slate-400 hover:text-blue-600 transition-colors italic">
          Add {field.label.toLowerCase()}…
        </button>
      )}
    </div>
  )
}

function ProfileLinksCard({ author, onSave }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-800">Profile</h2>

      <div className="space-y-2.5">
        {PROFILE_FIELDS.map(field => (
          <ProfileLinkRow
            key={field.key}
            field={field}
            value={author[field.key]}
            onSave={v => onSave(field.key, v)}
          />
        ))}
      </div>

      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Emails</p>
        <EmailChips emails={author.emails || []} onSave={v => onSave('emails', v)} />
      </div>
    </div>
  )
}

export default function AuthorDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [author, setAuthor] = useState(null)
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState(null)

  useEffect(() => {
    loadAuthor()
  }, [id])

  async function loadAuthor() {
    try {
      setLoading(true)
      const [authorData, papersData] = await Promise.all([
        authorsApi.get(id),
        authorsApi.papers(id),
      ])
      setAuthor(authorData)
      setPapers(papersData)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFieldSave(field, value) {
    try {
      const updated = await authorsApi.update(id, { [field]: value })
      setAuthor(updated)
    } catch (err) {
      console.error('Failed to update author:', err)
    }
  }

  async function handleEnrich() {
    setEnriching(true)
    setEnrichResult(null)
    try {
      const result = await authorsApi.enrich(id)
      setEnrichResult(result)
    } catch (err) {
      alert(`Enrichment failed: ${err.message}`)
    } finally {
      setEnriching(false)
    }
  }

  async function applyEnrichment(suggestions) {
    const updates = {}
    if (suggestions.affiliations?.length) updates.affiliations = suggestions.affiliations
    if (suggestions.orcid) updates.orcid = suggestions.orcid
    if (suggestions.google_scholar_url) updates.googleScholarUrl = suggestions.google_scholar_url
    if (suggestions.github_username) updates.githubUsername = suggestions.github_username
    if (suggestions.website_url) updates.websiteUrl = suggestions.website_url
    if (suggestions.emails?.length) updates.emails = suggestions.emails

    if (Object.keys(updates).length > 0) {
      try {
        const updated = await authorsApi.update(id, updates)
        setAuthor(updated)
        setEnrichResult(null)
      } catch (err) {
        alert(`Failed to apply: ${err.message}`)
      }
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this author? This will remove all paper links.')) return
    try {
      await authorsApi.remove(id)
      navigate('/authors')
    } catch (err) {
      alert(`Failed to delete: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="h-8 w-64 bg-slate-100 rounded animate-pulse mb-4" />
          <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !author) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error || 'Author not found'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back */}
        <button
          onClick={() => navigate('/authors')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-6"
        >
          <Icon name="arrow_back" className="text-[16px]" />
          All Authors
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
              <Icon name="person" className="text-[32px]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{author.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {PROFILE_FIELDS.filter(l => author[l.key]).map(link => (
                  <a
                    key={link.key}
                    href={link.toUrl(author[link.key])}
                    target="_blank"
                    rel="noreferrer"
                    title={link.label}
                    className="text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Icon name={link.icon} className="text-[18px]" />
                  </a>
                ))}
                <span className="text-sm text-slate-500">{author.paperCount} paper{author.paperCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEnrich}
              disabled={enriching}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              <Icon name="auto_awesome" className="text-[16px]" />
              {enriching ? 'Enriching...' : 'Enrich with AI'}
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Icon name="delete" className="text-[16px]" />
              Delete
            </button>
          </div>
        </div>

        {/* Enrichment result */}
        {enrichResult?.suggestions && (
          <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="auto_awesome" className="text-[18px] text-purple-600" />
              <h3 className="text-sm font-semibold text-purple-800">AI Suggestions</h3>
            </div>

            {/* Semantic Scholar source data */}
            {enrichResult.web_context?.length > 0 && (
              <div className="mb-3 p-3 bg-white/60 rounded-lg border border-purple-100">
                <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Icon name="travel_explore" className="text-[12px]" />
                  Found on Semantic Scholar
                </p>
                <div className="space-y-1.5">
                  {enrichResult.web_context.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-purple-700">
                      <span className="text-purple-300 flex-shrink-0 font-mono">{i + 1}.</span>
                      <div className="min-w-0">
                        <span className="font-medium">{c.name}</span>
                        {c.affiliations?.length > 0 && (
                          <span className="text-purple-500"> · {c.affiliations[0]}</span>
                        )}
                        <span className="text-purple-400"> · {c.paper_count} papers</span>
                        {c.h_index != null && (
                          <span className="text-purple-400"> · h-index {c.h_index}</span>
                        )}
                        {c.orcid && (
                          <span className="text-purple-400 font-mono"> · {c.orcid}</span>
                        )}
                        {c.homepage && (
                          <a href={c.homepage} target="_blank" rel="noreferrer" className="ml-1 text-blue-500 hover:underline">
                            {c.homepage.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live web search citations */}
            {enrichResult.citations?.length > 0 && (
              <div className="mb-3 p-3 bg-white/60 rounded-lg border border-purple-100">
                <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Icon name="public" className="text-[12px]" />
                  Web sources consulted
                </p>
                <div className="space-y-1">
                  {enrichResult.citations.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                      <span className="text-purple-300 flex-shrink-0 mt-0.5">·</span>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline truncate"
                        title={c.url}
                      >
                        {c.title || c.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No external data at all */}
            {!enrichResult.web_context?.length && !enrichResult.citations?.length && (
              <div className="mb-3 p-2.5 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
                <Icon name="travel_explore" className="text-[14px] text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-600">
                  No external sources found — suggestions are based on library papers only.
                  Identifiers like ORCID and URLs have been omitted to avoid guesses.
                </p>
              </div>
            )}

            <pre className="text-xs text-purple-700 bg-white/50 rounded-lg p-3 overflow-auto max-h-48 mb-3">
              {JSON.stringify(enrichResult.suggestions, null, 2)}
            </pre>
            {enrichResult.suggestions.confidence_notes && (
              <p className="text-xs text-purple-600 mb-3 italic">{enrichResult.suggestions.confidence_notes}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => applyEnrichment(enrichResult.suggestions)}
                className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Apply Suggestions
              </button>
              <button
                onClick={() => setEnrichResult(null)}
                className="px-3 py-1.5 text-xs text-purple-600 rounded-lg hover:bg-purple-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile */}
          <div className="lg:col-span-1 space-y-6">
            <ProfileLinksCard author={author} onSave={handleFieldSave} />

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Affiliations</h2>
              <AffiliationTimeline
                affiliations={author.affiliations || []}
                onSave={v => handleFieldSave('affiliations', v)}
              />
            </div>
          </div>

          {/* Papers */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">
                Linked Papers ({papers.length})
              </h2>
              {papers.length === 0 ? (
                <p className="text-sm text-slate-400 italic py-4 text-center">
                  No papers linked yet. Link papers from the paper detail view.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {papers.map(paper => (
                    <div
                      key={paper.id}
                      onClick={() => navigate(`/library/paper/${paper.id}`)}
                      className="py-3 px-2 hover:bg-blue-50/50 rounded-lg cursor-pointer transition-colors -mx-2"
                    >
                      <p className="text-sm font-medium text-slate-800 mb-1">{paper.title}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{paper.year}</span>
                        {paper.venue && <span>{paper.venue}</span>}
                        <span>{(paper.authors || []).slice(0, 3).join(', ')}{paper.authors?.length > 3 ? ' et al.' : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
