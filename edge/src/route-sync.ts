import core from '../../wechat/cloudfunctions/routeSync/fingerprint.js'
import { digest, fail, type LabEnv, type Row } from './lab/common.js'
import { canonical } from './lab/cloudbase.js'

type Bridge = (payload: Row) => Promise<Row>
export async function loadSyncWall(db: D1Database, id: string): Promise<Row> {
  const w = await db.prepare('SELECT * FROM walls WHERE id=?').bind(id).first<Row>()
  if (!w || !w.published || w.visibility !== 'public') fail('WALL_NOT_ROUTABLE','请选择已发布的墙面。',409)
  const source = await db.prepare('SELECT experiment_id,calibration_id FROM wall_sync_sources WHERE wall_id=?').bind(id).first<Row>()
  const holds = await db.prepare('SELECT * FROM holds WHERE wall_id=? ORDER BY id').bind(id).all<Row>()
  return {...w,wallNumber:w.wall_number,angleOptions:JSON.parse(w.angle_options_json),source,
    holds:holds.results.map(h=>({...h,polygon:h.polygon_json?JSON.parse(h.polygon_json):undefined}))}
}
async function problems(db: D1Database, id: string): Promise<Row[]> {
  // One statement gives metadata and assignments the same SQLite snapshot.
  const data=await db.prepare('SELECT p.*,h.hold_id,h.role FROM problems p LEFT JOIN problem_holds h ON h.problem_id=p.id AND h.wall_id=p.wall_id WHERE p.wall_id=? ORDER BY p.id,h.role,h.hold_id').bind(id).all<Row>()
  const rows=new Map<string,Row>()
  for(const item of data.results) {
    if(!rows.has(item.id)) rows.set(item.id,{...item,footRule:item.foot_rule,holds:Object.fromEntries(core.roles.map(role=>[role,[]]))})
    if(item.role!==null && item.hold_id!==null) (rows.get(item.id)!.holds[item.role]??=[]).push(item.hold_id)
  }
  return [...rows.values()]
}
async function exported(wall: Row, rows: Row[]) {
  const routes=new Map<string,Row>(), invalid:Row[]=[]
  const g=await core.geometry(wall,digest)
  for(const p of rows) try {const wire=await core.exportRoute(wall,p,digest,g);if(!routes.has(wire.fingerprint))routes.set(wire.fingerprint,wire)} catch(e){invalid.push({id:p.id,message:(e as Error).message})}
  return {routes,invalid}
}
export async function importSyncedRoute(db: D1Database, originalWall: Row, wire: Row, admin: string): Promise<boolean> {
  const expected=(await core.geometry(originalWall,digest)).geometryHash
  for(let attempt=0;attempt<4;attempt++) {
    const rev=await db.prepare('SELECT revision FROM route_sync_revisions WHERE wall_id=?').bind(originalWall.id).first<Row>()
    const wall=await loadSyncWall(db,originalWall.id),g=await core.geometry(wall,digest)
    if(g.geometryHash!==expected) throw new Error('WALL_CHANGED')
    const draft=await core.importRoute(wall,wire,digest,g), rows=await problems(db,wall.id), current=await exported(wall,rows)
    if(current.routes.has(wire.fingerprint)) return false
    const number=Math.max(0,...rows.map(p=>Number(String(p.number).slice(-4))).filter(Number.isInteger))+1
    if(number>9999 || !Number.isInteger(wall.wallNumber) || wall.wallNumber<1) throw new Error('ROUTE_NUMBER_EXHAUSTED')
    const id=`problem_${crypto.randomUUID()}`, now=Date.now()
    const statements=[db.prepare(`INSERT INTO problems (id,number,wall_id,name,description,angle,grade,foot_rule,created_by,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM route_sync_revisions r JOIN walls w ON w.id=r.wall_id WHERE r.wall_id=? AND r.revision=? AND w.published=1 AND w.visibility='public') RETURNING id`)
      .bind(id,`CS-${String(wall.wallNumber).padStart(2,'0')}${String(number).padStart(4,'0')}`,wall.id,draft.name,draft.description,draft.angle,draft.grade,draft.footRule,admin,now,now,wall.id,rev?.revision)]
    for(const role of core.roles) for(const hold of draft.holds[role]) statements.push(db.prepare('INSERT INTO problem_holds (problem_id,wall_id,hold_id,role) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM problems WHERE id=?)').bind(id,wall.id,hold,role,id))
    const result=await db.batch(statements)
    if(result[0].results?.length) return true
  }
  throw new Error('WALL_BUSY_RETRY')
}
export function cloudbaseBridge(env: LabEnv): Bridge {
  return async payload=>{
    if(!env.CRUXSET_CLOUDBASE_ROUTE_SYNC_URL?.startsWith('https://')||!env.CRUXSET_CLOUDBASE_SIGNING_KEY) fail('SYNC_NOT_CONFIGURED','小程序线路同步尚未配置，请配置同步云函数地址与签名密钥。',503)
    const body={...payload,timestamp:Math.floor(Date.now()/1000)}
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.CRUXSET_CLOUDBASE_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign'])
    const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(canonical(body))))].map(n=>n.toString(16).padStart(2,'0')).join('')
    const response=await fetch(env.CRUXSET_CLOUDBASE_ROUTE_SYNC_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,signature}),signal:AbortSignal.timeout(30000)})
    const result=await response.json() as Row
    if(!response.ok||result.error) throw new Error(`小程序同步失败：${String(result.error?.message||result.error||result.message||'REMOTE_SYNC_FAILED').slice(0,200)}`)
    return result
  }
}
export async function syncWall(db:D1Database,id:string,admin:string,action:'preview'|'sync',bridge:Bridge) {
  const wall=await loadSyncWall(db,id),g=await core.geometry(wall,digest)
  if(!wall.source?.experiment_id||!wall.source?.calibration_id) fail('WALL_SOURCE_MISSING','墙面缺少发布来源，无法可靠匹配；请先从同一校准发布到两端。',409)
  const selector={experimentId:wall.source.experiment_id,calibrationId:wall.source.calibration_id,geometryHash:g.geometryHash}
  const {routes:local,invalid}=await exported(wall,await problems(db,id)), remote=new Map<string,Row>()
  let offset=0,remoteWall:Row|undefined,snapshotHash:string|undefined
  for(let page=0;page<=500;page++) {
    const data=await bridge({action:'snapshot',selector,offset})
    if(offset&&(!snapshotHash||data.snapshotHash!==snapshotHash)) throw new Error('REMOTE_ROUTES_CHANGED_RETRY')
    snapshotHash=data.snapshotHash
    if(data.wall?.geometryHash!==g.geometryHash||(remoteWall&&remoteWall.id!==data.wall.id)) throw new Error('WALL_GEOMETRY_MISMATCH')
    remoteWall=data.wall
    for(const wire of data.routes){await core.importRoute(wall,wire,digest,g);if(!remote.has(wire.fingerprint))remote.set(wire.fingerprint,wire)}
    invalid.push(...(data.invalid??[]).map((i:Row)=>({...i,platform:'cloudbase'})))
    if(data.nextOffset===null) break
    if(!Number.isInteger(data.nextOffset)||data.nextOffset<=offset||page===500) throw new Error('INVALID_REMOTE_PAGINATION')
    offset=data.nextOffset
  }
  const toLocal=[...remote.keys()].filter(k=>!local.has(k)).sort(),toRemote=[...local.keys()].filter(k=>!remote.has(k)).sort()
  const result={localWall:{id,name:wall.name,wallNumber:wall.wallNumber},remoteWall,missingLocal:toLocal.length,missingRemote:toRemote.length,common:[...local.keys()].filter(k=>remote.has(k)).length,invalid,addedLocal:0,addedRemote:0,skipped:0,failed:[] as Row[],remainingLocal:toLocal.length,remainingRemote:toRemote.length}
  if(action==='sync') {
    for(const key of toLocal.slice(0,5)) try {const added=await importSyncedRoute(db,wall,remote.get(key)!,admin);result[added?'addedLocal':'skipped']++;result.remainingLocal--} catch(e){result.failed.push({direction:'local',message:(e as Error).message})}
    for(const key of toRemote.slice(0,5)) try {
      const currentWall=await loadSyncWall(db,id)
      if((await core.geometry(currentWall,digest)).geometryHash!==g.geometryHash) throw new Error('WALL_CHANGED')
      const current=await exported(currentWall,await problems(db,id))
      if(!current.routes.has(key)) throw new Error('SOURCE_ROUTE_CHANGED')
      const outcome=await bridge({action:'import',selector:{...selector,wallId:remoteWall!.id},route:current.routes.get(key)})
      if(typeof outcome.added!=='boolean') throw new Error('INVALID_REMOTE_RESULT')
      result[outcome.added?'addedRemote':'skipped']++;result.remainingRemote--
    } catch(e){result.failed.push({direction:'cloudbase',message:(e as Error).message})}
  }
  return result
}
