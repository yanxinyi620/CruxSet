import { expect, it } from 'vitest'
import { createMockRepository } from '../wechat/miniprogram/services/mock-repository.js'

it('rejects a route against a private wall', async () => {
  const repo = createMockRepository()
  const wall = (await repo.listMyWalls()).find(item => item.visibility === 'private')!
  await expect(repo.createProblem(wall.id, {})).rejects.toThrow('WALL_NOT_ROUTABLE')
})

it('allows routes on a published wall with two holds', async () => {
  const repo = createMockRepository()
  const wall = (await repo.listMyWalls()).find(item => item.visibility === 'private')!
  await repo.updateWall(wall.id, { holds: [
    { id: 'H101', x: 0.2, y: 0.2, radius: 0.02, kind: 'hold' },
    { id: 'H102', x: 0.3, y: 0.3, radius: 0.02, kind: 'hold' },
  ] } as any)
  await repo.publishWall(wall.id)
  await expect(repo.createProblem(wall.id, {
    holds: { start: ['H101'], foot: [], hand: [], assist: [], finish: ['H102'] },
  })).resolves.toMatchObject({ id: expect.any(String) })
})
