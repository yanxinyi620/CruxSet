import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('uses a dedicated My Drafts page from the creation hub', () => {
  const config = JSON.parse(readFileSync(resolve('miniprogram/app.json'), 'utf8'))
  expect(config.pages).toContain('pages/create/drafts/index')
  expect(readFileSync(resolve('miniprogram/pages/create/index.wxml'), 'utf8')).toContain('bindtap="openDrafts"')
  expect(existsSync(resolve('miniprogram/pages/create/drafts/index.wxml'))).toBe(true)
})

it('uses private walls as drafts in the web creation flow', () => {
  const source = readFileSync(resolve('web/src/main.ts'), 'utf8')
  expect(source).toContain("wall.visibility === 'private'")
  expect(source).toContain("name: 'wall-editor', wallId")
  expect(source).not.toContain('layoutName')
})
