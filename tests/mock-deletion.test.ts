import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

const holds = [
  { id: 'H001', x: .1, y: .1, radius: .02, kind: 'hold' },
  { id: 'H002', x: .2, y: .2, radius: .02, kind: 'hold' },
] as any

it('deletes an owned published Layout and its routes', async () => {
  const repo = createMockRepository()
  const [wall] = await repo.listMyWalls()
  const [layout] = await repo.listLayouts(wall.id)
  await repo.publishLayout(wall.id, layout.id, holds)
  await repo.createProblem(wall.id, layout.id, { angle: 20, grade: 'V0', holds: { start: ['H001'], foot: [], hand: [], assist: [], finish: ['H002'] } })
  await repo.deleteLayout(wall.id, layout.id)
  await expect(repo.getLayout(layout.id)).rejects.toThrow('LAYOUT_NOT_FOUND')
  expect(await repo.listProblems({ layoutId: layout.id })).toEqual([])
})

it('deletes an owned wall together with layouts and routes', async () => {
  const repo = createMockRepository()
  const [wall] = await repo.listMyWalls()
  await repo.deleteWall(wall.id)
  await expect(repo.getWall(wall.id)).rejects.toThrow('WALL_NOT_FOUND')
  expect(await repo.listProblems({ wallId: wall.id })).toEqual([])
})

it('rejects another owner wall deletion', async () => {
  const repo = createMockRepository()
  ;(repo as any).walls.push({ id: 'foreign', ownerId: 'another-user', visibility: 'private' })
  await expect(repo.deleteWall('foreign')).rejects.toThrow('FORBIDDEN')
})
