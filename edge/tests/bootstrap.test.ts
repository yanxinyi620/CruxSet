import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'

describe('edge bootstrap', () => {
  it('reports an explicit unavailable response without D1', async () => {
    const response = await worker.fetch(new Request('https://cruxset.example/api/v1/bootstrap'), { ASSETS: {} as Fetcher }, {} as never)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } })
  })
})
