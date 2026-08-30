import { describe, expect, it } from 'vitest'
import { PreviewSession } from '../web/src/data/preview-session.js'

const createWall = (session: PreviewSession) => session.createWall({ name: '测试墙面', imageFileId: 'mock://new', imageWidth: 100, imageHeight: 200 })
const twoHolds = [{ id: 'H001', x: .1, y: .2, radius: .03, kind: 'hold' as const }, { id: 'H002', x: .2, y: .3, radius: .03, kind: 'hold' as const }]

describe('PreviewSession', () => {
  it('creates a complete private wall and restores seeded data after reset', async () => {
    const session = new PreviewSession(); const created = await createWall(session)
    await expect(session.getWall(created.id)).resolves.toMatchObject({ name: '测试墙面', imageFileId: 'mock://new', imageWidth: 100, imageHeight: 200, visibility: 'private', holds: [] })
    session.reset(); await expect(session.getWall(created.id)).rejects.toThrow('WALL_NOT_FOUND')
  })

  it('publishes a wall and creates problems directly against it', async () => {
    const session = new PreviewSession(); const created = await createWall(session)
    const published = await session.publishWall(created.id, twoHolds)
    expect(published).toMatchObject({ visibility: 'public', holds: twoHolds })
    expect(await session.createProblem(created.id, { holds: { start: ['H001'], foot: [], hand: [], assist: [], finish: ['H002'] } })).toMatchObject({ wallId: created.id })
  })

  it('refuses to delete a wall referenced by problems and preserves both', async () => {
    const session = new PreviewSession(); const created = await createWall(session)
    await session.publishWall(created.id, twoHolds); await session.createProblem(created.id, { holds: { start: ['H001'], foot: [], hand: [], assist: [], finish: ['H002'] } })
    await expect(session.deleteWall(created.id)).rejects.toThrow('WALL_IN_USE')
    await expect(session.getWall(created.id)).resolves.toMatchObject({ id: created.id }); await expect(session.listProblems({ wallId: created.id })).resolves.toHaveLength(1)
  })

  it('returns a literal successful result when deleting an unused wall', async () => {
    const session = new PreviewSession(); const created = await createWall(session)
    const result: { ok: true } = await session.deleteWall(created.id)
    expect(result).toEqual({ ok: true })
  })
})
