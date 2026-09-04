import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
test('public wall pages do not render demo walls before remote data', () => {
  expect(readFileSync('wechat/miniprogram/pages/walls/index.ts','utf8')).not.toContain('Array(24)')
  expect(readFileSync('wechat/miniprogram/pages/wall/index.ts','utf8')).toContain('wall: null')
})
