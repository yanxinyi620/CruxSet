// @ts-nocheck
import { expect, it, vi, beforeEach } from 'vitest'
const listMyWalls = vi.fn(async()=>[{id:'mine', name:'Own',holds:[],visibility:'public'}])
const listAdminWalls = vi.fn(async()=>[])
const inspectWallDeletion = vi.fn(async()=>({problemCount:125}))
const deleteWall = vi.fn(async()=>({ok:true}))
vi.mock('../wechat/miniprogram/services/walls.js',()=>({listMyWalls,listAdminWalls,inspectWallDeletion,deleteWall}))
vi.mock('../wechat/miniprogram/services/users.js',()=>({currentUserIsAdmin:async()=>false,ensureUser:async()=> 'u'}))
let page
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubGlobal('Page', p=>{page=p;p.setData=function(v){Object.assign(this.data,v)}});vi.stubGlobal('wx',{showModal:vi.fn(),showToast:vi.fn()})})
it('ordinary users can load their own walls without an administrator gate',async()=>{
 await import('../wechat/miniprogram/pages/me/walls/index.js')
 await page.onShow()
 expect(listMyWalls).toHaveBeenCalled()
 expect(listAdminWalls).not.toHaveBeenCalled()
 expect(page.data.walls[0].id).toBe('mine')
})
it('shows associated route count before cascading deletion and never deletes on cancel',async()=>{
 await import('../wechat/miniprogram/pages/me/walls/index.js')
 const pending = page.remove({currentTarget:{dataset:{wallId:'mine'}}})
 await Promise.resolve(); await Promise.resolve()
 expect(inspectWallDeletion).toHaveBeenCalledWith('mine')
 const modal=wx.showModal.mock.calls[0][0]
 expect(modal.content).toContain('125')
 await modal.success({confirm:false}); await pending
 expect(deleteWall).not.toHaveBeenCalled()
})
