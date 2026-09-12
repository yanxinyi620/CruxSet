import { beforeEach, expect, it, vi } from 'vitest'
import { ReadCache } from '../wechat/miniprogram/services/read-cache.js'
beforeEach(() => vi.useRealTimers())
it('shares in-flight requests and expires successful reads', async () => {
 vi.useFakeTimers(); const cache = new ReadCache(1000); const fetch = vi.fn(async () => ({ id:'wall' }))
 await Promise.all([cache.read('wall',fetch),cache.read('wall',fetch)])
 await cache.read('wall',fetch); expect(fetch).toHaveBeenCalledTimes(1)
 vi.advanceTimersByTime(1001); await cache.read('wall',fetch); expect(fetch).toHaveBeenCalledTimes(2)
})
it('retries failures and isolates returned objects', async () => {
 const cache=new ReadCache(); const fetch=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({name:'original'})
 await expect(cache.read('wall',fetch)).rejects.toThrow('offline')
 const wall=await cache.read<any>('wall',fetch);wall.name='edited'
 expect(await cache.read('wall',fetch)).toEqual({name:'original'})
})
it('does not retain an in-flight read after mutation invalidation',async()=>{
 const cache=new ReadCache();let finish:any;const old=cache.read('wall',()=>new Promise(r=>finish=r));await Promise.resolve();cache.clear();finish({name:'old'});await old
 expect(await cache.read('wall',async()=>({name:'new'}))).toEqual({name:'new'})
})
it('serves stale data immediately and notifies when background refresh completes',async()=>{
 vi.useFakeTimers();const cache=new ReadCache(1000,100,{staleTtl:10000});const events:string[]=[];cache.subscribe(k=>events.push(k))
 await cache.read('w',async()=>({name:'old'}));vi.advanceTimersByTime(1001)
 let finish:any;expect(await cache.read('w',()=>new Promise(r=>finish=r))).toEqual({name:'old'})
 finish({name:'new'});await vi.advanceTimersByTimeAsync(1)
 expect(await cache.read('w',async()=>({name:'unexpected'}))).toEqual({name:'new'});expect(events).toContain('w')
})
it('restores bounded persistent data but not invalidated or expired data',async()=>{
 vi.useFakeTimers();let disk:any;const storage={read:()=>disk,write:(v:any)=>{disk=structuredClone(v)}}
 const a=new ReadCache(1000,2,{staleTtl:10000,storage});await a.read('u:w',async()=>({id:1}));await vi.advanceTimersByTimeAsync(1)
 const b=new ReadCache(1000,2,{staleTtl:10000,storage});const fetch=vi.fn(async()=>({id:2}));expect(await b.read('u:w',fetch)).toEqual({id:1});expect(fetch).not.toHaveBeenCalled()
 b.clear();await vi.advanceTimersByTimeAsync(1);const c=new ReadCache(1000,2,{staleTtl:10000,storage});expect(await c.read('u:w',fetch)).toEqual({id:2})
})
it('keeps stale data on network failure but removes revoked data',async()=>{
 vi.useFakeTimers();const cache=new ReadCache(1000,100,{staleTtl:10000});await cache.read('w',async()=>1);vi.advanceTimersByTime(1001)
 expect(await cache.read('w',async()=>{throw Error('offline')})).toBe(1);await vi.advanceTimersByTimeAsync(1)
 expect(await cache.read('w',async()=>{throw Error('WALL_NOT_FOUND')})).toBe(1);await vi.advanceTimersByTimeAsync(1)
 await expect(cache.read('w',async()=>{throw Error('WALL_NOT_FOUND')})).rejects.toThrow('WALL_NOT_FOUND')
})
it('does not persist late responses after clearing and enforces hard expiration',async()=>{
 vi.useFakeTimers();let disk:any;const storage={read:()=>disk,write:(v:any)=>disk=structuredClone(v)}
 const c=new ReadCache(1000,100,{staleTtl:10000,storage});await c.read('w',async()=>1);await vi.advanceTimersByTimeAsync(1001)
 let finish:any;await c.read('w',()=>new Promise(r=>finish=r));c.clear();finish(2);await vi.advanceTimersByTimeAsync(1);expect(disk).toEqual([])
 await c.read('w',async()=>3);await vi.advanceTimersByTimeAsync(11001);await expect(c.read('w',async()=>{throw Error('offline')})).rejects.toThrow('offline')
})
it('limits persisted payload size even when one value is huge',async()=>{
 vi.useFakeTimers();let disk:any;const c=new ReadCache(1000,100,{staleTtl:10000,maxBytes:200,storage:{read:()=>[],write:v=>disk=v}})
 await c.read('small',async()=>1);await c.read('large',async()=>'x'.repeat(500));await vi.advanceTimersByTimeAsync(1)
 expect(disk.map((r:any)=>r.key)).toEqual(['small'])
})
