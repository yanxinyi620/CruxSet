import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('uses a custom three-tab navigation component with the product labels', () => {
  const config = JSON.parse(readFileSync(resolve('wechat/miniprogram/app.json'), 'utf8'))
  expect(config.tabBar.custom).toBe(true)
  const component = readFileSync(resolve('wechat/miniprogram/custom-tab-bar/index.ts'), 'utf8')
  expect(component).toContain('线路')
  expect(component).toContain('创建')
  expect(component).toContain('我的')
  expect(existsSync(resolve('wechat/miniprogram/custom-tab-bar/index.wxss'))).toBe(true)
})
