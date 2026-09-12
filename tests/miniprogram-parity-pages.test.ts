// @ts-nocheck
import { beforeEach, expect, it, vi } from 'vitest'
const wall = { id:'w', name:'Wall', imageWidth:100, imageHeight:100, angleOptions:[20,25], visibility:'public', holds:[] }
const problem = { id:'p', number:'001', wallId:'w', angle:20, grade:'V2', footRule:'all', holds:{start:['H1'], finish:['H2'], hand:[],foot:[],assist:[]} }
const listProblems = vi.fn(async () => [problem, {...problem,id:'p2',angle:25,grade:'V5'}])
vi.mock('../wechat/miniprogram/services/problems.js', () => ({getProblem:vi.fn(async () => problem), listProblems, saveProblem:vi.fn(), updateProblem:vi.fn()}))
vi.mock('../wechat/miniprogram/services/browse-data.js', () => ({getProblem:vi.fn(async()=>problem),listProblems,getWall:vi.fn(async()=>wall)}))
vi.mock('../wechat/miniprogram/services/walls.js', () => ({getWall:vi.fn(async () => wall)}))
vi.mock('../wechat/miniprogram/services/users.js', () => ({currentUserId:()=>'u',ensureUser:async ()=>'u'}))
let page, storage
beforeEach(() => { vi.resetModules(); listProblems.mockClear(); storage=new Map(); vi.stubGlobal('Page', config => {page=config; page.setData=function(values,done){Object.assign(this.data, values);done?.()}}); vi.stubGlobal('wx',{getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),navigateBack:vi.fn(),redirectTo:vi.fn()}) })
it('detail uses the list context and full-wall defaults for share links', async () => {
 await import('../wechat/miniprogram/pages/problem/detail/index.js')
 await page.onLoad({id:'p'})
 expect(listProblems).toHaveBeenCalledWith({wallId:'w'})
 expect(page.data.next.id).toBe('p2')
 expect(page.openFullscreen).toBeTypeOf('function')
 page.openFullscreen(); expect(page.data.fullscreen).toBe(true)
 page.closeFullscreen(); expect(page.data.fullscreen).toBe(false)
})
it('editor retains name, description, role and geometry in a user-scoped draft', async () => {
 await import('../wechat/miniprogram/pages/problem/editor/index.js')
 await page.onLoad({wallId:'w'})
 page.setDialogName({detail:{value:'Route'}})
 page.setDialogDescription({detail:{value:'Note'}})
 page.selectRole({currentTarget:{dataset:{role:'finish'}}})
 page.onHide?.()
 const entry = [...storage.entries()].find(([k])=>k.includes('problemDraft:'))
 expect(entry?.[0]).toContain('u:')
 expect(entry?.[1]).toMatchObject({name:'Route',description:'Note',role:'finish'})
})
