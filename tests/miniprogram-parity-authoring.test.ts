// @ts-nocheck
import { beforeEach, expect, it, vi } from 'vitest'
const holds=[{id:'H001',x:.1,y:.1,radius:.05,kind:'hold'},{id:'H002',x:.8,y:.8,radius:.05,kind:'hold'}]
const wall={id:'w',name:'Wall',visibility:'private',imageWidth:100,imageHeight:100,holds}
let admin=true,page
vi.mock('../wechat/miniprogram/services/image-cache.js',()=>({wallImagePath:async()=>'/tmp/image'}))
vi.mock('../wechat/miniprogram/services/image-processing.js',()=>({drawImagePixels:async()=>({width:1,height:1,ctx:{getImageData:()=>({data:new Uint8ClampedArray([255,255,255,255])})}})}))
const saveWallHolds=vi.fn(async()=>wall),publishWall=vi.fn(async()=>({...wall,visibility:'public'}))
vi.mock('../wechat/miniprogram/services/walls.js',()=>({getWall:async()=>wall,saveWallHolds,publishWall}))
vi.mock('../wechat/miniprogram/services/users.js',()=>({currentUserIsAdmin:async()=>admin,currentUserId:()=> 'u'}))
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();admin=true;vi.stubGlobal('Page',p=>{page=p;p.setData=function(v,done){Object.assign(this.data,v);done?.()}});vi.stubGlobal('wx',{showToast:vi.fn(),getStorageSync:()=>null,setStorageSync:vi.fn(),removeStorageSync:vi.fn(),showModal:vi.fn(({success})=>success({confirm:true}))})})
it('saves all geometry before publishing and then locks the editor',async()=>{
 await import('../wechat/miniprogram/pages/admin/wall-editor/index.js')
 expect(page.onLoad).toBeTypeOf('function')
 await page.onLoad({wallId:'w'})
 await page.publish()
 expect(saveWallHolds).toHaveBeenCalledWith('w',expect.any(Array))
 expect(publishWall).toHaveBeenCalledWith('w')
 expect(page.data.locked).toBe(true)
 const before=page.data.holdCount
 page.setMode({currentTarget:{dataset:{mode:'add'}}})
 page.onPoint({detail:{x:.4,y:.4}})
 expect(page.data.holdCount).toBe(before)
})
it('does not expose wall editing to an ordinary user entering a direct link',async()=>{
 admin=false
 await import('../wechat/miniprogram/pages/admin/wall-editor/index.js')
 expect(page.onLoad).toBeTypeOf('function')
 await page.onLoad({wallId:'w'})
 expect(page.data.allowed).toBe(false)
 await page.publish()
 expect(publishWall).not.toHaveBeenCalled()
})

it('clears a pending move selection when detection replaces the geometry',async()=>{
 await import('../wechat/miniprogram/pages/admin/wall-editor/index.js')
 await page.onLoad({wallId:'w'})
 page.setMode({currentTarget:{dataset:{mode:'move'}}})
 page.onPoint({detail:{x:.1,y:.1,holdId:'H001'}})
 expect(page.movingId).toBe('H001')
 await page.detect()
 expect(page.movingId).toBeNull()
 expect(page.data.selected).toEqual({})
 expect(()=>page.onPoint({detail:{x:.5,y:.5}})).not.toThrow()
})
