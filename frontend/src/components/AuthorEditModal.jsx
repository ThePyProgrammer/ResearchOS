import { useRef, useState } from 'react'
import { authorsApi } from '../services/api'
import WindowModal from './WindowModal'

export const PROFILE_FIELDS = [
  { key: 'orcid', icon: 'badge', label: 'ORCID', placeholder: '0000-0000-0000-0000', toUrl: value => 'https://orcid.org/' + value },
  { key: 'googleScholarUrl', icon: 'school', label: 'Google Scholar', placeholder: 'https://scholar.google.com/…', toUrl: value => value },
  { key: 'githubUsername', icon: 'code', label: 'GitHub', placeholder: 'username', toUrl: value => 'https://github.com/' + value },
  { key: 'openreviewUrl', icon: 'rate_review', label: 'OpenReview', placeholder: 'https://openreview.net/…', toUrl: value => value },
  { key: 'websiteUrl', icon: 'language', label: 'Website', placeholder: 'https://…', toUrl: value => value },
]

const INPUT = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const BUTTON = 'rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40'
const LABEL = 'block text-xs font-medium text-slate-600'

function Icon({ name, className = '' }) {
  return <span aria-hidden="true" className={'material-symbols-outlined inline-block w-[1em] shrink-0 overflow-hidden align-middle ' + className}>{name}</span>
}

export default function AuthorEditModal({ author, onSaved, onClose }) {
  const [name, setName] = useState(author.name)
  const [links, setLinks] = useState(() => Object.fromEntries(PROFILE_FIELDS.map(field => [field.key, author[field.key] || ''])))
  const nextKey = useRef(0)
  const [emails, setEmails] = useState(() => (author.emails || []).map(value => ({ key: nextKey.current++, value })))
  // Show the last stored affiliation first; convert back to storage order on save.
  const [affiliations, setAffiliations] = useState(() => [...(author.affiliations || [])].reverse().map(value => ({ key: nextKey.current++, value: { ...value } })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function updateAffiliation(key, field, value) {
    setAffiliations(current => current.map(item => item.key === key ? { ...item, value: { ...item.value, [field]: value } } : item))
  }

  function moveAffiliation(index, direction) {
    setAffiliations(current => {
      const reordered = [...current]
      const target = index + direction
      ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
      return reordered
    })
  }

  async function save(event) {
    event.preventDefault()
    if (saving) return
    setError(null)
    if (!name.trim()) { setError('Enter an author name.'); return }
    if (affiliations.some(item => !item.value.institution.trim())) { setError('Enter an institution for each affiliation.'); return }
    const draft = {
      name: name.trim(),
      ...Object.fromEntries(PROFILE_FIELDS.map(field => [field.key, links[field.key].trim() || null])),
      emails: emails.map(item => item.value.trim()),
      affiliations: [...affiliations].reverse().map(({ value }) => ({
        ...value,
        institution: value.institution.trim(),
        role: value.role?.trim() || null,
        startDate: value.startDate?.trim() || null,
        endDate: value.endDate?.trim() || null,
      })),
    }
    // Patch only edited fields so an unrelated refresh cannot replace other data.
    const original = {
      ...author,
      emails: author.emails || [],
      affiliations: (author.affiliations || []).map(value => ({ ...value, role: value.role || null, startDate: value.startDate || null, endDate: value.endDate || null })),
    }
    const updates = Object.fromEntries(Object.entries(draft).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(original[field] ?? null)))
    if (!Object.keys(updates).length) { onClose(); return }
    setSaving(true)
    try {
      const saved = await authorsApi.update(author.id, updates)
      onSaved(saved, Object.keys(updates))
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return <WindowModal open title="Edit author" iconName="edit" onClose={onClose} disableClose={saving} closeOnBackdrop={false} normalPanelClassName="w-full max-w-2xl rounded-2xl" bodyClassName="flex min-h-0 flex-col">
    <form onSubmit={save} className="flex max-h-[75vh] min-h-0 flex-col" aria-label="Edit author">
      <div className="min-h-0 overflow-y-auto">
      <fieldset disabled={saving} className="min-w-0 space-y-6 p-5">
        <label className={LABEL}>Author name<input autoFocus required value={name} onChange={event => setName(event.target.value)} className={INPUT} /></label>
        <section aria-label="Profile links">
          <h3 className="text-sm font-semibold text-slate-800">Profile links</h3>
          <p className="mt-1 text-xs text-slate-400">Saved links appear as icons below the author’s name. Clear a field to remove its link.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{PROFILE_FIELDS.map(field => <label key={field.key} className={LABEL}>
            {field.label}{field.key === 'githubUsername' && <span className="font-normal text-slate-400"> · username</span>}
            <input aria-label={field.label} type={field.key.endsWith('Url') ? 'url' : 'text'} pattern={field.key.endsWith('Url') ? 'https?://.+' : undefined} value={links[field.key]} onChange={event => setLinks(current => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} className={INPUT} />
          </label>)}</div>
        </section>
        <section aria-label="Email addresses">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-800">Email</h3><button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setEmails(current => [...current, { key: nextKey.current++, value: '' }])}>Add email</button></div>
          {!emails.length && <p className="mt-2 text-xs text-slate-400">No email addresses added.</p>}
          <div className="mt-2 space-y-2">{emails.map((email, index) => <div key={email.key} className="flex items-center gap-2">
            <input required type="email" aria-label={'Email ' + (index + 1)} value={email.value} onChange={event => setEmails(current => current.map(item => item.key === email.key ? { ...item, value: event.target.value } : item))} placeholder="email@example.com" className={INPUT + ' mt-0'} />
            <button type="button" aria-label={'Remove email ' + (index + 1)} title="Remove email" onClick={() => setEmails(current => current.filter(item => item.key !== email.key))} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Icon name="close" className="text-[16px]" /></button>
          </div>)}</div>
        </section>
        <section aria-label="Edit affiliations">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-800">Affiliations</h3><button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setAffiliations(current => [...current, { key: nextKey.current++, value: { institution: '', role: '', startDate: '', endDate: '' } }])}>Add affiliation</button></div>
          <p className="mt-1 text-xs text-slate-400">Edit the details and use the arrows to change their display order.</p>
          {!affiliations.length && <p className="mt-3 text-xs text-slate-400">No affiliations added.</p>}
          <ol className="mt-3 space-y-3">{affiliations.map(({ key, value }, index) => <li key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-500">Affiliation {index + 1}</span><div className="flex gap-1">
              <button type="button" disabled={index === 0} aria-label={'Move ' + (value.institution || 'affiliation ' + (index + 1)) + ' up'} title="Move up" onClick={() => moveAffiliation(index, -1)} className="rounded p-1.5 text-slate-500 hover:bg-white disabled:opacity-25"><Icon name="arrow_upward" className="text-[16px]" /></button>
              <button type="button" disabled={index === affiliations.length - 1} aria-label={'Move ' + (value.institution || 'affiliation ' + (index + 1)) + ' down'} title="Move down" onClick={() => moveAffiliation(index, 1)} className="rounded p-1.5 text-slate-500 hover:bg-white disabled:opacity-25"><Icon name="arrow_downward" className="text-[16px]" /></button>
              <button type="button" aria-label={'Remove affiliation ' + (index + 1)} title="Remove affiliation" onClick={() => setAffiliations(current => current.filter(item => item.key !== key))} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Icon name="close" className="text-[16px]" /></button>
            </div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>Institution<input required aria-label={'Institution ' + (index + 1)} value={value.institution} onChange={event => updateAffiliation(key, 'institution', event.target.value)} className={INPUT} /></label>
              <label className={LABEL}>Role<input aria-label={'Role ' + (index + 1)} value={value.role || ''} onChange={event => updateAffiliation(key, 'role', event.target.value)} placeholder="Optional" className={INPUT} /></label>
              <label className={LABEL}>Start date<input aria-label={'Start date ' + (index + 1)} value={value.startDate || ''} onChange={event => updateAffiliation(key, 'startDate', event.target.value)} placeholder="e.g. 2021" className={INPUT} /></label>
              <label className={LABEL}>End date<input aria-label={'End date ' + (index + 1)} value={value.endDate || ''} onChange={event => updateAffiliation(key, 'endDate', event.target.value)} placeholder="Present" className={INPUT} /></label>
            </div>
          </li>)}</ol>
        </section>
      </fieldset>
      </div>
      <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className={BUTTON}>Cancel</button><button disabled={saving} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40">{saving ? 'Saving…' : 'Save changes'}</button></div>
      </div>
    </form>
  </WindowModal>
}
