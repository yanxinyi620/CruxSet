import {afterEach,expect,it,vi} from 'vitest'
import {database} from './helpers/database.js'
import {reconcilePublishRequests} from '../src/lab/publish-requests.js'
afterEach(()=>vi.unstubAllGlobals())
it('recovers interrupted publication from a receipt and expires missing results without publishing again',async()=>{
 const {db,sqlite}=database()
 for(const id of ['success','missing','deleted']) sqlite.prepare("INSERT INTO lab_publish_requests (id,applicant_id,experiment_id,calibration_id,wall_name,target,status,snapshot_key,created_at,lease_until) VALUES (?,'u','e',?,'Wall','cloudbase','publishing','snapshot',1,1)").run(id,id)
 const fetcher=vi.fn(async(_url:any,init:any)=>{
  const id=JSON.parse(init.body).publishRequestId.split(':')[1]
  return Response.json(id==='success'?{status:'published',wallId:'wall'}:{status:id==='deleted'?'deleted':'pending'})
 })
 vi.stubGlobal('fetch',fetcher)
 await reconcilePublishRequests({DB:db,MEDIA:{} as R2Bucket,CRUXSET_CLOUDBASE_ROUTE_SYNC_URL:'https://example.test',CRUXSET_CLOUDBASE_SIGNING_KEY:'key'})
 expect(sqlite.prepare("SELECT status FROM lab_publish_requests WHERE id='success'").get().status).toBe('published')
 expect(sqlite.prepare("SELECT status FROM lab_publish_requests WHERE id='missing'").get().status).toBe('failed')
 expect(sqlite.prepare("SELECT error FROM lab_publish_requests WHERE id='deleted'").get().error).toContain('已删除')
 expect(fetcher.mock.calls.every(([,init])=>JSON.parse(init.body).action==='publish-status')).toBe(true)
})
it('keeps unknown outcomes pending when the receipt service is unavailable',async()=>{
 const {db,sqlite}=database()
 sqlite.exec("INSERT INTO lab_publish_requests (id,applicant_id,experiment_id,calibration_id,wall_name,target,status,snapshot_key,created_at,lease_until) VALUES ('unknown','u','e','c','Wall','cloudbase','publishing','snapshot',1,1)")
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})))
 await reconcilePublishRequests({DB:db,MEDIA:{} as R2Bucket,CRUXSET_CLOUDBASE_ROUTE_SYNC_URL:'https://example.test',CRUXSET_CLOUDBASE_SIGNING_KEY:'key'})
 expect(sqlite.prepare('SELECT status FROM lab_publish_requests').get().status).toBe('publishing')
})
