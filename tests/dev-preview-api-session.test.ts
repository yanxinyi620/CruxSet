import { expect, it, vi } from 'vitest'
import { ApiSession } from '../web/src/data/api-session.js'
import type { Hold, ProblemHolds } from '../miniprogram/domain/types.js'

const fixture = () => {
  const walls = [{ id: 'wall_1', name: 'Test wall', visibility: 'public', ownerId: 'usr_admin', angleOptions: [20, 25], activeLayoutId: '', description: '', createdAt: 0, updatedAt: 0 }]
  const layouts = [{ id: 'layout_1', wallId: 'wall_1', name: '2026-08', imageFileId: 'mock://wall', imageWidth: 100, imageHeight: 200, geometryType: 'circle', version: 2, published: false, holds: [], createdAt: 0, updatedAt: 0 }]
  const api = {
    loadBrowseData: vi.fn().mockResolvedValue({ walls, layouts, problems: [] }),
    createLayout: vi.fn().mockResolvedValue({ layout: { ...layouts[0], id: 'layout_2', version: 1 } }),
    saveLayoutHolds: vi.fn().mockResolvedValue({ layout: layouts[0] }),
    publishLayout: vi.fn().mockResolvedValue({ layout: { ...layouts[0], published: true } }),
    createProblem: vi.fn().mockResolvedValue({ problem: { id: 'problem_1', number: 'CS-000125' } }),
    deleteProblem: vi.fn().mockResolvedValue({ ok: true }),
    deleteLayout: vi.fn().mockResolvedValue({ ok: true }),
    deleteWall: vi.fn().mockResolvedValue({ ok: true }),
  }
  return { api, session: new ApiSession(api as any) }
}

const holds: Hold[] = [{ id: 'H001', x: 0.1, y: 0.2, radius: 0.03, kind: 'hold' }]

it('routes draft layout saves through the API instead of the Mock repository', async () => {
  const { api, session } = fixture()
  await session.updateLayout('wall_1', 'layout_1', holds)
  expect(api.saveLayoutHolds).toHaveBeenCalledWith('layout_1', holds)
})

it('routes draft layout publishing through the API and refreshes the cache', async () => {
  const { api, session } = fixture()
  const layout = await session.publishLayout('wall_1', 'layout_1', holds)
  expect(api.publishLayout).toHaveBeenCalledWith('layout_1', holds)
  expect(layout.published).toBe(false)
  expect(api.loadBrowseData).toHaveBeenCalled()
})

it('routes problem creation through the API with mapped fields', async () => {
  const { api, session } = fixture()
  const result = await session.createProblem('wall_1', 'layout_1', { angle: 25, grade: 'V1', footRule: 'specified', holds: { start: ['H001'], finish: ['H002'] } as ProblemHolds })
  expect(api.createProblem).toHaveBeenCalledWith({
    wallId: 'wall_1', layoutId: 'layout_1', angle: 25, grade: 'V1', footRule: 'specified',
    name: undefined, description: undefined, holds: { start: ['H001'], finish: ['H002'] },
  })
  expect(result).toEqual({ id: 'problem_1', number: 'CS-000125' })
})

it('routes problem, layout, and wall deletion through the API', async () => {
  const { api, session } = fixture()
  await session.deleteProblem('problem_1')
  await session.deleteLayout('wall_1', 'layout_1')
  await session.deleteWall('wall_1')
  expect(api.deleteProblem).toHaveBeenCalledWith('problem_1')
  expect(api.deleteLayout).toHaveBeenCalledWith('layout_1')
  expect(api.deleteWall).toHaveBeenCalledWith('wall_1')
})

it('routes layout creation through the API', async () => {
  const { api, session } = fixture()
  await session.createLayout('wall_1', { name: '2026-09', imageFileId: 'mock://wall', imageWidth: 100, imageHeight: 200 })
  expect(api.createLayout).toHaveBeenCalledWith('wall_1', { name: '2026-09', imageFileId: 'mock://wall', imageWidth: 100, imageHeight: 200 })
})