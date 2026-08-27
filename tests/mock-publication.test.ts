import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

it('locks a published mock layout and allows a separate replacement layout', async () => {
  const repo = createMockRepository()
  const { id: wallId } = await repo.createWall({ name: '私有训练墙' })
  const wall = await repo.getWall(wallId)
  const draft = await repo.createLayout(wall.id, { name: '草稿', imageFileId: '/assets/mock/ritan-spraywall-0822.jpg', imageWidth: 4096, imageHeight: 3072 })
  await repo.publishLayout(wall.id, draft.id, [])
  expect((await repo.getWall(wall.id)).visibility).toBe('public')
  await expect(repo.publishLayout(wall.id, draft.id, [])).rejects.toThrow('LAYOUT_LOCKED')
  const replacement = await repo.createLayout(wall.id, { name: 'replacement', imageFileId: '/assets/mock/ritan-spraywall-0822.jpg', imageWidth: 4096, imageHeight: 3072 })
  expect(replacement.id).not.toBe(draft.id)
  expect(replacement.published).toBe(false)
})
