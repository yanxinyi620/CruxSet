import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

it('publishes a routable wall and locks it', async () => {
  const repo = createMockRepository()
  const { id: wallId } = await repo.createWall({ name: '私有训练墙' })
  await expect(repo.publishWall(wallId)).rejects.toThrow('WALL_NOT_ROUTABLE')
  await repo.updateWall(wallId, { holds: [{ id: 'H1', x: .1, y: .1, radius: .02, kind: 'hold' }, { id: 'H2', x: .2, y: .2, radius: .02, kind: 'hold' }] } as any)
  expect((await repo.publishWall(wallId)).visibility).toBe('public')
  await expect(repo.updateWall(wallId, { name: 'locked' })).rejects.toThrow('WALL_LOCKED')
})
