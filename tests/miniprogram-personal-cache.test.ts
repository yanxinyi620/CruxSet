import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let storage: Map<string, any>, calls: string[], user: string, routes: any[], walls: any[]
let handlers: Record<string, (request: any) => void>
beforeEach(() => {
  vi.useFakeTimers(); vi.resetModules()
  storage = new Map(); calls = []; user = 'u'; handlers = {}
  walls = [{ id: 'w', name: 'Wall', updatedAt: 1, visibility: 'public', holds: [] }]
  routes = [{ id: 'p', number: 'CS-010001', wallId: 'w', createdBy: 'u', name: 'Old', angle: 20, grade: 'V4', holds: {} }]
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('wx', {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, structuredClone(value)),
    cloud: { callFunction: (request: any) => {
      const { name, data, success, fail } = request, action = data.action || name
      calls.push(action)
      if (handlers[action]) return handlers[action](request)
      const value = action === 'login' ? { userId: user } : action === 'getSession' ? { isAdmin: false }
        : action === 'listMyProblems' ? routes.filter(p => p.createdBy === user)
        : action === 'listProblems' ? routes : action === 'getProblem' ? routes.find(p => p.id === data.data.id)
        : action === 'getWall' ? walls.find(w => w.id === data.data.id) : { ok: true }
      if (!value) return fail({ errMsg: 'WALL_NOT_FOUND' })
      success({ result: structuredClone(value) })
    } },
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(5) }
async function page(kind: 'hub' | 'routes') {
  let definition: any
  vi.stubGlobal('Page', (value: any) => { definition = value })
  if (kind === 'hub') await import('../wechat/miniprogram/pages/me/index.js')
  else await import('../wechat/miniprogram/pages/me/problems/index.js')
  return { ...definition, data: structuredClone(definition.data), patches: [] as any[],
    setData(patch: any) { this.patches.push(patch); Object.assign(this.data, patch) } }
}

it('shares browsing walls but fetches the complete personal list including unvisited routes', async () => {
  const browse = await import('../wechat/miniprogram/services/browse-data.js')
  await browse.getWall('w'); await browse.listProblems({ wallId: 'w' })
  routes.push({ ...routes[0], id: 'p2', number: 'CS-010002' })
  const view = await page('routes'); await view.onShow(); await settle()
  expect(view.data.groups[0].problems).toHaveLength(2)
  expect(calls.filter(a => a === 'getWall')).toHaveLength(1)
  expect(calls.filter(a => a === 'listMyProblems')).toHaveLength(1)
  view.onUnload?.()
})

it('loads the count without waiting for administrator lookup', async () => {
  handlers.getSession = () => {}
  const hub = await page('hub'); void hub.onShow(); await settle()
  expect(hub.data.loading).toBe(false); expect(hub.data.problemCount).toBe(1)
  expect(hub.data.isAdmin).toBe(false); hub.onUnload?.()
})

it('keeps populated and empty pages free of loading flashes on re-entry', async () => {
  routes = []
  const view = await page('routes'); await view.onShow(); view.onHide?.(); view.patches = []
  await view.onShow()
  expect(view.patches.some((p: any) => p.loading === true)).toBe(false)
  expect(view.data.groups).toEqual([]); view.onUnload?.()
})

it('serves a stale personal list and updates the visible groups without losing expansion', async () => {
  const view = await page('routes'); await view.onShow()
  view.toggle({ currentTarget: { dataset: { id: 'w' } } })
  view.onHide?.(); await vi.advanceTimersByTimeAsync(30001)
  let finish: any; handlers.listMyProblems = ({ success }) => { finish = success }
  view.patches = []; void view.onShow(); await settle()
  expect(view.data.loading).toBe(false); expect(view.data.groups[0].problems[0].name).toBe('Old')
  finish({ result: [{ ...routes[0], name: 'New' }] }); await settle()
  expect(view.data.groups[0].problems[0].name).toBe('New')
  expect(view.data.groups[0].expanded).toBe(true)
  expect(view.patches.some((p: any) => p.loading === true)).toBe(false); view.onUnload?.()
})

it('keeps cached content and reports a background network error without a retry loop', async () => {
  const view = await page('routes'); await view.onShow(); view.onHide?.()
  await vi.advanceTimersByTimeAsync(30001)
  handlers.listMyProblems = ({ fail }) => fail({ errMsg: 'NETWORK_TIMEOUT' })
  void view.onShow(); await settle()
  expect(view.data.groups).toHaveLength(1); expect(view.data.notice).toContain('网络')
  const count = calls.length; await vi.advanceTimersByTimeAsync(500)
  expect(calls).toHaveLength(count); view.onUnload?.()
})

it('removes personal data when access is explicitly revoked', async () => {
  const view = await page('routes'); await view.onShow(); view.onHide?.()
  await vi.advanceTimersByTimeAsync(30001)
  handlers.listMyProblems = ({ fail }) => fail({ errMsg: 'FORBIDDEN' })
  void view.onShow(); await settle()
  expect(view.data.groups).toEqual([]); expect(view.data.loading).toBe(false); view.onUnload?.()
})

it('ignores a response that finishes after the page is hidden', async () => {
  let finish: any; handlers.listMyProblems = ({ success }) => { finish = success }
  const view = await page('routes'); void view.onShow(); await settle()
  view.onHide?.(); const previous = structuredClone(view.data)
  finish({ result: routes }); await settle()
  expect(view.data).toEqual(previous)
  delete handlers.listMyProblems; await view.onShow(); expect(view.data.groups).toHaveLength(1); view.onUnload?.()
})

it('restores the personal list after confirmed login, isolated from another user', async () => {
  let personal = await import('../wechat/miniprogram/services/personal-data.js')
  await personal.listMyProblems(); await settle()
  vi.resetModules(); personal = await import('../wechat/miniprogram/services/personal-data.js')
  expect(personal.peekMyProblems()).toBeUndefined()
  calls = []; expect(await personal.listMyProblems()).toHaveLength(1); expect(calls).toEqual(['login'])
  user = 'other'; vi.resetModules(); personal = await import('../wechat/miniprogram/services/personal-data.js')
  calls = []; expect(await personal.listMyProblems()).toEqual([]); expect(calls).toEqual(['login', 'listMyProblems'])
})

it.each(['saveProblem', 'updateProblem', 'deleteProblem'])('preserves wall detail across %s but refreshes personal routes', async operation => {
  const browse = await import('../wechat/miniprogram/services/browse-data.js')
  const personal = await import('../wechat/miniprogram/services/personal-data.js')
  const problems = await import('../wechat/miniprogram/services/problems.js')
  await browse.getWall('w'); await personal.listMyProblems(); await browse.getProblem('p')
  if (operation === 'saveProblem') await problems.saveProblem('w', {})
  else if (operation === 'updateProblem') await problems.updateProblem('p', { name: 'New' })
  else await problems.deleteProblem('p')
  await browse.getWall('w'); await personal.listMyProblems()
  expect(calls.filter(a => a === 'getWall')).toHaveLength(1)
  expect(calls.filter(a => a === 'listMyProblems')).toHaveLength(2)
})

it('caches a complete personal list larger than the detail cache capacity', async () => {
  routes = Array.from({ length: 120 }, (_, i) => ({ ...routes[0], id: `p${i}` }))
  const personal = await import('../wechat/miniprogram/services/personal-data.js')
  await personal.listMyProblems(); await personal.listMyProblems(); await settle()
  expect(calls.filter(a => a === 'listMyProblems')).toHaveLength(1)
  expect(personal.peekMyProblems()).toHaveLength(120)
  vi.resetModules()
  const restored = await import('../wechat/miniprogram/services/personal-data.js')
  calls = []; expect(await restored.listMyProblems()).toHaveLength(120)
  expect(calls).toEqual(['login'])
})

it('does not let an old list resurrect a route deleted during its background refresh', async () => {
  const browse = await import('../wechat/miniprogram/services/browse-data.js')
  const personal = await import('../wechat/miniprogram/services/personal-data.js')
  const problems = await import('../wechat/miniprogram/services/problems.js')
  await personal.listMyProblems(); await vi.advanceTimersByTimeAsync(30001)
  let finish: any; handlers.listMyProblems = ({ success }) => { finish = success }
  await personal.listMyProblems(); await settle()
  await problems.deleteProblem('p')
  routes = []; delete handlers.listMyProblems
  await personal.listMyProblems()
  finish({ result: [{ id: 'p', wallId: 'w' }] }); await settle()
  expect(await personal.listMyProblems()).toEqual([])
  await expect(browse.getProblem('p')).rejects.toThrow()
})

it('continues using strict current data for editing after the personal display cache becomes stale', async () => {
  const personal = await import('../wechat/miniprogram/services/personal-data.js')
  const problems = await import('../wechat/miniprogram/services/problems.js')
  await personal.listMyProblems(); await problems.getProblem('p')
  await vi.advanceTimersByTimeAsync(30001); routes[0].name = 'Current'
  expect((await problems.getProblem('p')).name).toBe('Current')
})

it('removes an inaccessible wall group while retaining other wall groups', async () => {
  walls.push({ ...walls[0], id: 'w2' }); routes.push({ ...routes[0], id: 'p2', wallId: 'w2' })
  const view = await page('routes'); await view.onShow(); view.onHide?.()
  await vi.advanceTimersByTimeAsync(30001)
  handlers.getWall = ({ data, success, fail }) => data.data.id === 'w'
    ? fail({ errMsg: 'WALL_NOT_FOUND' }) : success({ result: walls[1] })
  void view.onShow(); await settle()
  expect(view.data.groups.map((group: any) => group.id)).toEqual(['w2']); view.onUnload?.()
})

it('invalidates route data on disk before a pending write while retaining wall data', async () => {
  const browse = await import('../wechat/miniprogram/services/browse-data.js')
  const personal = await import('../wechat/miniprogram/services/personal-data.js')
  const problems = await import('../wechat/miniprogram/services/problems.js')
  await browse.getWall('w'); await personal.listMyProblems(); await browse.getProblem('p'); await settle()
  let finish: any; handlers.updateProblem = ({ success }) => { finish = success }
  const write = problems.updateProblem('p', { name: 'New' }); await settle()
  const actions = storage.get('cruxset:browse-cache:v2').map((row: any) => JSON.parse(row.key)[1])
  expect(actions).toContain('getWall'); expect(actions).not.toContain('listMyProblems'); expect(actions).not.toContain('getProblem')
  finish({ result: { id: 'p' } }); await write
})

it('shares the count cache with My Routes and paints warm groups before awaiting network', async () => {
  const browse = await import('../wechat/miniprogram/services/browse-data.js'); await browse.getWall('w')
  const hub = await page('hub'); await hub.onShow(); await settle(); hub.onHide()
  const view = await page('routes'); const loading = view.onShow()
  expect(view.data.loading).toBe(false); expect(view.data.groups).toHaveLength(1)
  await loading; expect(calls.filter(a => a === 'listMyProblems')).toHaveLength(1)
  view.onUnload(); hub.onUnload()
})

it('refreshes visible personal groups after a successful deletion', async () => {
  const view = await page('routes'); await view.onShow()
  handlers.deleteProblem = ({ success }) => { routes = []; success({ result: { ok: true } }) }
  const { deleteProblem } = await import('../wechat/miniprogram/services/problems.js')
  await deleteProblem('p'); await settle()
  expect(view.data.groups).toEqual([]); expect(view.data.loading).toBe(false); view.onUnload()
})

it('discards malformed persisted cache keys instead of blocking route writes', async () => {
  storage.set('cruxset:browse-cache:v2', [{ key: 'broken', expires: Date.now() + 1000, value: [] }])
  const { updateProblem } = await import('../wechat/miniprogram/services/problems.js')
  await expect(updateProblem('p', {})).resolves.toEqual({ ok: true })
  expect(storage.get('cruxset:browse-cache:v2')).toEqual([])
})
