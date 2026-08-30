import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../miniprogram/services/cloud.js', () => ({
  call: vi.fn(),
  normalizeCloudError: (error: unknown) => error,
}))

vi.mock('../miniprogram/config/runtime.js', () => ({
  isMockMode: () => false,
}))

import { call } from '../miniprogram/services/cloud.js'
import { createWall, getWallImageUrl, publishWall, updateWall } from '../miniprogram/services/walls.js'

beforeEach(() => vi.mocked(call).mockReset())

it('requests a guarded temporary URL for a cloud wall image', async () => {
  vi.mocked(call).mockResolvedValueOnce({ url: 'https://temporary.example/layout.jpg' })
  await expect(getWallImageUrl('cloud://env/wall.jpg')).resolves.toBe('https://temporary.example/layout.jpg')
  expect(call).toHaveBeenCalledWith('getWallImageUrl', { fileID: 'cloud://env/wall.jpg' })
  expect(call).not.toHaveBeenCalledWith('getLayoutImageUrl', expect.anything())
})

it('sends wall mutations to adminWall with an action/data envelope', async () => {
  vi.mocked(call).mockResolvedValue({ id: 'wall_1' })
  await createWall({ name: '训练墙' })
  await updateWall('wall_1', { description: '更新' })
  await publishWall('wall_1')
  expect(call).toHaveBeenNthCalledWith(1, 'adminWall', { action: 'createWall', data: { name: '训练墙' } })
  expect(call).toHaveBeenNthCalledWith(2, 'adminWall', { action: 'updateWall', data: { id: 'wall_1', description: '更新' } })
  expect(call).toHaveBeenNthCalledWith(3, 'adminWall', { action: 'publishWall', data: { id: 'wall_1' } })
  expect(vi.mocked(call).mock.calls.map(([name]) => name)).not.toContain('wallManager')
})
