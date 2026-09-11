import { afterEach, expect, it, vi } from 'vitest'
import { WallEditor } from '../wechat/miniprogram/domain/wall-editor.js'
import * as browsing from '../wechat/miniprogram/domain/browse.js'

afterEach(() => vi.unstubAllGlobals())

it('encodes and restores the full-list context without inferring the selected route grade', () => {
  const api = browsing as any
  expect(api.routeContextQuery).toBeTypeOf('function')
  const query = api.routeContextQuery({ angle: null, grade: '全部' })
  expect(api.routeContextFromOptions(Object.fromEntries(new URLSearchParams(query)))).toEqual({})
  expect(api.routeContextFromOptions({ angle: '25', grade: 'V3' })).toEqual({ angle: 25, grade: 'V3' })
  expect(api.routeContextFromOptions({ angle: 'bad', grade: 'bad' })).toEqual({})
})

it('wall editing supports undo/redo and clears stale polygons after geometry changes', () => {
  const editor = new WallEditor([{ id: 'H001', x: .2, y: .2, radius: .1, kind: 'hold', polygon: [[.1,.1],[.3,.1],[.2,.3]] }]) as any
  editor.move('H001', .5, .5)
  expect(editor.value()[0].polygon).toBeUndefined()
  editor.undo()
  expect(editor.value()[0].polygon).toHaveLength(3)
  expect(editor.redo).toBeTypeOf('function')
  editor.redo()
  expect(editor.value()[0].x).toBe(.5)
  editor.clear()
  expect(editor.value()).toEqual([])
  editor.undo()
  expect(editor.value()).toHaveLength(1)
  editor.add({ x: .7, y: .7 })
  expect(editor.canRedo()).toBe(false)
})

it('shares a single login attempt and waits for identity before business calls', async () => {
  vi.resetModules()
  const storage = new Map()
  let finish: any
  const callFunction = vi.fn(({ name, success }) => {
    if (name === 'login') finish = () => success({ result: { userId: 'u1' } })
    else success({ result: [] })
  })
  vi.stubGlobal('wx', { getStorageSync: (k: string) => storage.get(k), setStorageSync: (k: string, v: any) => storage.set(k,v), cloud: { callFunction } })
  const users = await import('../wechat/miniprogram/services/users.js')
  const walls = await import('../wechat/miniprogram/services/walls.js')
  const a = users.ensureUser(), b = users.ensureUser(), c = walls.listWalls()
  expect(callFunction.mock.calls.filter(([v]) => v.name === 'login')).toHaveLength(1)
  expect(callFunction.mock.calls.some(([v]) => v.name === 'wallManager')).toBe(false)
  finish()
  await Promise.all([a,b,c])
  expect(callFunction.mock.calls.filter(([v]) => v.name === 'wallManager')).toHaveLength(1)
})
