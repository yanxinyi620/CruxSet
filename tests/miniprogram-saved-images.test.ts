import { afterEach, beforeEach, expect, it, vi } from 'vitest'
afterEach(()=>vi.useRealTimers())
let disk:any, files:Set<string>, copied:any[], removed:string[]
beforeEach(()=>{
 vi.resetModules();disk=undefined;files=new Set();copied=[];removed=[]
 vi.stubGlobal('wx',{env:{USER_DATA_PATH:'/user'},getStorageSync:()=>disk,setStorageSync:(_:string,v:any)=>disk=structuredClone(v),getFileInfo:({success}:any)=>success({size:1024}),getFileSystemManager:()=>({mkdirSync(){},accessSync(p:string){if(!files.has(p))throw Error('missing')},unlinkSync(p:string){files.delete(p);removed.push(p)},copyFile(o:any){copied.push(o);files.add(o.destPath);o.success({})}})})
})
it('reuses saved files across sessions and isolates users',async()=>{
 let cache=await import('../wechat/miniprogram/services/saved-images.js');const path=await cache.saveImage('u:cloud://image','/temp')
 vi.resetModules();cache=await import('../wechat/miniprogram/services/saved-images.js');expect(cache.savedImage('u:cloud://image')).toBe(path);expect(cache.savedImage('other:cloud://image')).toBeUndefined();expect(copied).toHaveLength(1)
 files.delete(path);expect(cache.savedImage('u:cloud://image')).toBeUndefined()
})
it('bounds saved files and removes invalidated images',async()=>{
 const cache=await import('../wechat/miniprogram/services/saved-images.js');for(let i=0;i<13;i++)await cache.saveImage('u:'+i,'/temp')
 expect(disk).toHaveLength(12);expect(removed).toHaveLength(1)
 cache.forgetSavedImage('u:12');expect(cache.savedImage('u:12')).toBeUndefined();expect(disk).toHaveLength(11)
})
it('falls back to temporary file when saving fails or invalidated',async()=>{
 const cache=await import('../wechat/miniprogram/services/saved-images.js');expect(await cache.saveImage('u:x','/temp',()=>false)).toBe('/temp');expect(copied).toHaveLength(0)
 ;(globalThis as any).wx.getFileInfo=({fail}:any)=>fail(Error('quota'));expect(await cache.saveImage('u:x','/temp')).toBe('/temp')
})

it('expires saved images and caps total bytes before copying',async()=>{
 vi.useFakeTimers();const cache=await import('../wechat/miniprogram/services/saved-images.js')
 ;(globalThis as any).wx.getFileInfo=({success}:any)=>success({size:20*1024*1024})
 const first=await cache.saveImage('u:a','/temp');await cache.saveImage('u:b','/temp');expect(files.has(first)).toBe(false);expect(disk).toHaveLength(1)
 vi.advanceTimersByTime(7*24*60*60*1000+1);expect(cache.savedImage('u:b')).toBeUndefined();expect(files.size).toBe(0)
})
it('does not leave unindexed files when metadata storage is full',async()=>{
 const cache=await import('../wechat/miniprogram/services/saved-images.js')
 ;(globalThis as any).wx.setStorageSync=()=>{throw Error('quota')}
 expect(await cache.saveImage('u:x','/temp')).toBe('/temp');expect(files.size).toBe(0)
})
