import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'

function database(rows: Record<string, unknown>[]): D1Database {
  return { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) } as unknown as D1Database
}

describe('browse API', () => {
  it('returns public walls with a bounded page', async () => {
    const response = await worker.fetch(new Request('https://cruxset.example/api/v1/walls?limit=1'), { ASSETS: {} as Fetcher, DB: database([{ id: 'w1', wall_number: 1, name: 'Wall', description: '', image_path: 'wall.webp', image_width: 100, image_height: 80, geometry_type: 'circle', angle_options_json: '[20,30]', created_at: 10, updated_at: 10 }, { id: 'w2', created_at: 9 }]) }, {} as never)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ walls: [{ id: 'w1', angleOptions: [20, 30] }], nextCursor: expect.any(String) })
  })

  it('rejects malformed cursors', async () => {
    const response = await worker.fetch(new Request('https://cruxset.example/api/v1/problems?cursor=bad'), { ASSETS: {} as Fetcher, DB: database([]) }, {} as never)
    expect(response.status).toBe(400)
  })
})
