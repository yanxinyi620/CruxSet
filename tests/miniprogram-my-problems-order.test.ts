// @ts-nocheck
import { expect, it, vi } from 'vitest'
const { resolvers } = vi.hoisted(() => ({resolvers: []}))
vi.mock('../wechat/miniprogram/services/problems.js', () => ({deleteProblem:vi.fn(),listMyProblems:async()=>[
 {id:'p3',wallId:'old',number:'003'}, {id:'p2',wallId:'new',number:'002'}, {id:'p1',wallId:'new',number:'001'}
]}))
vi.mock('../wechat/miniprogram/services/walls.js', () => ({getWall:id=>new Promise(resolve=>resolvers.push(()=>resolve({id,name:id,visibility:'public',updatedAt:id==='new'?20:10})))}))
it('sorts groups and routes after wall requests finish out of order',async()=>{
 let page
 vi.stubGlobal('Page',config=>{page=config;page.setData=values=>Object.assign(page.data,values)})
 try {
  await import('../wechat/miniprogram/pages/me/problems/index.js')
  const loading=page.reload()
  await Promise.resolve()
  resolvers[0]();resolvers[2]();resolvers[1]()
  await loading
  expect(page.data.groups.map(g=>g.id)).toEqual(['new','old'])
  expect(page.data.groups[0].problems.map(p=>p.number)).toEqual(['001','002'])
 } finally {vi.unstubAllGlobals()}
})
