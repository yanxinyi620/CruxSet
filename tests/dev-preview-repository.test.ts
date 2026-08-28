import { describe, expect, it } from 'vitest'
import { PreviewSession } from '../web/src/data/preview-session.js'

describe('PreviewSession', () => {
  it('creates a wall and restores seeded data after reset', async () => {
    const session = new PreviewSession()
    const created = await session.createWall({ name: '测试墙面', visibility: 'public' })
    expect((await session.getWall(created.id)).visibility).toBe('public')
    session.reset()
    await expect(session.getWall(created.id)).rejects.toThrow('WALL_NOT_FOUND')
  })
})
