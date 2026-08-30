import { expect, it, vi } from 'vitest'
import { ApiSession } from '../web/src/data/api-session.js'
import type { Hold, ProblemHolds, Wall } from '../miniprogram/domain/types.js'

const wall = (patch: Partial<Wall> = {}): Wall => ({ id: 'wall_1', name: 'Test wall', description: '', imageFileId: 'mock://wall', imageWidth: 100, imageHeight: 200, geometryType: 'circle', holds: [], angleOptions: [20, 25], ownerId: 'usr_admin', visibility: 'private', createdAt: 0, updatedAt: 0, ...patch })
const fixture = () => {
  const api = {
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
  await session.updateWallHolds('wall_1', holds); await session.publishWall('wall_1')
  expect(api.createWall).toHaveBeenCalledWith({ name: 'New wall', image, imageWidth: 100, imageHeight: 200 })
  expect(api.saveWallHolds).toHaveBeenCalledWith('wall_1', holds); expect(api.publishWall).toHaveBeenCalledWith('wall_1')
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
