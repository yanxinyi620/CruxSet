import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'

test('custom tab bar synchronizes the active tab and normalizes click indexes', () => {
  const source = readFileSync('wechat/miniprogram/custom-tab-bar/index.ts', 'utf8')
  expect(source).toContain('attached() { this.syncSelected() }')
  expect(source).toContain('const index = Number(event.currentTarget.dataset.index)')
  expect(source).toContain('this.setData({ selected: index })')
  expect(source).toContain('wx.switchTab({')
  expect(source).toContain('success: () => this.setData({ selected: index })')
  expect(source).not.toContain('.at(-1)')
})
