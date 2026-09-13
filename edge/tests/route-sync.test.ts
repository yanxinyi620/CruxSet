import { expect, it, vi } from 'vitest'
import { database } from './helpers/database.js'
import worker from '../src/index.js'
import { syncWall, loadSyncWall, importSyncedRoute } from '../src/route-sync.js'
import core from '../../wechat/cloudfunctions/routeSync/fingerprint.js'
import { digest } from '../src/lab/common.js'
function setup() {
 const {sqlite,db}=database()
 sqlite.exec(`INSERT INTO users VALUES ('admin','Admin',1,1); INSERT INTO admins (user_id,role,created_at,updated_at,email_normalized,password_hash) VALUES ('admin','admin',1,1,'admin@example.com','x'); INSERT INTO walls VALUES ('wall',3,'Wall','','image',100,100,'polygon','[20,25]','admin','public',1,1,1);`)
 for (const [id,x] of [['A',.1],['B',.5]] as const) sqlite.prepare('INSERT INTO holds (wall_id,id,x,y,radius,kind,polygon_json) VALUES (?,?,?,?,?,?,?)').run('wall',id,x,x,.1,'hold',JSON.stringify([[x,x],[x+.1,x],[x+.1,x+.1],[x,x+.1]]))
 sqlite.prepare('INSERT INTO wall_sync_sources VALUES (?,?,?)').run('wall','exp','cal')
 return {sqlite,db}
}
it('rejects non administrators at the worker boundary',async()=>{
 const {db}=setup(); const response=await worker.fetch(new Request('https://api.cruxset.xinyilab.top/api/v1/admin/walls/wall/route-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"sync"}'}),{DB:db,ASSETS:{} as Fetcher},{} as never)
 expect(response.status).toBe(403)
})
it('previews without writing, fills both directions and skips repeated imports',async()=>{
 const {db,sqlite}=setup(); const wall=await loadSyncWall(db,'wall')
 const draft={angle:20,grade:'V2',footRule:'feet_follow',name:'Local',description:'',holds:{start:['A'],finish:['B']}}
 const wire=await core.exportRoute(wall,draft,digest)
 expect(await importSyncedRoute(db,wall,wire,'admin')).toBe(true)
 const remoteWire=await core.exportRoute(wall,{...draft,grade:'V3'},digest)
 const remote=new Map([[remoteWire.fingerprint,remoteWire]])
 const bridge=vi.fn(async(payload:any)=>payload.action==='snapshot'?{wall:{id:'remote',name:'Remote',wallNumber:8,geometryHash:(await core.geometry(wall,digest)).geometryHash},routes:[...remote.values()],invalid:[],nextOffset:null}:(()=>{const added=!remote.has(payload.route.fingerprint);remote.set(payload.route.fingerprint,payload.route);return {added}})())
 const preview=await syncWall(db,'wall','admin','preview',bridge)
 expect(preview.missingLocal).toBe(1);expect(preview.missingRemote).toBe(1);expect(remote.size).toBe(1)
 const result=await syncWall(db,'wall','admin','sync',bridge)
 expect(result.addedLocal).toBe(1);expect(result.addedRemote).toBe(1)
 const again=await syncWall(db,'wall','admin','sync',bridge)
 expect(again.addedLocal+again.addedRemote).toBe(0)
 expect(sqlite.prepare('SELECT created_by FROM problems').all().every((p:any)=>p.created_by==='admin')).toBe(true)
 expect(sqlite.prepare('SELECT count(*) n FROM problems').get().n).toBe(2)
})
it('rechecks when a native route is created after its initial scan',async()=>{
 const {db,sqlite}=setup(),wall=await loadSyncWall(db,'wall')
 const wire=await core.exportRoute(wall,{angle:20,grade:'V2',footRule:'feet_follow',holds:{start:['A'],finish:['B']}},digest)
 const batch=db.batch.bind(db);let injected=false
 db.batch=async(statements:any)=>{
   if(!injected){injected=true;sqlite.exec("INSERT INTO problems VALUES ('native','CS-030001','wall',NULL,NULL,20,'V2','feet_follow','admin',1,1); INSERT INTO problem_holds VALUES ('native','wall','A','start'),('native','wall','B','finish');")}
   return batch(statements)
 }
 expect(await importSyncedRoute(db,wall,wire,'admin')).toBe(false)
 expect(sqlite.prepare('SELECT count(*) n FROM problems').get().n).toBe(1)
})
