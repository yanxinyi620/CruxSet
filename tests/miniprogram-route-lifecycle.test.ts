import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

it('keeps route ownership actions in My Routes rather than the public detail page', () => {
  const detail = read('wechat/miniprogram/pages/problem/detail/index.ts') + read('wechat/miniprogram/pages/problem/detail/index.wxml')
  const myRoutes = read('wechat/miniprogram/pages/me/problems/index.ts') + read('wechat/miniprogram/pages/me/problems/index.wxml')
  expect(detail).not.toContain('deleteProblem')
  expect(detail).not.toContain('wx:if="{{isOwner}}"')
  expect(myRoutes).toContain('deleteProblem')
  expect(myRoutes).toContain('/pages/problem/editor/index?problemId=')
})

it('uses the stable cloud error mapper in route lifecycle pages', () => {
  const sources = [
    read('wechat/miniprogram/pages/me/problems/index.ts'),
    read('wechat/miniprogram/pages/problem/detail/index.ts'),
    read('wechat/miniprogram/pages/problem/editor/index.ts'),
  ].join('\n')
  expect(sources).toContain('cloudErrorMessage')
  expect(sources).not.toContain("error.message||'加载失败，请稍后重试'")
})

it('imports the default ProblemEditor constructor in the route editor page', () => {
  const editor = read('wechat/miniprogram/pages/problem/editor/index.ts')
  expect(editor).toContain("import ProblemEditor from '../../../domain/editor.js'")
})

it('keeps My Routes navigable without duplicating owner actions in the detail template', () => {
  const list = read('wechat/miniprogram/pages/me/problems/index.ts') + read('wechat/miniprogram/pages/me/problems/index.wxml')
  const detail = read('wechat/miniprogram/pages/problem/detail/index.wxml')
  expect(list).toContain('open')
  expect(list).toContain('edit')
  expect(list).toContain('/pages/problem/editor/index?problemId=')
  expect(detail).not.toContain('编辑线路')
  expect(detail).not.toContain('删除线路')
})

it('maps editor save failures instead of showing a fixed generic message', () => {
  const editor = read('wechat/miniprogram/pages/problem/editor/index.ts')
  expect(editor).toContain('cloudErrorMessage(error)')
  expect(editor).not.toContain("title:'保存失败，草稿已保留'")
})

it('blocks saving and shows a recovery action when editor loading fails', () => {
  const editor = read('wechat/miniprogram/pages/problem/editor/index.ts')
  const template = read('wechat/miniprogram/pages/problem/editor/index.wxml')
  expect(editor).toContain('loadError')
  expect(editor).toContain('navigateBack')
  expect(editor).toMatch(/save\(\)[\s\S]*loadError/)
  expect(template).toContain('{{error}}')
  expect(template).toContain('返回')
  expect(template).toMatch(/disabled="{{[^}]*loadError/)
})

it('reuses the loaded problem while entering edit mode', () => {
  const editor = read('wechat/miniprogram/pages/problem/editor/index.ts')
  expect(editor).toContain('const loadedProblem')
  expect(editor).not.toMatch(/problemId\)[\s\S]*getProblem\(problemId\)[\s\S]*getProblem\(problemId\)/)
})

it('prevents duplicate route submissions while saving', () => {
  const editor = read('wechat/miniprogram/pages/problem/editor/index.ts')
  const template = read('wechat/miniprogram/pages/problem/editor/index.wxml')
  expect(editor).toContain('saving')
  expect(editor).toMatch(/save\(\)[\s\S]*saving[);][\s\S]*finally/)
  expect(template).toMatch(/disabled="{{[^}]*saving/)
  expect(template).toContain('loading="{{saving}}"')
})
