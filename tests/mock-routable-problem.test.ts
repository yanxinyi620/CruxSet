import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

it('rejects a route against an unpublished Layout', async () => {
  const repo = createMockRepository()
  const [wall] = await repo.listMyWalls()
  const [layout] = await repo.listLayouts(wall.id)
  await expect(repo.createProblem(wall.id, layout.id, {})).rejects.toThrow('LAYOUT_NOT_ROUTABLE')
})

it('allows routes on every published Layout, not only the most recently published one', async () => {
  const repo = createMockRepository()
  const [wall] = await repo.listMyWalls()
  const published = (await repo.listLayouts(wall.id)).find(layout => layout.published)!
  const nextDraft = await repo.createLayout(wall.id, {
    name: '2026-10 标注草稿',
    imageFileId: '/assets/mock/ritan-spraywall-0822.jpg',
    imageWidth: 4096,
    imageHeight: 3072,
  })
  await repo.publishLayout(wall.id, nextDraft.id, [
    { id: 'H101', x: 0.2, y: 0.2, radius: 0.02, kind: 'hold' },
    { id: 'H102', x: 0.3, y: 0.3, radius: 0.02, kind: 'hold' },
  ])

  await expect(repo.createProblem(wall.id, published.id, {
    holds: { start: ['H001'], foot: [], hand: [], assist: [], finish: ['H002'] },
  })).resolves.toMatchObject({ id: expect.any(String) })
  await expect(repo.createProblem(wall.id, nextDraft.id, {
    holds: { start: ['H101'], foot: [], hand: [], assist: [], finish: ['H102'] },
  })).resolves.toMatchObject({ id: expect.any(String) })
})
