import { expect, it, vi } from 'vitest'
import { ApiSession } from '../web/src/data/api-session.js'
import type { Hold, ProblemHolds, Wall } from '../miniprogram/domain/types.js'

const wall = (patch: Partial<Wall> = {}): Wall => ({ id: 'wall_1', name: 'Test wall', description: '', imageFileId: 'mock://wall', imageWidth: 100, imageHeight: 200, geometryType: 'circle', holds: [], angleOptions: [20, 25], ownerId: 'usr_admin', visibility: 'private', createdAt: 0, updatedAt: 0, ...patch })
const fixture = () => {
  const api = {
    currentUser: vi.fn().mockResolvedValue({ id: 'usr_admin', isAdmin: true }),
    loadBrowseData: vi.fn().mockResolvedValue({ walls: [wall()], problems: [] }),
    createWall: vi.fn().mockResolvedValue(wall({ id: 'wall_2' })),
    saveWallHolds: vi.fn().mockResolvedValue({ wall: wall() }),
    publishWall: vi.fn().mockResolvedValue({ wall: wall({ visibility: 'public' }) }),
    createProblem: vi.fn().mockResolvedValue({ problem: { id: 'problem_1', number: 'CS-000125' } }),
    deleteProblem: vi.fn().mockResolvedValue({ ok: true }), deleteWall: vi.fn().mockResolvedValue({ ok: true }),
  }
  return { api, session: new ApiSession(api as any) }
}
const holds: Hold[] = [{ id: 'H001', x: .1, y: .2, radius: .03, kind: 'hold' }]

it('routes wall creation, hold saves, and publishing through the flat API', async () => {
  const { api, session } = fixture(); const image = new File(['image'], 'wall.jpg', { type: 'image/jpeg' })
  await session.createWall({ name: 'New wall', image, imageWidth: 100, imageHeight: 200 })
  await session.publishWall('wall_1', holds)
  expect(api.createWall).toHaveBeenCalledWith({ name: 'New wall', image, imageWidth: 100, imageHeight: 200 })
  expect(api.saveWallHolds).toHaveBeenLastCalledWith('wall_1', holds)
  expect(api.saveWallHolds.mock.invocationCallOrder.at(-1)).toBeLessThan(api.publishWall.mock.invocationCallOrder[0])
  expect(api.publishWall).toHaveBeenCalledWith('wall_1')
})

it('lists only walls owned by the authenticated user', async () => {
  const { api, session } = fixture()
  api.loadBrowseData.mockResolvedValue({ walls: [wall(), wall({ id: 'wall_foreign', ownerId: 'usr_other', visibility: 'public' })], problems: [] })
  await session.refresh()
  await expect(session.listMyWalls()).resolves.toEqual([expect.objectContaining({ id: 'wall_1' })])

  api.currentUser.mockResolvedValue(null)
  await session.refresh()
  await expect(session.listMyWalls()).resolves.toEqual([])
})

it('defensively clones API data on ingest and return', async () => {
  const { api, session } = fixture()
  const source = wall({ visibility: 'public', holds: [...holds] })
  api.loadBrowseData.mockResolvedValue({ walls: [source], problems: [{ id: 'problem_1', wallId: 'wall_1', angle: 20, grade: 'V0' }] })
  await session.refresh()
  source.name = 'mutated source'
  const listed = await session.listWalls(); listed[0].name = 'mutated return'; listed[0].holds[0].x = .9
  const problems = await session.listProblems(); problems[0].grade = 'V9'
  await expect(session.getWall('wall_1')).resolves.toMatchObject({ name: 'Test wall', holds: [{ x: .1 }] })
  await expect(session.listProblems()).resolves.toEqual([expect.objectContaining({ grade: 'V0' })])
})

it('refreshes saved holds into cache when publication fails', async () => {
  const { api, session } = fixture()
  api.publishWall.mockRejectedValue(new Error('WALL_NOT_ROUTABLE'))
  api.loadBrowseData.mockResolvedValue({ walls: [wall({ holds })], problems: [] })
  await expect(session.publishWall('wall_1', holds)).rejects.toThrow('WALL_NOT_ROUTABLE')
  expect(api.saveWallHolds).toHaveBeenCalledWith('wall_1', holds)
  await expect(session.getWall('wall_1')).resolves.toMatchObject({ holds })
})

it('routes problem creation through the API without layout fields', async () => {
  const { api, session } = fixture()
  const result = await session.createProblem('wall_1', { angle: 25, grade: 'V1', footRule: 'specified', holds: { start: ['H001'], finish: ['H002'] } as ProblemHolds })
  expect(api.createProblem).toHaveBeenCalledWith({ wallId: 'wall_1', angle: 25, grade: 'V1', footRule: 'specified', name: undefined, description: undefined, holds: { start: ['H001'], finish: ['H002'] } })
  expect(result).toEqual({ id: 'problem_1', number: 'CS-000125' })
})

it('keeps cached walls and problems when deleting an in-use wall fails', async () => {
  const { api, session } = fixture()
  api.loadBrowseData.mockResolvedValue({ walls: [wall({ visibility: 'public' })], problems: [{ id: 'problem_1', wallId: 'wall_1' }] }); await session.refresh()
  api.deleteWall.mockRejectedValue(new Error('WALL_IN_USE'))
  await expect(session.deleteWall('wall_1')).rejects.toThrow('WALL_IN_USE')
  await expect(session.getWall('wall_1')).resolves.toMatchObject({ id: 'wall_1' }); await expect(session.listProblems({ wallId: 'wall_1' })).resolves.toHaveLength(1)
  expect(api.loadBrowseData).toHaveBeenCalledTimes(1)
})

it('returns a literal successful result when deleting a wall', async () => {
  const { session } = fixture()
  const result: { ok: true } = await session.deleteWall('wall_1')
  expect(result).toEqual({ ok: true })
})
