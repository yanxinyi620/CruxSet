import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
test('editor matches Web layout without hold id grid', () => {
  const wxml = readFileSync('wechat/miniprogram/pages/problem/editor/index.wxml','utf8')
  expect(wxml).toContain('route-options'); expect(wxml).toContain('role-toolbar'); expect(wxml).not.toContain('hold-grid'); expect(wxml).toContain('撤销')
})
