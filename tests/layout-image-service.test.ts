import { expect, it, vi } from 'vitest'

vi.mock('../miniprogram/services/cloud.js', () => ({
  call: vi.fn(),
  normalizeCloudError: (error: unknown) => error,
}))

import { call } from '../miniprogram/services/cloud.js'
import { getLayoutImageUrl } from '../miniprogram/services/layouts.js'

it('requests a guarded temporary URL for a cloud layout image', async () => {
  vi.mocked(call).mockResolvedValueOnce({ url: 'https://temporary.example/layout.jpg' })
  await expect(getLayoutImageUrl('cloud://env/layout.jpg')).resolves.toBe('https://temporary.example/layout.jpg')
  expect(call).toHaveBeenCalledWith('getLayoutImageUrl', { fileID: 'cloud://env/layout.jpg' })
})
