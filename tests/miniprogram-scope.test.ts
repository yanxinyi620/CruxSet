import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

it('registers only public wall and route pages for ordinary mini-program navigation', () => {
  const config = JSON.parse(read('miniprogram/app.json'))

  expect(config.pages).not.toContain('pages/create/drafts/index')
  expect(config.pages).not.toContain('pages/admin/index')
  expect(config.pages).not.toContain('pages/admin/wall-editor/index')
  expect(config.pages).toContain('pages/walls/index')
  expect(config.pages).toContain('pages/wall-picker/index')
  expect(config.pages).toContain('pages/problem/editor/index')
  expect(config.pages).toContain('pages/me/problems/index')
})

it('keeps the Create page limited to creating a route', () => {
  const source = read('miniprogram/pages/create/index.ts') + read('miniprogram/pages/create/index.wxml')

  expect(source).toContain('createProblem')
  expect(source).toContain('/pages/wall-picker/index?mode=create')
  expect(source).not.toMatch(/createWall|openDrafts|pages\/admin\/index|pages\/create\/drafts/)
})

it('does not expose removed wall draft or hold-annotation navigation handlers', () => {
  const source = [
    read('miniprogram/pages/create/index.ts'),
    read('miniprogram/pages/create/index.wxml'),
    read('miniprogram/pages/me/index.ts'),
    read('miniprogram/pages/me/index.wxml'),
  ].join('\n')

  expect(source).not.toMatch(/pages\/create\/drafts|pages\/admin\/index|pages\/admin\/wall-editor/)
  expect(source).not.toMatch(/createWall|openDrafts|resumeDraft|annotateWall/)
})

it('keeps administrator wall management reachable from My for later admin gating', () => {
  const source = read('miniprogram/pages/me/index.ts') + read('miniprogram/pages/me/index.wxml')

  expect(source).toContain('openWalls')
  expect(source).toContain('/pages/me/walls/index')
  expect(source).toContain('openProblems')
  expect(source).toContain('/pages/me/problems/index')
})
