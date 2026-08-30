import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('uses a dedicated My Drafts page from the creation hub', () => {
  const config = JSON.parse(readFileSync(resolve('miniprogram/app.json'), 'utf8'))
  expect(config.pages).toContain('pages/create/drafts/index')
  expect(readFileSync(resolve('miniprogram/pages/create/index.wxml'), 'utf8')).toContain('bindtap="openDrafts"')
  expect(existsSync(resolve('miniprogram/pages/create/drafts/index.wxml'))).toBe(true)
  const source = readFileSync(resolve('miniprogram/pages/create/drafts/index.ts'), 'utf8')
  expect(source).toContain("wall.visibility === 'private'")
  expect(source).toContain('/pages/admin/wall-editor/index?wallId=')
  expect(source).not.toMatch(/layoutId|listLayouts|draftLayoutsForWalls/)
})

it('registers only wall routes and passes only wallId', () => {
  const config = readFileSync(resolve('miniprogram/app.json'), 'utf8')
  const pages = readFileSync(resolve('miniprogram/pages/create/index.ts'), 'utf8') + readFileSync(resolve('miniprogram/pages/walls/index.ts'), 'utf8')
  expect(config).toContain('pages/wall-picker/index')
  expect(config).toContain('pages/admin/wall-editor/index')
  expect(config).not.toMatch(/layout-picker|layout-editor|layout-create/)
  expect(pages).not.toMatch(/layoutId/)
})

it('uses private walls as drafts in the web creation flow', () => {
  const source = readFileSync(resolve('web/src/main.ts'), 'utf8')
  expect(source).toContain("wall.visibility === 'private'")
  expect(source).toContain("name: 'wall-editor', wallId")
  expect(source).not.toContain('layoutName')
})
