import { expect, it } from 'vitest'
import { createMockRepository } from '../wechat/miniprogram/services/mock-repository.js'

it('creates a fresh draft wall with the local wall image for each repository', async () => {
  const first = createMockRepository()
  const second = createMockRepository()
  const wall = (await first.listMyWalls()).find(item => item.visibility === 'private')!
  expect(wall.name).toContain('日坛')
  expect(wall.visibility).toBe('private')
  expect(wall.imageFileId).toBe('/assets/mock/ritan-spraywall-0822.jpg')
  expect('listLayouts' in first).toBe(false)
  await first.updateWall(wall.id, { name: 'changed' })
  expect((await second.getWall(wall.id)).name).not.toBe('changed')
})
