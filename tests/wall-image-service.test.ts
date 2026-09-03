import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../miniprogram/services/cloud.js', () => ({
  call: vi.fn(),
  normalizeCloudError: (error: unknown) => error,
}))

vi.mock('../miniprogram/config/runtime.js', () => ({
  isMockMode: () => false,
}))

import { call } from '../miniprogram/services/cloud.js'
import { getWallImageUrl } from '../miniprogram/services/walls.js'

beforeEach(() => vi.mocked(call).mockReset())

it('requests a guarded temporary URL for a cloud wall image', async () => {
  vi.mocked(call).mockResolvedValueOnce({ url: 'https://temporary.example/layout.jpg' })
  await expect(getWallImageUrl('cloud://env/wall.jpg')).resolves.toBe('https://temporary.example/layout.jpg')
  expect(call).toHaveBeenCalledWith('getWallImageUrl', { fileID: 'cloud://env/wall.jpg' })
  expect(call).not.toHaveBeenCalledWith('getLayoutImageUrl', expect.anything())
})
