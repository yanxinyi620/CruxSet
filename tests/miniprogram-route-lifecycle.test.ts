import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

it('lets route owners open the editor and delete from route detail', () => {
  const detail = read('miniprogram/pages/problem/detail/index.ts') + read('miniprogram/pages/problem/detail/index.wxml')
  expect(detail).toContain('currentUserId')
  expect(detail).toContain('deleteProblem')
  expect(detail).toContain('/pages/problem/editor/index?problemId=')
  expect(detail).toContain('wx:if="{{isOwner}}"')
})

it('uses the stable cloud error mapper in route lifecycle pages', () => {
  const sources = [
    read('miniprogram/pages/me/problems/index.ts'),
    read('miniprogram/pages/problem/detail/index.ts'),
    read('miniprogram/pages/problem/editor/index.ts'),
  ].join('\n')
  expect(sources).toContain('cloudErrorMessage')
  expect(sources).not.toContain("error.message||'加载失败，请稍后重试'")
})

it('includes a public polygon wall fixture in the browse repository', () => {
  const data = read('miniprogram/data/demo.ts')
  const repository = read('miniprogram/services/mock-repository.ts')
  expect(data).toContain('demoPolygonWall')
  expect(data).toContain("geometryType: 'polygon'")
  expect(data).toContain('polygon:')
  expect(repository).toContain('demoPolygonWall')
})

it('renders owner actions in the detail template and keeps my routes navigable', () => {
  const list = read('miniprogram/pages/me/problems/index.ts') + read('miniprogram/pages/me/problems/index.wxml')
  const detail = read('miniprogram/pages/problem/detail/index.wxml')
  expect(list).toContain('open')
  expect(detail).toContain('编辑线路')
  expect(detail).toContain('删除线路')
})
