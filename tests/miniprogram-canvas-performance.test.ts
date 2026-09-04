import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'

test('wall canvas caches the loaded image and avoids repeated image creation', () => {
  const source = readFileSync('wechat/miniprogram/components/wall-canvas/index.ts', 'utf8')
  expect(source).toContain('this.loadedImage')
  expect(source).toContain('this.loadingImage')
  expect(source).toContain('this.imageFile')
  expect(source).toContain('Object.keys(active).reduce')
})
