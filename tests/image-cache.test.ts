import { afterEach, expect, it, vi } from 'vitest'
import { loadCachedImage, resetImageCacheForTests } from '../web/src/image-cache.js'

class FakeImage {
  static instances: FakeImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''

  constructor() { FakeImage.instances.push(this) }
}

afterEach(() => {
  resetImageCacheForTests()
  FakeImage.instances = []
  vi.unstubAllGlobals()
})

it('shares one pending load for the same image URL', () => {
  vi.stubGlobal('Image', FakeImage)

  const first = loadCachedImage('/api/v1/media/wall.jpg')
  const second = loadCachedImage('/api/v1/media/wall.jpg')

  expect(first).toBe(second)
  expect(FakeImage.instances).toHaveLength(1)
})

it('evicts a failed image load so a later render can retry it', async () => {
  vi.stubGlobal('Image', FakeImage)

  const failed = loadCachedImage('/api/v1/media/wall.jpg')
  FakeImage.instances[0].onerror?.()
  await expect(failed).rejects.toThrow('IMAGE_LOAD_FAILED')

  loadCachedImage('/api/v1/media/wall.jpg')
  expect(FakeImage.instances).toHaveLength(2)
})
