import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

it('creates a fresh draft wall with the local wall image for each repository', async () => {
  const first = createMockRepository()
  const second = createMockRepository()
  const [wall] = await first.listMyWalls()
  const [layout] = await first.listLayouts(wall.id)
  expect(wall.name).toContain('日坛')
  expect(layout.published).toBe(false)
  expect(layout.imageFileId).toBe('/assets/mock/ritan-spraywall-0822.jpg')
  await first.updateWall(wall.id, { name: 'changed' })
  expect((await second.getWall(wall.id)).name).not.toBe('changed')
})
