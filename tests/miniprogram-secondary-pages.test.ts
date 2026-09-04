import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
test('detail and editor expose the Web-aligned visual structure', () => {
  const detail = readFileSync('wechat/miniprogram/pages/problem/detail/index.wxml','utf8')
  const editor = readFileSync('wechat/miniprogram/pages/problem/editor/index.wxss','utf8')
  expect(detail).toContain('线路详情'); expect(detail).toContain('legend-dot'); expect(detail).toContain('route-note')
  expect(editor).toContain('#6046d6'); expect(editor).toContain('canvas-wrap')
})
