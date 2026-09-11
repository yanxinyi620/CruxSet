import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
const read=(p:string)=>readFileSync(p,'utf8')
it('registers native authoring and management pages while excluding the lab',()=>{
 const app=JSON.parse(read('wechat/miniprogram/app.json'))
 for(const page of ['pages/create/drafts/index','pages/admin/index','pages/admin/wall-editor/index','pages/admin/management/index','pages/me/walls/index'])expect(app.pages).toContain(page)
 expect(app.pages.join(' ')).not.toMatch(/segmentation|experiment|lab/)
})
it('guards administrator creation actions but leaves ordinary route creation available',async()=>{
 let page:any
 vi.stubGlobal('Page',(p:any)=>{page=p})
 const navigateTo=vi.fn()
 vi.stubGlobal('wx',{navigateTo})
 await import('../wechat/miniprogram/pages/create/index.js')
 page.createWall();page.openDrafts()
 expect(navigateTo).not.toHaveBeenCalled()
 page.createProblem()
 expect(navigateTo).toHaveBeenCalledWith({url:'/pages/wall-picker/index?mode=create'})
 page.data.isAdmin=true
 page.createWall();page.openDrafts()
 expect(navigateTo).toHaveBeenCalledWith({url:'/pages/admin/index'})
 expect(navigateTo).toHaveBeenCalledWith({url:'/pages/create/drafts/index'})
 vi.unstubAllGlobals()
})
it('separates personal walls from administrator management entry',()=>{
 const source=read('wechat/miniprogram/pages/me/index.wxml')
 expect(source).toContain('我的墙面')
 expect(source).toContain('bindtap="openManagement"')
 expect(source).toContain('wx:if="{{isAdmin}}"')
 expect(read('wechat/miniprogram/pages/me/walls/index.ts')).toContain('listMyWalls')
})
