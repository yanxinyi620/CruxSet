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
  expect(data).toContain("imageFileId: 'cloud://")
  expect(data).toContain('source:')
  expect(data).toContain('experimentId:')
  expect(data).toContain('calibrationId:')
  expect(data).toContain('publishRequestId:')
  expect(repository).toContain('demoPolygonWall')
})

it('renders owner actions in the detail template and keeps my routes navigable', () => {
  const list = read('miniprogram/pages/me/problems/index.ts') + read('miniprogram/pages/me/problems/index.wxml')
  const detail = read('miniprogram/pages/problem/detail/index.wxml')
  expect(list).toContain('open')
  expect(list).toContain('edit')
  expect(list).toContain('/pages/problem/editor/index?problemId=')
  expect(detail).toContain('编辑线路')
  expect(detail).toContain('删除线路')
})

it('maps editor save failures instead of showing a fixed generic message', () => {
  const editor = read('miniprogram/pages/problem/editor/index.ts')
  expect(editor).toContain('cloudErrorMessage(error)')
  expect(editor).not.toContain("title:'保存失败，草稿已保留'")
})

it('blocks saving and shows a recovery action when editor loading fails', () => {
  const editor = read('miniprogram/pages/problem/editor/index.ts')
  const template = read('miniprogram/pages/problem/editor/index.wxml')
  expect(editor).toContain('loadError')
  expect(editor).toContain('navigateBack')
  expect(editor).toMatch(/save\(\)[\s\S]*loadError/)
  expect(template).toContain('{{error}}')
  expect(template).toContain('返回')
  expect(template).toMatch(/disabled="{{[^}]*loadError/)
})

it('reuses the loaded problem while entering edit mode', () => {
  const editor = read('miniprogram/pages/problem/editor/index.ts')
  expect(editor).toContain('const loadedProblem')
  expect(editor).not.toMatch(/problemId\)[\s\S]*getProblem\(problemId\)[\s\S]*getProblem\(problemId\)/)
})

it('prevents duplicate route submissions while saving', () => {
  const editor = read('miniprogram/pages/problem/editor/index.ts')
  const template = read('miniprogram/pages/problem/editor/index.wxml')
  expect(editor).toContain('saving')
  expect(editor).toMatch(/save\(\)[\s\S]*saving[);][\s\S]*finally/)
  expect(template).toMatch(/disabled="{{[^}]*saving/)
  expect(template).toContain('loading="{{saving}}"')
})
