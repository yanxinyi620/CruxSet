import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

test('custom tab bar normalizes click indexes and restores its state after a failed switch', () => {
  const source = readFileSync('wechat/miniprogram/custom-tab-bar/index.ts', 'utf8')
  expect(source).toContain('attached() { this.syncSelected() }')
  expect(source).toContain('const index = Number(event.currentTarget.dataset.index)')
  expect(source).toContain('this.setData({ selected: index })')
  expect(source).toContain('wx.switchTab({')
  expect(source).toContain('fail: () => this.syncSelected()')
  expect(source).not.toContain('success: () => this.setData({ selected: index })')
  expect(source).not.toContain('.at(-1)')
})

test('each tab page synchronizes the custom tab bar when it becomes visible', () => {
  for (const [page, selected] of [
    ['walls', 0],
    ['create', 1],
    ['me', 2],
  ]) {
    const file = `wechat/miniprogram/pages/${page}/index.ts`
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain(`syncTabBar(this, ${selected})`)
  }
})

test('primary navigation and page headings use compact title sizing', () => {
  const tabbar = readFileSync('wechat/miniprogram/custom-tab-bar/index.wxss', 'utf8')
  const app = readFileSync('wechat/miniprogram/app.wxss', 'utf8')
  expect(tabbar).toContain('font-size:32rpx')
  expect(app).toContain('.page-title,.title')
  expect(app).toContain('font-size:46rpx')
})
