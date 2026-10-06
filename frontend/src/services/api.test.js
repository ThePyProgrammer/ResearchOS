import { beforeEach, describe, expect, it, vi } from 'vitest'

import { batchApi, chatApi, librariesApi, notesApi, papersApi } from './api'


describe('api service wrapper', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('loads notes in bounded batches and preserves source order', async () => {
    const sources = Array.from({ length: 301 }, (_, i) => ({ id: `p${i}`, itemType: 'paper' }))
    const pending = []
    global.fetch.mockImplementation((_url, options) => new Promise(resolve => {
      const { items } = JSON.parse(options.body)
      expect(items.length).toBeLessThanOrEqual(100)
      pending.push(() => resolve({ ok: true, status: 200, json: async () => items.map(item => ({ ...item, notes: [] })) }))
    }))
    const request = notesApi.listForItems(sources)
    expect(global.fetch).toHaveBeenCalledTimes(3)
    pending.splice(0).reverse().forEach(resolve => resolve())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4))
    pending.splice(0).forEach(resolve => resolve())
    expect((await request).map(source => source.id)).toEqual(sources.map(source => source.id))
  })

  it('surfaces failed note batches instead of treating them as empty folders', async () => {
    global.fetch.mockRejectedValue(new Error('Notes unavailable'))
    await expect(notesApi.listForItems([{ id: 'p1' }])).rejects.toThrow('Notes unavailable')
    expect(await notesApi.listForItems([])).toEqual([])
  })

  it('chunks large mutations and preserves successes when a chunk fails', async () => {
    const items = Array.from({ length: 450 }, (_, i) => ({ id: `p_${i}` }))
    global.fetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      expect(body.items.length).toBeLessThanOrEqual(100)
      if (body.items[0].id === 'p_100') throw new Error('Connection lost')
      return { ok: true, status: 200, json: async () => ({ succeededIds: body.items.map(i => i.id), failed: [] }) }
    })
    const onResult = vi.fn()
    const result = await batchApi.mutateItems(items, { action: 'status', status: 'read' }, onResult)
    expect(global.fetch).toHaveBeenCalledTimes(5)
    expect(onResult).toHaveBeenCalledTimes(5)
    expect(result.succeededIds).toHaveLength(350)
    expect(result.failed).toHaveLength(100)
    expect(new Set([...result.succeededIds, ...result.failed.map(i => i.id)]).size).toBe(450)
  })

  it('limits simultaneous mutation requests to three', async () => {
    const pending = []
    global.fetch.mockImplementation((_url, options) => new Promise(resolve => {
      const body = JSON.parse(options.body)
      pending.push(() => resolve({ ok: true, status: 200, json: async () => ({ succeededIds: body.items.map(i => i.id), failed: [] }) }))
    }))
    const promise = batchApi.mutateItems(Array.from({ length: 301 }, (_, i) => ({ id: `p_${i}` })), { action: 'delete' })
    expect(global.fetch).toHaveBeenCalledTimes(3)
    pending.splice(0).forEach(resolve => resolve())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4))
    pending.splice(0).forEach(resolve => resolve())
    expect((await promise).succeededIds).toHaveLength(301)
  })

  it('splits notes previews at the server limit', async () => {
    global.fetch.mockImplementation(async (_url, options) => ({
      ok: true, status: 200,
      json: async () => ({ skip_ids: [], process_ids: JSON.parse(options.body).item_ids }),
    }))
    const ids = Array.from({ length: 205 }, (_, i) => `p_${i}`)
    expect((await batchApi.notesPreview(ids)).process_ids).toEqual(ids)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('returns parsed JSON on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 'lib_1' }],
    })

    const data = await librariesApi.list()

    expect(data).toEqual([{ id: 'lib_1' }])
    expect(global.fetch).toHaveBeenCalledWith('/api/libraries', expect.any(Object))
  })

  it('shares concurrent reads but fetches again after they settle', async () => {
    let resolve
    global.fetch.mockReturnValue(new Promise(done => { resolve = done }))
    const first = librariesApi.list()
    const second = librariesApi.list()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    resolve({ ok: true, status: 200, json: async () => [{ id: 'lib_1' }] })
    expect(await first).toEqual(await second)
    await librariesApi.list()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not reuse a pending read across a mutation', async () => {
    let resolve
    global.fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const oldRead = librariesApi.list()
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] })
    await librariesApi.remove('lib_1')
    await librariesApi.list()
    expect(global.fetch).toHaveBeenCalledTimes(3)
    resolve({ ok: true, status: 200, json: async () => [] })
    await oldRead
  })

  it('retries a failed shared read', async () => {
    global.fetch.mockRejectedValueOnce(new Error('offline'))
    await expect(Promise.all([librariesApi.list(), librariesApi.list()])).rejects.toThrow('offline')
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] })
    expect(await librariesApi.list()).toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns null for 204 responses', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    })

    const data = await librariesApi.remove('lib_1')

    expect(data).toBeNull()
  })

  it('prefers error.detail over error.error when a request fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad_request', detail: 'Bad input' }),
    })

    await expect(librariesApi.list()).rejects.toThrow('Bad input')
  })

  it('falls back to error.error when detail is missing', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not_found' }),
    })

    await expect(librariesApi.list()).rejects.toThrow('not_found')
  })

  it('falls back to HTTP status message when error payload is not json', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('not json')
      },
    })

    await expect(librariesApi.list()).rejects.toThrow('HTTP 503')
  })

  it('serializes query params and omits null/undefined values', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })

    await papersApi.list({ status: 'read', search: 'transformer', library_id: null, collection_id: undefined })

    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/papers?')
    expect(url).toContain('status=read')
    expect(url).toContain('search=transformer')
    expect(url).not.toContain('library_id')
    expect(url).not.toContain('collection_id')
  })

  it('multipart upload endpoints submit FormData and propagate detail errors', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'Only PDF files are accepted' }),
    })
    const file = new File(['%PDF-1.4'], 'paper.pdf', { type: 'application/pdf' })

    await expect(papersApi.uploadPdf('p_1', file)).rejects.toThrow('Only PDF files are accepted')

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/papers/p_1/pdf')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
  })

  it('checkDuplicates returns duplicate payload on 409 and created payload on 201', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 409,
      ok: false,
      json: async () => ({ duplicates: [{ id: 'p_1' }], paper: { title: 'A' } }),
    })

    const duplicate = await papersApi.checkDuplicates({ title: 'A' })
    expect(duplicate.duplicates).toHaveLength(1)

    global.fetch.mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: async () => ({ id: 'p_2', title: 'B' }),
    })

    const created = await papersApi.checkDuplicates({ title: 'B' })
    expect(created.created.id).toBe('p_2')
  })

  it('exportBibtex returns raw text', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '@article{p_1,title={Test}}',
    })

    const bib = await papersApi.exportBibtex({ ids: ['p_1', 'w_1'] })

    expect(bib).toContain('@article{p_1')
    expect(global.fetch).toHaveBeenCalledWith('/api/papers/export-bibtex?ids=p_1%2Cw_1')
  })

  it('chatApi endpoints use expected paths', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })

    await chatApi.list('p_1')
    await chatApi.extractText('p_1')

    expect(global.fetch.mock.calls[0][0]).toBe('/api/papers/p_1/chat')
    expect(global.fetch.mock.calls[1][0]).toBe('/api/papers/p_1/text')
    expect(global.fetch.mock.calls[1][1].method).toBe('POST')
  })

  it('related papers endpoint passes the limit query parameter', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    })

    await papersApi.related('p_42', { limit: 9 })

    expect(global.fetch.mock.calls[0][0]).toBe('/api/papers/p_42/related?limit=9')
  })
})
