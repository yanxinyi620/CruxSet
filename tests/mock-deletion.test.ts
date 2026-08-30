import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

const holds = [
  { id: 'H001', x: .1, y: .1, radius: .02, kind: 'hold' },
  { id: 'H002', x: .2, y: .2, radius: .02, kind: 'hold' },
] as any

it('refuses to delete a wall in use and does not cascade', async () => {
  const repo = createMockRepository()
  const wall = (await repo.listMyWalls()).find(item => item.visibility === 'private')!
  await repo.updateWall(wall.id, { holds } as any)
  await repo.publishWall(wall.id)
  await repo.createProblem(wall.id, { angle: 20, grade: 'V0', holds: { start: ['H001'], foot: [], hand: [], assist: [], finish: ['H002'] } })
  await expect(repo.deleteWall(wall.id)).rejects.toThrow('WALL_IN_USE')
  await expect(repo.getWall(wall.id)).resolves.toMatchObject({ id: wall.id })
  expect(await repo.listProblems({ wallId: wall.id })).toHaveLength(1)
})

it('deletes an unused owned wall and no problems', async () => {
  const repo = createMockRepository()
  const wall = await repo.createWall({ name: 'unused' })
  await repo.deleteWall(wall.id)
  await expect(repo.getWall(wall.id)).rejects.toThrow('WALL_NOT_FOUND')
  expect(await repo.listProblems({ wallId: wall.id })).toEqual([])
})

it('rejects another owner wall deletion', async () => {
  const repo = createMockRepository()
  ;(repo as any).walls.push({ id: 'foreign', ownerId: 'another-user', visibility: 'private' })
  await expect(repo.deleteWall('foreign')).rejects.toThrow('FORBIDDEN')
})
