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
