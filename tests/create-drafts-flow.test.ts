import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('removes the wall draft page from the mini-program creation hub', () => {
  const config = JSON.parse(readFileSync(resolve('wechat/miniprogram/app.json'), 'utf8'))
  expect(config.pages).not.toContain('pages/create/drafts/index')
  expect(readFileSync(resolve('wechat/miniprogram/pages/create/index.wxml'), 'utf8')).not.toContain('bindtap="openDrafts"')
  expect(existsSync(resolve('wechat/miniprogram/pages/create/drafts/index.wxml'))).toBe(true)
  const source = readFileSync(resolve('wechat/miniprogram/pages/create/drafts/index.ts'), 'utf8')
  expect(source).not.toMatch(/resumeDraft|listMyWalls|pages\/admin\/wall-editor/)
  expect(source).not.toMatch(/layoutId|listLayouts|draftLayoutsForWalls/)
})

it('registers only wall routes and passes only wallId', () => {
  const config = readFileSync(resolve('wechat/miniprogram/app.json'), 'utf8')
  const pages = readFileSync(resolve('wechat/miniprogram/pages/create/index.ts'), 'utf8') + readFileSync(resolve('wechat/miniprogram/pages/walls/index.ts'), 'utf8')
  expect(config).toContain('pages/wall-picker/index')
  expect(config).not.toContain('pages/admin/wall-editor/index')
  expect(config).not.toMatch(/layout-picker|layout-editor|layout-create/)
  expect(pages).not.toMatch(/layoutId/)
})

it('uses private walls as drafts in the web creation flow', () => {
  const source = readFileSync(resolve('web/src/main.ts'), 'utf8')
  expect(source).toContain("wall.visibility === 'private'")
  expect(source).toContain("name: 'wall-editor', wallId")
  expect(source).not.toContain('layoutName')
})
