import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
test('editor matches Web layout without hold id grid', () => {
  const wxml = readFileSync('wechat/miniprogram/pages/problem/editor/index.wxml','utf8')
  expect(wxml).toContain('route-options'); expect(wxml).toContain('role-toolbar'); expect(wxml).not.toContain('hold-grid'); expect(wxml).toContain('撤销')
})

test('editor hides the redundant role legend while route detail keeps it', () => {
  const editorStyles = readFileSync('wechat/miniprogram/pages/problem/editor/index.wxss', 'utf8')
  const detail = readFileSync('wechat/miniprogram/pages/problem/detail/index.wxml', 'utf8')
  expect(editorStyles).toContain('.editor .legend{display:none}')
  expect(detail).toContain('class="legend"')
})

test('editor defers route metadata to a preview confirmation dialog', () => {
  const template = readFileSync('wechat/miniprogram/pages/problem/editor/index.wxml', 'utf8')
  const source = readFileSync('wechat/miniprogram/pages/problem/editor/index.ts', 'utf8')
  expect(template).not.toContain('class="card fields"')
  expect(template).toContain('save-dialog')
  expect(template).toContain('保存预览')
  expect(template).toContain('wx:if="{{!saveDialogVisible}}" class="canvas-wrap"')
  expect(source).toContain('saveDialogVisible')
  expect(source).toContain('!this.data.selected.start.length')
  expect(source).toContain('confirmSave')
})

test('starts a new route with the Start role selected', () => {
  const source = readFileSync('wechat/miniprogram/pages/problem/editor/index.ts', 'utf8')
  expect(source).toContain("selectedRole: 'start'")
})

test('successful new route save reopens a clean editor for the same wall', () => {
  const source = readFileSync('wechat/miniprogram/pages/problem/editor/index.ts', 'utf8')
  expect(source).toContain("wx.redirectTo({ url: `/pages/problem/editor/index?wallId=${encodeURIComponent(wallId)}` })")
})
