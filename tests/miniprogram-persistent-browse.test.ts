import { afterEach, beforeEach, expect, it, vi } from 'vitest'
let storage:Map<string,any>, calls:string[], user:string, walls:any[], routes:any[]
beforeEach(()=>{
 vi.useFakeTimers();vi.resetModules();storage=new Map();calls=[];user='u';walls=[{id:'w',name:'Old',imageWidth:100,imageHeight:100,visibility:'public',holds:[]}];routes=[{id:'p',wallId:'w',name:'old',angle:20,grade:'V4',footRule:'all',holds:{start:[],finish:[]}}]
 vi.stubGlobal('wx',{getStorageSync:(k:string)=>storage.get(k),setStorageSync:(k:string,v:any)=>storage.set(k,structuredClone(v)),cloud:{callFunction:({name,data,success,fail}:any)=>{
 const action=data.action||name;calls.push(action)
 if(name==='login')return success({result:{userId:user}})
 const value=action==='listBrowseWalls'?walls:action==='listProblems'?routes:action==='getProblem'?routes.find(p=>p.id===data.data.id):action==='getWall'?walls[0]:{}
 if(!value)return fail({errMsg:'PROBLEM_NOT_FOUND'})
 success({result:structuredClone(value)})
 }}})
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
it('restores browsing on restart after identity verification, without sharing another account data',async()=>{
 let api=await import('../wechat/miniprogram/services/browse-data.js');await api.listWalls();await vi.advanceTimersByTimeAsync(1)
 vi.resetModules();api=await import('../wechat/miniprogram/services/browse-data.js');calls=[];expect((await api.listWalls())[0].name).toBe('Old');expect(calls).toEqual(['login'])
 user='other';vi.resetModules();api=await import('../wechat/miniprogram/services/browse-data.js');calls=[];await api.listWalls();expect(calls).toEqual(['login','listBrowseWalls'])
})
it('evicts removed detail records after background list refresh and clears persistent data on writes',async()=>{
 const api=await import('../wechat/miniprogram/services/browse-data.js');const cloud=await import('../wechat/miniprogram/services/cloud.js')
 await api.listProblems({wallId:'w'});expect((await api.getProblem('p')).id).toBe('p');await vi.advanceTimersByTimeAsync(30001)
 routes=[];expect(await api.listProblems({wallId:'w'})).toHaveLength(1);await vi.advanceTimersByTimeAsync(1)
 await expect(api.getProblem('p')).rejects.toThrow();await cloud.call('updateProblem',{id:'p'});expect(storage.get('cruxset:browse-cache:v2')).toEqual([])
})
it('updates a visible page in background and does not update it while hidden',async()=>{
 let definition:any;vi.stubGlobal('Page',(p:any)=>definition=p)
 await import('../wechat/miniprogram/pages/wall/index.js')
 const page={...definition,data:{...definition.data},setData(patch:any){Object.assign(this.data,patch)}}
 await page.onLoad({wallId:'w'});page.onShow();expect(page.data.wallName).toBe('Old')
 await vi.advanceTimersByTimeAsync(30001);walls[0].name='New'
 const api=await import('../wechat/miniprogram/services/browse-data.js');await api.getWall('w');await vi.advanceTimersByTimeAsync(5);expect(page.data.wallName).toBe('New');expect(page.data.loading).toBe(false)
 page.onHide();await vi.advanceTimersByTimeAsync(30001);walls[0].name='Hidden';await api.getWall('w');await vi.advanceTimersByTimeAsync(5);expect(page.data.wallName).toBe('New')
 page.onShow();await vi.advanceTimersByTimeAsync(5);expect(page.data.wallName).toBe('Hidden');page.onUnload()
})
