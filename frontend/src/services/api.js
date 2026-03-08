const BASE = '/api'

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail = err.detail || err.error || detail
    } catch (_) {}
    throw new Error(detail)
  }
  if (res.status === 204) return null
  return res.json()
}

export const papersApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/papers${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/papers/${id}`),
  create: (data) => apiFetch('/papers', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/papers/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/papers/${id}`, { method: 'DELETE' }),
  /** Resolve a DOI, arXiv ID, or URL and add to the library. */
  import: (identifier, libraryId) =>
    apiFetch('/papers/import', { method: 'POST', body: { identifier, library_id: libraryId || null } }),
  /** Upload a PDF file (File object) and store it in Supabase Storage. */
  uploadPdf: async (id, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE}/papers/${id}/pdf`, { method: 'POST', body: formData })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const err = await res.json(); detail = err.detail || detail } catch (_) {}
      throw new Error(detail)
    }
    return res.json()
  },
  removePdf: (id) => apiFetch(`/papers/${id}/pdf`, { method: 'DELETE' }),
  fetchPdf: (id) => apiFetch(`/papers/${id}/pdf/fetch`, { method: 'POST' }),
  /** Parse a .bib file and return preview entries with duplicate detection. */
  parseBibtex: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE}/papers/import-bibtex/parse`, { method: 'POST', body: formData })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const err = await res.json(); detail = err.detail || detail } catch (_) {}
      throw new Error(detail)
    }
    return res.json()
  },
  /** Confirm BibTeX import with selected entries. */
  confirmBibtex: (entries, libraryId) =>
    apiFetch('/papers/import-bibtex/confirm', { method: 'POST', body: { entries, library_id: libraryId || null } }),
  /** Extract metadata from a PDF file (File object) using LLM. */
  extractMetadata: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE}/papers/extract-metadata`, { method: 'POST', body: formData })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const err = await res.json(); detail = err.detail || detail } catch (_) {}
      throw new Error(detail)
    }
    return res.json()
  },
}

export const librariesApi = {
  list: () => apiFetch('/libraries'),
  get: (id) => apiFetch(`/libraries/${id}`),
  create: (data) => apiFetch('/libraries', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/libraries/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/libraries/${id}`, { method: 'DELETE' }),
}

export const websitesApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/websites${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/websites/${id}`),
  create: (data) => apiFetch('/websites', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/websites/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/websites/${id}`, { method: 'DELETE' }),
  import: (url, libraryId) =>
    apiFetch('/websites/import', { method: 'POST', body: { url, library_id: libraryId || null } }),
}

export const collectionsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/collections${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/collections/${id}`),
  create: (data) => apiFetch('/collections', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/collections/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/collections/${id}`, { method: 'DELETE' }),
}

export const workflowsApi = {
  list: () => apiFetch('/workflows'),
  get: (id) => apiFetch(`/workflows/${id}`),
}

export const runsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/runs${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/runs/${id}`),
  start: (data) => apiFetch('/runs', { method: 'POST', body: data }),
}

export const proposalsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/proposals${qs ? `?${qs}` : ''}`)
  },
  approve: (id) => apiFetch(`/proposals/${id}/approve`, { method: 'POST' }),
  reject: (id) => apiFetch(`/proposals/${id}/reject`, { method: 'POST' }),
  batch: (ids, action) => apiFetch('/proposals/batch', { method: 'POST', body: { ids, action } }),
}

export const activityApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/activity${qs ? `?${qs}` : ''}`)
  },
}

export const notesApi = {
  list: (paperId) => apiFetch(`/papers/${paperId}/notes`),
  create: (paperId, data) => apiFetch(`/papers/${paperId}/notes`, { method: 'POST', body: data }),
  update: (noteId, data) => apiFetch(`/notes/${noteId}`, { method: 'PATCH', body: data }),
  remove: (noteId) => apiFetch(`/notes/${noteId}`, { method: 'DELETE' }),
  generate: (paperId, libraryId) =>
    apiFetch(`/papers/${paperId}/notes/generate`, { method: 'POST', body: { library_id: libraryId || null } }),
  listForWebsite: (websiteId) => apiFetch(`/websites/${websiteId}/notes`),
  createForWebsite: (websiteId, data) => apiFetch(`/websites/${websiteId}/notes`, { method: 'POST', body: data }),
  generateForWebsite: (websiteId, libraryId) =>
    apiFetch(`/websites/${websiteId}/notes/generate`, { method: 'POST', body: { library_id: libraryId || null } }),
}

export const chatApi = {
  list: (paperId) => apiFetch(`/papers/${paperId}/chat`),
  send: (paperId, data) => apiFetch(`/papers/${paperId}/chat`, { method: 'POST', body: data }),
  clear: (paperId) => apiFetch(`/papers/${paperId}/chat`, { method: 'DELETE' }),
  /** Get text extraction status for a paper's PDF. */
  getTextStatus: (paperId) => apiFetch(`/papers/${paperId}/text`),
  /** Trigger PDF text extraction (downloads + processes PDF). */
  extractText: (paperId) => apiFetch(`/papers/${paperId}/text`, { method: 'POST' }),
  listForWebsite: (websiteId) => apiFetch(`/websites/${websiteId}/chat`),
  sendForWebsite: (websiteId, data) => apiFetch(`/websites/${websiteId}/chat`, { method: 'POST', body: data }),
  clearForWebsite: (websiteId) => apiFetch(`/websites/${websiteId}/chat`, { method: 'DELETE' }),
}

export const searchApi = {
  /** Quick search — returns papers with a `score` field appended. */
  query: (q, { mode = 'lexical', limit = 10 } = {}) =>
    apiFetch(`/search?q=${encodeURIComponent(q)}&mode=${mode}&limit=${limit}`),
}
