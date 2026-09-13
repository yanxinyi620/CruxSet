import { expect,it } from 'vitest'
import { runSyncBatches } from '../web/src/route-sync.js'
const result=(extra={})=>({missingLocal:1,missingRemote:1,common:0,invalid:[],addedLocal:1,addedRemote:1,skipped:0,failed:[],remainingLocal:0,remainingRemote:0,...extra})
it('accumulates bounded batches and stops when a partial failure requires retry',async()=>{
 const pages=[result({remainingLocal:2}),result({addedLocal:0,addedRemote:0,remainingLocal:2,failed:[{message:'timeout'}]})]
 let calls=0
 const total=await runSyncBatches(async()=>pages[calls++] as any,()=>{})
 expect(calls).toBe(2);expect(total.addedLocal).toBe(1);expect(total.failed).toHaveLength(1)
})
it('does not loop forever if a server makes no progress',async()=>{
 let calls=0
 const total=await runSyncBatches(async()=>{calls++;return result({addedLocal:0,addedRemote:0,remainingLocal:2}) as any},()=>{})
 expect(calls).toBe(1);expect(total.failed.length).toBeGreaterThan(0)
})
