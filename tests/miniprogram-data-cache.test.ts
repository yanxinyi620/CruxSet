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
it('does not peek hard-expired data', async () => {
 vi.useFakeTimers(); const cache = new ReadCache(1000, 100, { staleTtl: 1000 })
 await cache.read('w', async () => 1); vi.advanceTimersByTime(2001)
 expect(cache.peek('w')).toBeUndefined()
})
it('invalidates selected entries on disk immediately and preserves unrelated pending reads', async () => {
 let disk:any; const cache = new ReadCache(1000, 100, { storage: { read: () => [], write: value => { disk = value } } })
 await cache.read('route', async () => 1)
 let finish:any; const wall = cache.read('wall', () => new Promise(resolve => { finish = resolve }))
 await Promise.resolve(); cache.invalidate(key => key === 'route')
 expect(disk).toEqual([]); finish(2); await wall
 expect(await cache.read('wall', async () => 3)).toBe(2)
})
it('evicts cold completed values instead of recently accessed values', async () => {
 const cache = new ReadCache(30000, 2)
 await cache.read('hot', async () => 1); await cache.read('cold', async () => 2)
 await cache.read('hot', async () => 1); await cache.read('new', async () => 3)
 expect(cache.peek('hot')).toBe(1); expect(cache.peek('cold')).toBeUndefined()
})
it('shares pending requests even when completed entries exceed capacity', async () => {
 const cache = new ReadCache(30000, 1); let finish:any
 const fetch = vi.fn(() => new Promise(resolve => { finish = resolve }))
 const pending = cache.read('slow', fetch); await Promise.resolve()
 await cache.read('other', async () => 2)
 const joined = cache.read('slow', fetch); await Promise.resolve()
 expect(fetch).toHaveBeenCalledTimes(1)
 finish(1); expect(await pending).toBe(1); expect(await joined).toBe(1)
})
it('reserves parent capacity when seeding many child records', async () => {
 const cache = new ReadCache(30000, 5)
 await cache.read('wall', async () => 1)
 await cache.read('list', async () => { for(let i=0;i<120;i++) cache.seed(`p${i}`, i); return [1,2,3] })
 expect(cache.peek('wall')).toBe(1); expect(cache.peek('list')).toEqual([1,2,3])
})
it('forces a fresh request while retaining the usable value on network failure', async () => {
 const cache = new ReadCache(30000, 10, { staleTtl: 86400000 })
 await cache.read('wall', async () => 1)
 expect(await cache.read('wall', async () => 2, { force: true })).toBe(2)
 await expect(cache.read('wall', async () => { throw Error('NETWORK') }, { force: true })).rejects.toThrow('NETWORK')
 expect(cache.peek('wall')).toBe(2)
})
it('waits for a pending background refresh when a forced read joins it', async () => {
 vi.useFakeTimers(); const cache = new ReadCache(1000, 10, { staleTtl: 10000 })
 await cache.read('wall', async () => 1); vi.advanceTimersByTime(1001)
 let finish:any; await cache.read('wall', () => new Promise(resolve => { finish=resolve }))
 const duplicate = vi.fn(async () => 99); const forced = cache.read('wall', duplicate, { force: true })
 finish(2); expect(await forced).toBe(2); expect(duplicate).not.toHaveBeenCalled()
})
it('bounds persisted Unicode by actual UTF-8 JSON bytes', async () => {
 vi.useFakeTimers(); let disk:any
 const cache = new ReadCache(30000, 10, { maxBytes: 300, storage: { read: () => [], write: v => { disk=v } } })
 await cache.read('small', async () => 1); await cache.read('large', async () => '墙'.repeat(90))
 await vi.advanceTimersByTimeAsync(1)
 expect(Buffer.byteLength(JSON.stringify(disk), 'utf8')).toBeLessThanOrEqual(300)
 expect(disk.some((row:any) => row.key==='small')).toBe(true)
})
it('shrinks failed persistence writes and reports restoration without exposing payloads', async () => {
 vi.useFakeTimers(); let disk:any; const events:any[]=[]
 const storage = { read: () => disk, write: (v:any) => { if(v.length>1)throw Error('quota');disk=structuredClone(v) } }
 const cache = new ReadCache(30000, 10, { storage, onDiagnostic: event => events.push(event) })
 await cache.read('old', async () => 'private-a'); await cache.read('new', async () => 'private-b'); await vi.advanceTimersByTimeAsync(1)
 expect(disk.map((row:any)=>row.key)).toEqual(['new'])
 expect(events.some(event=>event.status==='storage-write-failed')).toBe(true)
 new ReadCache(30000, 10, { storage, onDiagnostic: event => events.push(event) })
 expect(events.some(event=>event.status==='restored' && event.entries===1)).toBe(true)
 expect(JSON.stringify(events)).not.toContain('private')
})
it('evicts never-viewed seeded details before a previously viewed wall', async () => {
 const cache=new ReadCache(30000,4)
 await cache.read('wall',async()=>1)
 await cache.read('list',async()=>{cache.seed('p1',1);cache.seed('p2',2);return []})
 await cache.read('next-wall',async()=>2)
 expect(cache.peek('wall')).toBe(1)
})
it('removes an old disk snapshot if even an empty invalidation write fails', async () => {
 vi.useFakeTimers();let disk:any;let broken=false
 const storage={read:()=>disk,write:(value:any)=>{if(broken)throw Error('quota');disk=value},remove:()=>{disk=undefined}}
 const cache=new ReadCache(30000,10,{storage})
 await cache.read('route',async()=>1);await vi.advanceTimersByTimeAsync(1)
 broken=true;cache.clear();expect(disk).toBeUndefined()
})
