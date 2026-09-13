import { beforeEach, expect, it, vi } from 'vitest'
let requests: any[]
beforeEach(() => {
 vi.resetModules(); requests=[]
 vi.stubGlobal('wx',{setStorageSync:vi.fn(),cloud:{callFunction:({name,data,success}:any)=>{
 requests.push({name,...data})
 const result=name==='login'?{userId:'u'}:data.action==='getWall'?{id:'w',name:'Wall',angleOptions:[20,45]}:data.action==='listBrowseWalls'?[{id:'w',name:'Wall',holdCount:369,problemCount:12}]:data.action==='listProblems'?[{id:'p',wallId:'w',angle:20,grade:'V4',holds:{}}]:{id:'p'}
 success({result})
 }}})
})
it('fetches full walls after summaries and reuses route detail, including filtered navigation',async()=>{
 const walls=await import('../wechat/miniprogram/services/walls.js');const routes=await import('../wechat/miniprogram/services/problems.js')
 await walls.listWalls();await walls.getWall('w');await routes.listProblems({wallId:'w'});await routes.getProblem('p');await routes.listProblems({wallId:'w',angle:20})
 expect(requests.map(r=>r.action||r.name)).toEqual(['login','listBrowseWalls','getWall','listProblems'])
 expect(await routes.listProblems({wallId:'w',angle:0})).toEqual([])
 await routes.updateProblem('p',{name:'changed'});await routes.listProblems({wallId:'w'})
 expect(requests.filter(r=>r.action==='listProblems')).toHaveLength(2)
})
it('keeps the complete angle range after loading a legacy 20/45 wall',async()=>{
 let page:any;vi.stubGlobal('Page',(definition:any)=>page=definition)
 await import('../wechat/miniprogram/pages/route-browser/index.js')
 const context={...page,data:{...page.data},setData(patch:any,done?:()=>void){Object.assign(this.data,patch);done?.()}}
 await context.onLoad({wallId:'w'})
 expect(context.data.angles).toEqual([null,...Array.from({length:15},(_,i)=>i*5)])
 context.selectAngle({detail:{value:'1'}});expect(context.data.angle).toBe(0)
 context.selectAngle({detail:{value:'15'}});expect(context.data.angle).toBe(70)
 context.selectAngle({detail:{value:'0'}});expect(context.data.angle).toBeNull()
})
it.each(['listMyWalls','listAdminWalls'])('does not cache %s summaries as full wall detail',async action=>{
 vi.stubGlobal('wx',{setStorageSync:vi.fn(),cloud:{callFunction:({name,data,success}:any)=>{
 requests.push({name,...data})
 success({result:name==='login'?{userId:'u'}:data.action==='getWall'?{id:'w',holds:[{id:'A'}]}:[{id:'w',holdCount:1}]})
 }}})
 const {call}=await import('../wechat/miniprogram/services/cloud.js')
 await call('wallManager',{action})
 expect(await call('wallManager',{action:'getWall',data:{id:'w'}})).toMatchObject({holds:[{id:'A'}]})
})
