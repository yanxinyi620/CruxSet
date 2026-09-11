// @ts-nocheck
import { expect,it,vi } from 'vitest'
const uploadWallImage=vi.fn(async()=>({fileID:'cloud://image',imageWidth:120,imageHeight:80}))
const createWall=vi.fn().mockRejectedValueOnce(new Error('NETWORK')).mockResolvedValue({id:'w'})
vi.mock('../wechat/miniprogram/services/users.js',()=>({currentUserIsAdmin:async()=>true}))
vi.mock('../wechat/miniprogram/services/walls.js',()=>({uploadWallImage,createWall}))
vi.mock('../wechat/miniprogram/services/image-processing.js',()=>({normalizeUploadImage:async()=> 'image-base64'}))
it('reuses a successful upload and creation request id after a network failure',async()=>{
 let page
 vi.stubGlobal('Page',p=>{page=p;p.setData=function(v){Object.assign(this.data,v)}})
 vi.stubGlobal('wx',{redirectTo:vi.fn()})
 await import('../wechat/miniprogram/pages/admin/index.js')
 expect(page.onShow).toBeTypeOf('function')
 await page.onShow()
 page.setData({imagePath:'/tmp/picture.jpg',name:'Wall'})
 page.requestId='request-1'
 await page.submit()
 await page.submit()
 expect(uploadWallImage).toHaveBeenCalledTimes(1)
 expect(createWall).toHaveBeenCalledTimes(2)
 expect(createWall.mock.calls[0][0]).toEqual(createWall.mock.calls[1][0])
 expect(wx.redirectTo).toHaveBeenCalledWith({url:'/pages/admin/wall-editor/index?wallId=w'})
})
