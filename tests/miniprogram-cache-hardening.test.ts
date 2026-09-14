import { afterEach, beforeEach, expect, it, vi } from 'vitest'
let calls:any[], routes:any[], walls:any[], disk:Map<string,any>, handlers:Record<string,(request:any)=>void>
beforeEach(() => {
 vi.useFakeTimers(); vi.resetModules(); calls=[]; disk=new Map(); handlers={}
 walls=['w','other'].map(id=>({id,name:id,visibility:'public',imageWidth:100,imageHeight:100,updatedAt:1,holds:[]}))
 routes=[{id:'p',wallId:'w',number:'CS-010001',name:'Old',angle:20,grade:'V4',createdBy:'u',footRule:'all',holds:{}}]
 vi.spyOn(console,'error').mockImplementation(()=>{}); vi.spyOn(console,'warn').mockImplementation(()=>{})
 vi.stubGlobal('wx',{getStorageSync:(key:string)=>disk.get(key),setStorageSync:(key:string,value:any)=>disk.set(key,structuredClone(value)),removeStorageSync:(key:string)=>disk.delete(key),stopPullDownRefresh:vi.fn(),cloud:{callFunction:(request:any)=>{
  const {name,data,success,fail}=request, action=data.action||name; calls.push({action,data})
  if(handlers[action])return handlers[action](request)
  const value=action==='login'?{userId:'u'}:action==='getSession'?{isAdmin:true}:action==='getWall'?walls.find(w=>w.id===data.data.id)
   :action==='listBrowseWalls'||action==='listMyWalls'||action==='listAdminWalls'||action==='listDrafts'?walls
   :action==='listMyProblems'?routes:action==='listProblems'?routes.filter(p=>p.wallId===data.data.wallId)
   :action==='getProblem'?routes.find(p=>p.id===data.data.id):action==='listUsers'?[]:{ok:true}
  if(value===undefined)return fail({errMsg:'WALL_NOT_FOUND'})
  success({result:structuredClone(value)})
 }}})
})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()})
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();await vi.advanceTimersByTimeAsync(5)}
async function page(kind:'walls'|'browser'|'personal'|'ownWalls'|'management'|'drafts') {
 let definition:any;vi.stubGlobal('Page',(value:any)=>{definition=value})
 if(kind==='walls')await import('../wechat/miniprogram/pages/walls/index.js')
 if(kind==='browser')await import('../wechat/miniprogram/pages/route-browser/index.js')
 if(kind==='personal')await import('../wechat/miniprogram/pages/me/problems/index.js')
 if(kind==='ownWalls')await import('../wechat/miniprogram/pages/me/walls/index.js')
 if(kind==='management')await import('../wechat/miniprogram/pages/admin/management/index.js')
 if(kind==='drafts')await import('../wechat/miniprogram/pages/create/drafts/index.js')
 return {...definition,data:structuredClone(definition.data),patches:[] as any[],setData(patch:any,done?:()=>void){this.patches.push(patch);Object.assign(this.data,patch);done?.()}}
}
it('retains wall and complete public list when a wall has 120 routes',async()=>{
 routes=Array.from({length:120},(_,i)=>({...routes[0],id:`p${i}`}))
 const api=await import('../wechat/miniprogram/services/browse-data.js')
 await api.getWall('w');await api.listProblems({wallId:'w'});await api.listProblems({wallId:'w'});await api.getWall('w')
 expect(calls.filter(c=>c.action==='listProblems')).toHaveLength(1)
 expect(calls.filter(c=>c.action==='getWall')).toHaveLength(1)
})
it('does not invalidate caches when inspecting a wall deletion',async()=>{
 const api=await import('../wechat/miniprogram/services/browse-data.js'),management=await import('../wechat/miniprogram/services/walls.js')
 await api.getWall('w');await api.listProblems({wallId:'w'});await management.inspectWallDeletion('w')
 await api.getWall('w');await api.listProblems({wallId:'w'})
 expect(calls.filter(c=>c.action==='getWall')).toHaveLength(1);expect(calls.filter(c=>c.action==='listProblems')).toHaveLength(1)
})
it.each(['save','update','delete'])('keeps other walls route lists after %s',async operation=>{
 const api=await import('../wechat/miniprogram/services/browse-data.js'),write=await import('../wechat/miniprogram/services/problems.js')
 await api.listProblems({wallId:'w'});await api.listProblems({wallId:'other'})
 if(operation==='save')await write.saveProblem('w',{})
 else if(operation==='update')await write.updateProblem('p',{})
 else await write.deleteProblem('p')
 await api.listProblems({wallId:'other'});await api.listProblems({wallId:'w'})
 expect(calls.filter(c=>c.action==='listProblems'&&c.data.data.wallId==='other')).toHaveLength(1)
 expect(calls.filter(c=>c.action==='listProblems'&&c.data.data.wallId==='w')).toHaveLength(2)
})
it('pulls fresh walls within the fresh window and keeps old content until completion',async()=>{
 const view=await page('walls');await view.onShow()
 let finish:any;handlers.listBrowseWalls=({success})=>{finish=success}
 const refresh=view.onPullDownRefresh();await settle()
 expect(view.data.loading).toBe(false);expect(view.data.walls[0].name).toBe('w')
 expect(calls.filter(c=>c.action==='listBrowseWalls')).toHaveLength(2)
 finish({result:[{...walls[0],name:'New'}]});await refresh
 expect(view.data.walls[0].name).toBe('New');expect((globalThis as any).wx.stopPullDownRefresh).toHaveBeenCalled();view.onUnload()
})
it('forces route refresh without resetting selected filters',async()=>{
 const view=await page('browser');await view.onLoad({wallId:'w'});view.onShow()
 view.selectAngle({detail:{value:'5'}});view.selectGrade({detail:{value:'5'}})
 routes[0].name='New';await view.onPullDownRefresh()
 expect(view.data.angle).toBe(20);expect(view.data.grade).toBe('V4');expect(view.data.problems[0].name).toBe('New');view.onUnload()
})
it('forces personal list refresh while preserving expanded groups',async()=>{
 const view=await page('personal');await view.onShow();view.toggle({currentTarget:{dataset:{id:'w'}}})
 routes[0].name='New';await view.onPullDownRefresh()
 expect(view.data.groups[0].expanded).toBe(true);expect(view.data.groups[0].problems[0].name).toBe('New');view.onUnload()
})
it('keeps public browsing content on a failed manual refresh and reports the failure',async()=>{
 const view=await page('walls');await view.onShow()
 handlers.listBrowseWalls=({fail})=>fail({errMsg:'NETWORK_TIMEOUT'})
 await view.onPullDownRefresh()
 expect(view.data.walls).toHaveLength(2);expect(view.data.notice).toContain('网络');expect(view.data.loading).toBe(false);view.onUnload()
})
it.each(['ownWalls','management','drafts'] as const)('does not flash loading on repeated %s entry',async kind=>{
 const view=await page(kind);await view.onShow();view.onHide?.();view.patches=[];await view.onShow()
 expect(view.patches.some((patch:any)=>patch.loading===true)).toBe(false);view.onUnload?.()
})
it('does not restore revoked routes when a filter changes',async()=>{
 const view=await page('browser');await view.onLoad({wallId:'w'});view.onShow()
 handlers.listProblems=({fail})=>fail({errMsg:'FORBIDDEN'})
 await view.onPullDownRefresh();view.selectAngle({detail:{value:'0'}})
 expect(view.data.problems).toEqual([]);expect(view.data.error).toContain('权限');view.onUnload()
})
it('does not start a scheduled pull after hiding the page',async()=>{
 const view=await page('walls');await view.onShow()
 const refresh=view.onPullDownRefresh();view.onHide();const before=structuredClone(view.data),count=calls.length
 await refresh;await settle()
 expect(view.data).toEqual(before);expect(calls).toHaveLength(count);view.onUnload()
})
it('refreshes again when a write completes during an older forced read',async()=>{
 const view=await page('personal');await view.onShow()
 let finish:any;handlers.listMyProblems=({success})=>{finish=success}
 const refresh=view.onPullDownRefresh();await settle()
 const old=structuredClone(routes)
 const {updateProblem}=await import('../wechat/miniprogram/services/problems.js')
 handlers.updateProblem=({success})=>{routes[0].name='Saved';success({result:{id:'p'}})}
 await updateProblem('p',{});delete handlers.listMyProblems
 finish({result:old});await refresh;await settle()
 expect(view.data.groups[0].problems[0].name).toBe('Saved');view.onUnload()
})
it('preserves operation notices while refreshing own walls',async()=>{
 const view=await page('ownWalls');await view.onShow();view.setData({notice:'墙面已删除。'})
 await view.reload();expect(view.data.notice).toBe('墙面已删除。');view.onUnload()
})
it('updates surviving personal groups when another wall is revoked during a pull',async()=>{
 routes.push({...routes[0],id:'p2',wallId:'other'})
 const view=await page('personal');await view.onShow()
 walls[1].name='Updated wall'
 handlers.getWall=({data,success,fail})=>data.data.id==='w'?fail({errMsg:'FORBIDDEN'}):success({result:walls[1]})
 await view.onPullDownRefresh()
 expect(view.data.groups).toHaveLength(1);expect(view.data.groups[0].wallName).toBe('Updated wall');view.onUnload()
})
it('conservatively invalidates all route lists if the edited route has no cached wall identity',async()=>{
 const api=await import('../wechat/miniprogram/services/browse-data.js'),write=await import('../wechat/miniprogram/services/problems.js')
 await api.listProblems({wallId:'w'});await api.listProblems({wallId:'other'});await write.updateProblem('unknown',{})
 await api.listProblems({wallId:'w'});await api.listProblems({wallId:'other'})
 expect(calls.filter(c=>c.action==='listProblems')).toHaveLength(4)
})
it('reports a public background failure without repeatedly retrying it',async()=>{
 const view=await page('walls');await view.onShow();view.onHide();await vi.advanceTimersByTimeAsync(30001)
 handlers.listBrowseWalls=({fail})=>fail({errMsg:'NETWORK_TIMEOUT'})
 await view.onShow();await settle()
 expect(view.data.notice).toContain('网络');expect(view.data.walls).toHaveLength(2)
 const count=calls.length;await vi.advanceTimersByTimeAsync(1000);expect(calls).toHaveLength(count);view.onUnload()
})
