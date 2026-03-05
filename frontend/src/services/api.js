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
}

export const collectionsApi = {
  list: () => apiFetch('/collections'),
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
  list: () => apiFetch('/runs'),
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
  list: (type) => apiFetch(`/activity${type ? `?type=${type}` : ''}`),
}
