import { beforeEach, describe, expect, it, vi } from 'vitest'

import { librariesApi, papersApi } from './api'


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
})
