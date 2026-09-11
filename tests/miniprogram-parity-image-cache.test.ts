// @ts-nocheck
import { expect, it, vi } from 'vitest'
vi.mock('../wechat/miniprogram/services/walls.js', () => ({getWallImageUrl:vi.fn(async ()=>'https://image.test/signed')}))
it('shares image downloads across pages and retries after invalidation', async () => {
 vi.stubGlobal('wx',{getStorageSync:()=> 'user1',downloadFile:vi.fn(({success})=>success({statusCode:200,tempFilePath:'/tmp/wall.jpg'}))})
 const cache = await import('../wechat/miniprogram/services/image-cache.js')
 const [a,b] = await Promise.all([cache.wallImagePath('cloud://a'),cache.wallImagePath('cloud://a')])
 expect(a).toBe('/tmp/wall.jpg'); expect(b).toBe(a)
 expect(wx.downloadFile).toHaveBeenCalledTimes(1)
 cache.invalidateWallImage('cloud://a')
 await cache.wallImagePath('cloud://a')
 expect(wx.downloadFile).toHaveBeenCalledTimes(2)
})
