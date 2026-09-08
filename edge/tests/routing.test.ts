import { describe, expect, it } from 'vitest'

import worker from '../src/index.js'

describe('edge routing', () => {
  it('returns a JSON API 404 instead of the SPA for an unknown API path', async () => {
    const response = await worker.fetch(new Request('https://cruxset.example/api/v1/unknown'), { ASSETS: { fetch: async () => new Response('SPA') } } as never, {} as never)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: { code: 'NOT_FOUND', message: 'API endpoint not found' } })
  })

  it('serves the static asset handler for a non-API path', async () => {
    const response = await worker.fetch(new Request('https://cruxset.example/wall-images/abc.webp'), { ASSETS: { fetch: async () => new Response('image', { headers: { 'content-type': 'image/webp' } }) } } as never, {} as never)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/webp')
  })
})
