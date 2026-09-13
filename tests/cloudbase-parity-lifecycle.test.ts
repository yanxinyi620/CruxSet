import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
function runtime(name: string, initial: Record<string, any[]> = {}) {
 const rows: Record<string, any[]> = {users:[{id:'u',openid:'secret',displayName:'Admin'}],admins:[{userId:'u'}],walls:[],problems:[],...initial}
 function collection(name: string) {
  rows[name] ||= []
  let filter:any={}, offset=0, size=20
  const q:any={async count(){return {total:rows[name].filter(x=>Object.entries(filter).every(([k,v])=>x[k]===v)).length}},where(f:any){filter=f;return q},orderBy(){return q},skip(n:number){offset=n;return q},limit(n:number){size=n;return q},async get(){return {data:rows[name].filter(x=>Object.entries(filter).every(([k,v])=>x[k]===v)).slice(offset,offset+size).map(x=>({...x}))}},doc(id:string){return {async get(){return {data:rows[name].find(x=>(x.id||x._id)===id)}},async set({data}:any){rows[name]=rows[name].filter(x=>(x.id||x._id)!==id);rows[name].push({...data,_id:id})},async update({data}:any){Object.assign(rows[name].find(x=>(x.id||x._id)===id),data)},async remove(){rows[name]=rows[name].filter(x=>(x.id||x._id)!==id)}}},async update({data}:any){for(const r of rows[name].filter(x=>Object.entries(filter).every(([k,v])=>x[k]===v)))Object.assign(r,data)}};return q
 }
 const transactionOperations:number[]=[]
 const makeTransaction=()=>{
  let operations=0
  return {collection:(name:string)=>new Proxy({doc:(id:string)=>new Proxy(collection(name).doc(id),{get(target:any,key){return async(...args:any[])=>{if(++operations>100)throw new Error('TRANSACTION_OPERATION_LIMIT');return target[key](...args)}}})},{get(target,key){if(key==='doc')return target.doc;throw new Error(`TRANSACTION_QUERY_UNSUPPORTED:${String(key)}`)}}),operationCount:()=>operations}
 }
 const transaction=makeTransaction()
 const db:any={collection,runTransaction:async(fn:any)=>{const snapshot=JSON.parse(JSON.stringify(rows));const tx=makeTransaction();try{return await fn(tx)}catch(error){for(const key of Object.keys(rows))delete rows[key];Object.assign(rows,snapshot);throw error}finally{transactionOperations.push(tx.operationCount())}}}

 const deleted:string[]=[]
 const cloud={init(){},getWXContext:()=>({OPENID:'secret'}),database:()=>db,uploadFile:async()=>({fileID:'cloud://env/admin/image.png'}),deleteFile:async({fileList}:any)=>{deleted.push(...fileList);return {fileList:fileList.map((fileID:string)=>({fileID,status:0}))}}};
 const filename=resolve(`wechat/cloudfunctions/${name}/index.js`), exports:any={}
 vm.runInNewContext(readFileSync(filename,'utf8'),{require:(s:string)=>s==='wx-server-sdk'?cloud:s.startsWith('./')?require(resolve(`wechat/cloudfunctions/${name}`,s)):createRequire(filename)(s),exports,module:{exports},Buffer,Date,Math,process:{env:{...process.env,CRUXSET_CLOUDBASE_SIGNING_KEY:'test-key'}},console})
 return {main:exports.main,rows,deleted,cloud,db,transaction,transactionOperations}
}
it('lists every browse wall and limits problem filters to supported metadata',async()=>{
 const walls=Array.from({length:123},(_,i)=>({id:`w${i}`,visibility:'public',holds:[{},{}]}));const r=runtime('wallManager',{walls,problems:[{id:'p',wallId:'w0',createdBy:'u'}]})
 expect((await r.main({action:'listBrowseWalls'})).length).toBe(123)
 expect((await r.main({action:'listProblems',data:{wallId:'w0',createdBy:'attacker'}})).length).toBe(1)
})
it('returns safe admin user records',async()=>{const r=runtime('wallManager');expect(await r.main({action:'listUsers'})).toEqual([{id:'u',displayName:'Admin',isAdmin:true,createdAt:undefined}])})
it('cascades more than one page and retains shared images',async()=>{const r=runtime('wallManager',{walls:[{id:'w',ownerId:'u',imageFileId:'cloud://shared'},{id:'other',imageFileId:'cloud://shared'}],problems:Array.from({length:123},(_,i)=>({id:`p${i}`,wallId:'w'}))});expect(await r.main({action:'inspectWallDeletion',data:{wallId:'w'}})).toEqual({problemCount:123});expect(await r.main({action:'deleteWall',data:{wallId:'w'}})).toEqual({ok:true});expect(r.rows.problems).toHaveLength(0);expect(r.deleted).toHaveLength(0)})
it('creates only receipt-backed owned drafts and makes publishing immutable',async()=>{const r=runtime('adminWall',{adminUploads:[{id:'upload',fileID:'cloud://image',ownerId:'u',imageWidth:100,imageHeight:100,expiresAt:Date.now()+100000}]});const data={name:'Wall',imageFileId:'cloud://image',imageWidth:100,imageHeight:100,requestId:'request-1'};const w=await r.main({action:'createWall',data});expect(w.visibility).toBe('private');expect((await r.main({action:'createWall',data})).id).toBe(w.id);await r.main({action:'updateWallHolds',data:{wallId:w.id,holds:[{id:'H001',x:.2,y:.2,radius:.05},{id:'H002',x:.8,y:.8,radius:.05}]}});expect((await r.main({action:'publishWall',data:{wallId:w.id}})).visibility).toBe('public');await expect(r.main({action:'updateWallHolds',data:{wallId:w.id,holds:[]}})).rejects.toThrow('WALL_IMMUTABLE')})
it('rejects uploads that do not match their declared image type',async()=>{const r=runtime('adminWall');await expect(r.main({action:'uploadImage',data:{base64:Buffer.from('invalid').toString('base64'),contentType:'image/png',requestId:'upload-1'}})).rejects.toThrow('INVALID_IMAGE')})
it('rejects saving and updating routes while their wall is deleting', async()=>{
 const wall={id:'w',visibility:'public',deleting:true,holds:[{id:'H001'},{id:'H002'}],angleOptions:[20]};const draft={name:'route',angle:20,grade:'V1',holds:{start:['H001'],finish:['H002'],foot:[],hand:[],assist:[]}}
 const saving=runtime('saveProblem',{walls:[wall]});await expect(saving.main({wallId:'w',draft})).rejects.toThrow('WALL_NOT_ROUTABLE')
 const updating=runtime('updateProblem',{walls:[wall],problems:[{id:'p',wallId:'w',createdBy:'u'}]});await expect(updating.main({id:'p',draft})).rejects.toThrow('WALL_NOT_ROUTABLE')
})
it('numbers new drafts beyond every page of existing walls',async()=>{const r=runtime('adminWall',{walls:Array.from({length:123},(_,i)=>({id:`w${i}`,wallNumber:i+1})),adminUploads:[{id:'upload',fileID:'cloud://image',ownerId:'u',imageWidth:100,imageHeight:100,expiresAt:Date.now()+100000}]});expect((await r.main({action:'createWall',data:{name:'Wall',imageFileId:'cloud://image',imageWidth:100,imageHeight:100,requestId:'new'}})).wallNumber).toBe(124)})
it('validates and measures a real PNG, retaining an idempotent upload receipt',async()=>{const r=runtime('adminWall');const data={base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=',contentType:'image/png',requestId:'png'};expect(await r.main({action:'uploadImage',data})).toMatchObject({imageWidth:1,imageHeight:1});expect(await r.main({action:'uploadImage',data})).toMatchObject({imageWidth:1,imageHeight:1})})
it('rejects a truncated PNG even when its IHDR dimensions are valid',async()=>{const r=runtime('adminWall');const data={base64:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC','base64').toString('base64'),contentType:'image/png',requestId:'truncated'};await expect(r.main({action:'uploadImage',data})).rejects.toThrow('INVALID_IMAGE')})

it('keeps failed file cleanup durable and resumes without leaving routes',async()=>{
 const r=runtime('wallManager',{walls:[{id:'w',ownerId:'u',imageFileId:'cloud://unshared'}],problems:[{id:'p',wallId:'w'}]})
 const deletion=r.cloud.deleteFile;r.cloud.deleteFile=async()=>{throw new Error('storage unavailable')}
 expect(await r.main({action:'deleteWall',data:{wallId:'w'}})).toEqual({ok:true,cleanupPending:true});expect(r.rows.problems).toHaveLength(0);expect(r.rows.wallDeletionJobs[0].completed).toBe(false)
 r.cloud.deleteFile=deletion;expect(await r.main({action:'retryCleanup'})).toEqual({ok:true});expect(r.rows.wallDeletionJobs[0].completed).toBe(true)
})
it('allows a non-admin owner to cascade their wall but denies other users and user listing',async()=>{
 const r=runtime('wallManager',{admins:[],walls:[{id:'w',ownerId:'u'},{id:'other',ownerId:'another'}]})
 await expect(r.main({action:'listUsers'})).rejects.toThrow('FORBIDDEN');await expect(r.main({action:'deleteWall',data:{wallId:'other'}})).rejects.toThrow('FORBIDDEN');expect(await r.main({action:'deleteWall',data:{wallId:'w'}})).toEqual({ok:true})
})
it('refuses draft creation from another owner’s upload receipt',async()=>{const r=runtime('adminWall',{adminUploads:[{id:'upload',fileID:'cloud://image',ownerId:'another',imageWidth:100,imageHeight:100,expiresAt:Date.now()+100000}]});await expect(r.main({action:'createWall',data:{name:'Wall',imageFileId:'cloud://image',imageWidth:100,imageHeight:100,requestId:'stolen'}})).rejects.toThrow('INVALID_UPLOAD_RECEIPT')})

it('rejects a signed publish retry after its wall has been deleted',async()=>{
 const crypto=require('node:crypto')
 const publishRequestId='request-deleted'
 const receiptId=`segmentation_${crypto.createHash('sha256').update(publishRequestId).digest('hex')}`
 const payload:any={publishRequestId,sourceExperimentId:'e',sourceCalibrationId:'c',wallName:'Deleted wall',imageWidth:100,imageHeight:100,imageFileId:'cloud://image',ownerOpenid:'secret',timestamp:Math.floor(Date.now()/1000),holds:[{id:'H001',sourceId:'s',kind:'hold',polygon:[[.1,.1],[.9,.1],[.1,.9]],bbox:[.1,.1,.9,.9],x:.3666666667,y:.3666666667,radius:Math.sqrt(.32/Math.PI)}]}
 const canonical=(v:any):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v)
 payload.signature=crypto.createHmac('sha256','test-key').update(canonical(payload)).digest('hex')
 const r=runtime('segmentationPublish',{segmentationPublishes:[{id:receiptId,wallId:'deleted',deleted:true}]})
 await expect(r.main(payload)).rejects.toThrow('WALL_DELETED');expect(r.rows.walls).toHaveLength(0)
 const fresh=runtime('segmentationPublish');expect(await fresh.main(payload)).toMatchObject({created:true});expect(await fresh.main(payload)).toMatchObject({created:false})
})
it('preserves detected polygons and derives their bounding boxes',async()=>{
 const r=runtime('adminWall',{walls:[{id:'w',ownerId:'u',visibility:'private',holds:[]}]})
 const polygon=[[.1,.1],[.4,.1],[.1,.4]]
 const result=await r.main({action:'updateWallHolds',data:{wallId:'w',holds:[{id:'H001',x:.2,y:.2,radius:.05,kind:'hold',polygon}]}})
 expect(result.geometryType).toBe('polygon');expect(result.holds[0].polygon).toEqual(polygon);expect(result.holds[0].bbox).toEqual([.1,.1,.4,.4])
 await expect(r.main({action:'updateWallHolds',data:{wallId:'w',holds:[{id:'H001',x:.2,y:.2,radius:.05,polygon:[[0,0],[1,0],[2,1]]}]}})).rejects.toThrow('INVALID_HOLDS')
})
it('returns an already published owned wall when publication is retried',async()=>{
 const wall={id:'w',ownerId:'u',visibility:'public',published:true,holds:[{id:'H001',x:.2,y:.2,radius:.05},{id:'H002',x:.8,y:.8,radius:.05}]}
 const r=runtime('adminWall',{walls:[wall]});expect(await r.main({action:'publishWall',data:{wallId:'w'}})).toMatchObject(wall)
 await expect(r.main({action:'updateWallHolds',data:{wallId:'w',holds:[]}})).rejects.toThrow('WALL_IMMUTABLE')
})

it('resumes a concurrent deletion when the wall disappears before the transaction',async()=>{
 const r=runtime('wallManager',{walls:[{id:'w',ownerId:'u'}]})
 r.db.runTransaction=async(fn:any)=>{r.rows.walls=[];r.rows.wallDeletionJobs=[{id:'w',ownerId:'u',files:[],completed:false}];return fn(r.transaction)}
 expect(await r.main({action:'deleteWall',data:{wallId:'w'}})).toEqual({ok:true});expect(r.rows.wallDeletionJobs[0].completed).toBe(true)
})
it('serves a shared image when a public reference follows inaccessible private walls',async()=>{
 const walls=Array.from({length:123},(_,i)=>({id:`w${i}`,ownerId:'someone',visibility:'private',imageFileId:'cloud://shared'}));walls.push({id:'public',ownerId:'someone',visibility:'public',imageFileId:'cloud://shared'})
 const r=runtime('getWallImageUrl',{walls,admins:[]});(r.cloud as any).getTempFileURL=async()=>({fileList:[{tempFileURL:'https://image.example/shared'}]})
 expect(await r.main({fileID:'cloud://shared'})).toEqual({url:'https://image.example/shared'})
})
it('does not serve images referenced only by deleting walls',async()=>{
 const r=runtime('getWallImageUrl',{walls:[{id:'w',ownerId:'u',visibility:'public',imageFileId:'cloud://image',deleting:true}]});(r.cloud as any).getTempFileURL=async()=>({fileList:[{tempFileURL:'https://image.example/shared'}]})
 await expect(r.main({fileID:'cloud://image'})).rejects.toThrow('WALL_IMAGE_NOT_FOUND')
})
it('retains durable cleanup details when an expired upload deletion throws',async()=>{
 const r=runtime('adminWall')
 r.cloud.uploadFile=async()=>{r.rows.adminUploads[0].expiresAt=0;r.rows.adminUploads[0].reclaimed=true;return {fileID:'cloud://expired-upload'}}
 r.cloud.deleteFile=async()=>{throw new Error('storage unavailable')}
 const data={base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=',contentType:'image/png',requestId:'expire'}
 await expect(r.main({action:'uploadImage',data})).rejects.toThrow('UPLOAD_EXPIRED')
 expect(r.rows.adminUploads[0]).toMatchObject({fileID:'cloud://expired-upload',reclaimed:false,reclaiming:true,lastError:'storage unavailable'})
})

it('retains deleting walls in owner/admin lists and reports an unfinished route cascade',async()=>{
 const r=runtime('wallManager',{walls:[{id:'w',ownerId:'u',visibility:'public',deleting:true,holds:[{},{}]}],problems:Array.from({length:2001},(_,i)=>({id:`p${i}`,wallId:'w'}))})
 expect(await r.main({action:'listMyWalls'})).toHaveLength(1);expect(await r.main({action:'listAdminWalls'})).toHaveLength(1);expect(await r.main({action:'listBrowseWalls'})).toHaveLength(0)
 expect(await r.main({action:'deleteWall',data:{wallId:'w'}})).toEqual({ok:true,cleanupPending:true,deletionPending:true})
 expect(await r.main({action:'listMyWalls'})).toHaveLength(1)
 expect(await r.main({action:'deleteWall',data:{wallId:'w'}})).toEqual({ok:true});expect(r.rows.problems).toHaveLength(0)
})

it('backfills 123 legacy wall numbers in bounded document-only transactions',async()=>{
 const r=runtime('adminWall',{walls:Array.from({length:123},(_,i)=>({id:`old${i}`,createdAt:i,ownerId:'u'})),adminUploads:[{id:'upload',fileID:'cloud://image',ownerId:'u',imageWidth:100,imageHeight:100,expiresAt:Date.now()+100000}]})
 const wall=await r.main({action:'createWall',data:{name:'New',imageFileId:'cloud://image',imageWidth:100,imageHeight:100,requestId:'backfill'}})
 expect(wall.wallNumber).toBe(124);expect(new Set(r.rows.walls.map(w=>w.wallNumber)).size).toBe(124);expect(r.rows.walls.every(w=>Number.isInteger(w.wallNumber))).toBe(true);expect(Math.max(...r.transactionOperations)).toBeLessThanOrEqual(100)
})

it('saves and updates a route with a paginated legacy sequence using document-only transactions',async()=>{
 const wall={id:'w',wallNumber:7,visibility:'public',holds:[{id:'H001'},{id:'H002'}],angleOptions:[20]};const draft={name:'route',angle:20,grade:'V1',holds:{start:['H001'],finish:['H002'],foot:[],hand:[],assist:[]}}
 const r=runtime('saveProblem',{walls:[wall],problems:Array.from({length:123},(_,i)=>({id:`p${i}`,wallId:'w',number:`CS-07${String(i+1).padStart(4,'0')}`}))})
 expect(await r.main({wallId:'w',draft})).toMatchObject({number:'CS-070124'})
 const saved=r.rows.problems.find(p=>p.number==='CS-070124');const updating=runtime('updateProblem',{walls:r.rows.walls,problems:[saved]});expect(await updating.main({id:saved.id,draft:{...draft,name:'updated'}})).toMatchObject({number:'CS-070124'});expect(updating.rows.walls[0].routeRevision).toBe(2)
})
it('uses existing walls rather than an old counter',async()=>{
 const r=runtime('adminWall',{walls:[{id:'old',wallNumber:50}],adminUploads:[{id:'upload',fileID:'cloud://image',ownerId:'u',imageWidth:100,imageHeight:100,expiresAt:Date.now()+100000}]})
 const base=r.db.runTransaction;let advanced=false;r.db.runTransaction=async(fn:any)=>{if(!advanced){r.rows.counters=[{id:'wall_number',value:200}];advanced=true}return base(fn)}
 expect((await r.main({action:'createWall',data:{name:'New',imageFileId:'cloud://image',imageWidth:100,imageHeight:100,requestId:'concurrent'}})).wallNumber).toBe(51)
 expect(r.rows.walls.find(w=>w.id==='old').wallNumber).toBe(50)
})

it('restarts wall numbering after all walls are removed',async()=>{
 const r=runtime('adminWall',{counters:[{id:'wall_number',value:200}],adminUploads:[{id:'upload',fileID:'cloud://image',ownerId:'u',imageWidth:100,imageHeight:100,expiresAt:Date.now()+100000}]})
 expect((await r.main({action:'createWall',data:{name:'New',imageFileId:'cloud://image',imageWidth:100,imageHeight:100,requestId:'reset'}})).wallNumber).toBe(1)
})
it.each([[[]],[[1,3]]])('allocates routes from existing numbers despite stale counters: %j',async(...args)=>{
 const numbers=args[0] as number[]
 const r=runtime('saveProblem',{walls:[{id:'w',wallNumber:7,visibility:'public',holds:[{id:'a'},{id:'b'}],angleOptions:[20]}],counters:[{id:'routes_w',value:200}],problems:numbers.map(n=>({id:`p${n}`,wallId:'w',number:`CS-07${String(n).padStart(4,'0')}`}))})
 expect(await r.main({wallId:'w',draft:{angle:20,grade:'V2',holds:{start:['a'],finish:['b']}}})).toMatchObject({number:numbers.length?'CS-070004':'CS-070001'})
})
it('rescans current walls when a transaction callback is retried',async()=>{
 const r=runtime('adminWall',{walls:[{id:'old',wallNumber:1}],adminUploads:[{id:'upload',fileID:'cloud://image',ownerId:'u',imageWidth:100,imageHeight:100,expiresAt:Date.now()+100000}]})
 const base=r.db.runTransaction
 r.db.runTransaction=async(fn:any)=>{
  const snapshot=structuredClone(r.rows)
  await base(fn)
  for(const key of Object.keys(r.rows))delete r.rows[key]
  Object.assign(r.rows,snapshot)
  r.rows.walls.push({id:'concurrent',wallNumber:2})
  r.rows.counters=[{id:'wall_number',value:2,revision:1}]
  return base(fn)
 }
 expect((await r.main({action:'createWall',data:{name:'New',imageFileId:'cloud://image',imageWidth:100,imageHeight:100,requestId:'retry'}})).wallNumber).toBe(3)
})
it('rescans current routes when a transaction callback is retried',async()=>{
 const r=runtime('saveProblem',{walls:[{id:'w',wallNumber:7,visibility:'public',holds:[{id:'a'},{id:'b'}],angleOptions:[20]}]})
 const base=r.db.runTransaction
 r.db.runTransaction=async(fn:any)=>{
  const snapshot=structuredClone(r.rows)
  await base(fn)
  for(const key of Object.keys(r.rows))delete r.rows[key]
  Object.assign(r.rows,snapshot)
  r.rows.walls[0].routeRevision=1
  r.rows.problems.push({id:'concurrent',wallId:'w',number:'CS-070001'})
  return base(fn)
 }
 expect(await r.main({wallId:'w',draft:{angle:20,grade:'V2',holds:{start:['a'],finish:['b']}}})).toMatchObject({number:'CS-070002'})
})

it('includes all route counts in browse walls including zero and more than one page',async()=>{
 const r=runtime('wallManager',{walls:[{id:'w',visibility:'public',holds:[{},{}]},{id:'empty',visibility:'public',holds:[{},{}]},{id:'private',visibility:'private',holds:[{},{}]}],problems:[...Array.from({length:123},(_,i)=>({id:`p${i}`,wallId:'w'})),{id:'hidden',wallId:'private'}]})
 const walls=await r.main({action:'listBrowseWalls'})
 expect(walls.map((w:any)=>({id:w.id,problemCount:w.problemCount}))).toEqual([{id:'w',problemCount:123},{id:'empty',problemCount:0}])
})
it('returns compact browse summaries while preserving full wall detail',async()=>{
 const holds=Array.from({length:369},(_,i)=>({id:`H${i}`,polygon:Array.from({length:100},()=>[.123456789,.987654321])}))
 const r=runtime('wallManager',{walls:[{id:'w',name:'Wall',visibility:'public',holds}]})
 const walls=await r.main({action:'listBrowseWalls'})
 expect(walls[0]).toMatchObject({id:'w',holdCount:369,problemCount:0})
 expect(walls[0]).not.toHaveProperty('holds')
 expect(JSON.stringify(walls).length).toBeLessThan(1000)
 expect((await r.main({action:'getWall',data:{id:'w'}})).holds).toEqual(holds)
})
