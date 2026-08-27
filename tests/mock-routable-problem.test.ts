import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

it('rejects a route against an unpublished Layout', async () => {
  const repo = createMockRepository()
  const [wall] = await repo.listMyWalls()
  const [layout] = await repo.listLayouts(wall.id)
  await expect(repo.createProblem(wall.id, layout.id, {})).rejects.toThrow('LAYOUT_NOT_ROUTABLE')
})
