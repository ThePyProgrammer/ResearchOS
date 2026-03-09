import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chatApi, librariesApi, papersApi } from './api'


describe('api service wrapper', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
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
})
