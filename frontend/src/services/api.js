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
  related: (id, { limit = 12 } = {}) => apiFetch(`/papers/${id}/related?limit=${encodeURIComponent(limit)}`),
  create: (data, { checkDuplicates = false } = {}) => {
    const qs = checkDuplicates ? '?check_duplicates=true' : ''
    return apiFetch(`/papers${qs}`, { method: 'POST', body: data })
  },
  /** Check for duplicates without creating. Returns { duplicates, paper } or null if no dupes. */
  checkDuplicates: async (data) => {
    const res = await fetch(`${BASE}/papers?check_duplicates=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.status === 409) return res.json()
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const err = await res.json(); detail = err.detail || detail } catch (_) {}
      throw new Error(detail)
    }
    // 201 = no duplicates, paper was created
    return { created: await res.json() }
  },
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
  parseBibtex: async (file, libraryId) => {
    const formData = new FormData()
    formData.append('file', file)
    const qs = libraryId ? `?library_id=${encodeURIComponent(libraryId)}` : ''
    const res = await fetch(`${BASE}/papers/import-bibtex/parse${qs}`, { method: 'POST', body: formData })
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
  /** Fetch BibTeX text for papers. Pass ids (array), or libraryId/collectionId for bulk. */
  exportBibtex: async ({ ids, libraryId, collectionId } = {}) => {
    const params = new URLSearchParams()
    if (ids?.length) params.set('ids', ids.join(','))
    if (libraryId) params.set('library_id', libraryId)
    if (collectionId) params.set('collection_id', collectionId)
    const res = await fetch(`${BASE}/papers/export-bibtex?${params}`)
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const err = await res.json(); detail = err.detail || detail } catch (_) {}
      throw new Error(detail)
    }
    return res.text()
  },
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

export const githubReposApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/github-repos${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/github-repos/${id}`),
  create: (data) => apiFetch('/github-repos', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/github-repos/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/github-repos/${id}`, { method: 'DELETE' }),
  import: (url, libraryId) =>
    apiFetch('/github-repos/import', { method: 'POST', body: { url, library_id: libraryId || null } }),
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

export const projectsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/projects${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/projects/${id}`),
  create: (data) => apiFetch('/projects', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/projects/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/projects/${id}`, { method: 'DELETE' }),
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
  listForGitHubRepo: (repoId) => apiFetch(`/github-repos/${repoId}/notes`),
  createForGitHubRepo: (repoId, data) => apiFetch(`/github-repos/${repoId}/notes`, { method: 'POST', body: data }),
  generateForGitHubRepo: (repoId, libraryId) =>
    apiFetch(`/github-repos/${repoId}/notes/generate`, { method: 'POST', body: { library_id: libraryId || null } }),
  listForLibrary: (libraryId) => apiFetch(`/libraries/${libraryId}/notes`),
  createForLibrary: (libraryId, data) => apiFetch(`/libraries/${libraryId}/notes`, { method: 'POST', body: data }),
  listForProject: (projectId) => apiFetch(`/projects/${projectId}/notes`),
  createForProject: (projectId, data) => apiFetch(`/projects/${projectId}/notes`, { method: 'POST', body: data }),
  listForExperiment: (expId) => apiFetch(`/experiments/${expId}/notes`),
  createForExperiment: (expId, data) => apiFetch(`/experiments/${expId}/notes`, { method: 'POST', body: data }),
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
  listForGitHubRepo: (repoId) => apiFetch(`/github-repos/${repoId}/chat`),
  sendForGitHubRepo: (repoId, data) => apiFetch(`/github-repos/${repoId}/chat`, { method: 'POST', body: data }),
  clearForGitHubRepo: (repoId) => apiFetch(`/github-repos/${repoId}/chat`, { method: 'DELETE' }),
}

export const authorsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/authors${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/authors/${id}`),
  create: (data) => apiFetch('/authors', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/authors/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/authors/${id}`, { method: 'DELETE' }),
  search: (q, limit = 10) => apiFetch(`/authors/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  match: (name, context) => apiFetch('/authors/match', { method: 'POST', body: { name, context } }),
  papers: (id) => apiFetch(`/authors/${id}/papers`),
  potentialPapers: (id) => apiFetch(`/authors/${id}/potential-papers`),
  enrich: (id) => apiFetch(`/authors/${id}/enrich`, { method: 'POST' }),
}

// Paper-author linking
papersApi.authorLinks = (id) => apiFetch(`/papers/${id}/authors`)
papersApi.linkAuthor = (paperId, authorId, position = 0, rawName = '') =>
  apiFetch(`/papers/${paperId}/authors/link`, { method: 'POST', body: { author_id: authorId, position, raw_name: rawName } })
papersApi.unlinkAuthor = (paperId, authorId) =>
  apiFetch(`/papers/${paperId}/authors/link/${authorId}`, { method: 'DELETE' })

// Collection top authors
collectionsApi.topAuthors = (id, limit = 10) =>
  apiFetch(`/collections/${id}/top-authors?limit=${limit}`)

export const settingsApi = {
  getModels: ({ refresh = false } = {}) => apiFetch(`/settings/models${refresh ? '?refresh=true' : ''}`),
  updateModels: (updates) => apiFetch('/settings/models', { method: 'PATCH', body: updates }),
}

export const notesCopilotApi = {
  /** List all copilot messages for a library. */
  list: (libraryId) => apiFetch(`/libraries/${libraryId}/notes-copilot`),
  /**
   * Send a message to the Notes-page AI copilot.
   * @param {string} libraryId
   * @param {{ content: string, contextItems: object[], history: object[] }} data
   */
  send: (libraryId, data) =>
    apiFetch(`/libraries/${libraryId}/notes-copilot`, { method: 'POST', body: data }),
  /** Clear all copilot chat history for a library. */
  clear: (libraryId) =>
    apiFetch(`/libraries/${libraryId}/notes-copilot`, { method: 'DELETE' }),
}

export const projectNotesCopilotApi = {
  /** List all copilot messages for a project. */
  list: (projectId) => apiFetch(`/projects/${projectId}/notes-copilot`),
  /**
   * Send a message to the project Notes-page AI copilot.
   * Supports experiment context items with config/metrics/children in metadata.
   * @param {string} projectId
   * @param {{ content: string, contextItems: object[], history: object[] }} data
   */
  send: (projectId, data) =>
    apiFetch(`/projects/${projectId}/notes-copilot`, { method: 'POST', body: data }),
  /** Clear all copilot chat history for a project. */
  clear: (projectId) =>
    apiFetch(`/projects/${projectId}/notes-copilot`, { method: 'DELETE' }),
}

export const searchApi = {
  /**
   * Search across papers, websites, and GitHub repos.
   * Results include a `score` field and an `itemType` field for routing.
   */
  query: (q, { mode = 'lexical', limit = 10, libraryId, types } = {}) => {
    const params = new URLSearchParams({ q, mode, limit: String(limit) })
    if (libraryId) params.set('library_id', libraryId)
    if (types?.length) params.set('types', types.join(','))
    return apiFetch(`/search?${params}`)
  },
  /**
   * Fetch UMAP 2D coordinates for all embedded items in a library.
   * Returns [{id, x, y, title, itemType, collections, url}] normalised to [-1,1].
   */
  map: (libraryId) => {
    const params = new URLSearchParams()
    if (libraryId) params.set('library_id', libraryId)
    return apiFetch(`/search/map?${params}`)
  },
}

export const usageApi = {
  get: () => apiFetch('/usage'),
  reset: () => apiFetch('/usage', { method: 'DELETE' }),
}

export const researchQuestionsApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/research-questions`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/research-questions`, { method: 'POST', body: data }),
  update: (rqId, data) => apiFetch(`/research-questions/${rqId}`, { method: 'PATCH', body: data }),
  remove: (rqId) => apiFetch(`/research-questions/${rqId}`, { method: 'DELETE' }),
  reorder: (rqId, ids) => apiFetch(`/research-questions/${rqId}/reorder`, { method: 'POST', body: { ids } }),
  listPapers: (rqId) => apiFetch(`/research-questions/${rqId}/papers`),
  linkPaper: (rqId, data) => apiFetch(`/research-questions/${rqId}/papers`, { method: 'POST', body: data }),
  unlinkPaper: (rqId, linkId) => apiFetch(`/research-questions/${rqId}/papers/${linkId}`, { method: 'DELETE' }),
}

export const projectPapersApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/papers`),
  link: (projectId, data) => apiFetch(`/projects/${projectId}/papers`, { method: 'POST', body: data }),
  unlink: (projectId, linkId) => apiFetch(`/projects/${projectId}/papers/${linkId}`, { method: 'DELETE' }),
  /** Extract AI keyword tags for all untagged papers in the project.
   *  Returns { updated, skipped, total }. */
  extractKeywords: (projectId) => apiFetch(`/projects/${projectId}/papers/extract-keywords`, { method: 'POST' }),
}

export const experimentsApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/experiments`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/experiments`, { method: 'POST', body: data }),
  update: (expId, data) => apiFetch(`/experiments/${expId}`, { method: 'PATCH', body: data }),
  remove: (expId) => apiFetch(`/experiments/${expId}`, { method: 'DELETE' }),
  reorder: (expId, ids) => apiFetch(`/experiments/${expId}/reorder`, { method: 'POST', body: { ids } }),
  duplicate: (expId, { deep = false } = {}) =>
    apiFetch(`/experiments/${expId}/duplicate?deep=${deep}`, { method: 'POST' }),
  listPapers: (expId) => apiFetch(`/experiments/${expId}/papers`),
  linkPaper: (expId, data) => apiFetch(`/experiments/${expId}/papers`, { method: 'POST', body: data }),
  unlinkPaper: (expId, linkId) => apiFetch(`/experiments/${expId}/papers/${linkId}`, { method: 'DELETE' }),
  importCsv: (projectId, data) =>
    apiFetch(`/projects/${projectId}/experiments/import-csv`, { method: 'POST', body: data }),
}

export const tasksApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/tasks`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/tasks`, { method: 'POST', body: data }),
  update: (taskId, data) => apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: data }),
  remove: (taskId) => apiFetch(`/tasks/${taskId}`, { method: 'DELETE' }),
}

export const taskColumnsApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/task-columns`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/task-columns`, { method: 'POST', body: data }),
  update: (colId, data) => apiFetch(`/task-columns/${colId}`, { method: 'PATCH', body: data }),
  remove: (colId, moveToColId) =>
    apiFetch(`/task-columns/${colId}?move_to=${encodeURIComponent(moveToColId)}`, { method: 'DELETE' }),
}

export const taskFieldDefsApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/task-field-defs`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/task-field-defs`, { method: 'POST', body: data }),
  update: (defId, data) => apiFetch(`/task-field-defs/${defId}`, { method: 'PATCH', body: data }),
  remove: (defId) => apiFetch(`/task-field-defs/${defId}`, { method: 'DELETE' }),
}

export const gapAnalysisApi = {
  analyze: (projectId, data = {}) =>
    apiFetch(`/projects/${projectId}/gap-analysis`, { method: 'POST', body: data }),
}

