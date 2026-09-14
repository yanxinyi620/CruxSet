// @ts-nocheck
import { expect, it, vi } from 'vitest'

it('sorts groups and routes after distinct wall requests finish out of order', async () => {
  vi.resetModules()
  const resolvers = new Map()
  let page
  vi.stubGlobal('Page', config => { page = config; page.setData = values => Object.assign(page.data, values) })
  vi.stubGlobal('wx', { getStorageSync: () => undefined, setStorageSync: () => {}, cloud: {
    callFunction: ({ name, data, success }) => {
      if (name === 'login') return success({ result: { userId: 'u' } })
      if (data.action === 'listMyProblems') return success({ result: [
        { id: 'p3', wallId: 'old', number: '003' },
        { id: 'p2', wallId: 'new', number: '002' },
        { id: 'p1', wallId: 'new', number: '001' },
      ] })
      const id = data.data.id
      resolvers.set(id, () => success({ result: { id, name: id, visibility: 'public', updatedAt: id === 'new' ? 20 : 10 } }))
    },
  } })
  try {
    await import('../wechat/miniprogram/pages/me/problems/index.js')
    const loading = page.onShow()
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(resolvers.size).toBe(2)
    resolvers.get('new')(); resolvers.get('old')()
    await loading
    expect(page.data.groups.map(group => group.id)).toEqual(['new', 'old'])
    expect(page.data.groups[0].problems.map(problem => problem.number)).toEqual(['001', '002'])
    page.onUnload()
    await new Promise(resolve => setTimeout(resolve, 1))
  } finally { vi.unstubAllGlobals() }
})
