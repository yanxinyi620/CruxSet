import { describe, expect, test } from 'vitest'
import { browseProblems, PUBLIC_BROWSE_FILTER_DEFAULTS } from '../wechat/miniprogram/domain/browse.js'
import type { Problem } from '../wechat/miniprogram/domain/types.js'
import { readFileSync } from 'node:fs'

const problem = (overrides: Partial<Problem> = {}): Problem => ({
  id: 'p1', number: '001', wallId: 'w1', name: '线路一', description: '说明',
  angle: 35, grade: 'V4', footRule: 'feet_follow',
  holds: { start: [], foot: [], hand: [], assist: [], finish: [] },
  createdBy: 'u1', createdAt: 1, updatedAt: 1, setterName: '小明', ...overrides,
})

describe('mini program public browsing contract', () => {
  test('defaults public route browsing to all angles and grades', () => {
    expect(PUBLIC_BROWSE_FILTER_DEFAULTS).toEqual({ angle: undefined, grade: undefined })
    expect(browseProblems([problem(), problem({ id: 'p2', number: '002', angle: 20, grade: 'V2' })], { wallId: 'w1' })).toHaveLength(2)
  })

  test('filters only by wall, angle and grade without keyword search', () => {
    expect(browseProblems([problem(), problem({ id: 'p2', number: '002', angle: 20 })], { wallId: 'w1', angle: 20 })).toEqual([problem({ id: 'p2', number: '002', angle: 20 })])
  })

  test('public pages expose overview, browse action, and read-only detail', () => {
    const wall = readFileSync('wechat/miniprogram/pages/wall/index.wxml', 'utf8')
    const detail = readFileSync('wechat/miniprogram/pages/problem/detail/index.wxml', 'utf8')
    expect(wall).toContain('浏览线路')
    expect(wall).not.toContain('随机线路')
    expect(wall).not.toContain('搜索编号')
    expect(detail).toContain('设定者')
    expect(detail).toContain('{{wall.name}}')
    expect(detail).toContain('上一条')
    expect(detail).not.toContain('编辑线路')
    expect(detail).not.toContain('删除线路')
  })
})
