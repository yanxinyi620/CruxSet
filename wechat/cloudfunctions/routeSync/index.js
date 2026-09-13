const crypto = require('crypto')
const {all,find,bootstrapWallNumbers,nextWallNumber} = require('./database.js')
const {geometry,exportRoute,importRoute} = require('./fingerprint.js')
const hash = s => crypto.createHash('sha256').update(s).digest('hex')
const fail = code => { throw new Error(code) }
const canonicalize = value => Array.isArray(value) ? `[${value.map(canonicalize).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}` : JSON.stringify(value)
function createHandler({db,env=process.env,now=Date.now}) {
 return async event => {
  const secret=env.CRUXSET_CLOUDBASE_SIGNING_KEY, openid=env.CRUXSET_CLOUDBASE_OWNER_OPENID
  if (!secret || !openid) fail('ROUTE_SYNC_NOT_CONFIGURED')
  if (event?.httpMethod && event.httpMethod !== 'POST') fail('METHOD_NOT_ALLOWED')
  if (event?.body !== undefined) event=JSON.parse(event.isBase64Encoded ? Buffer.from(event.body,'base64').toString('utf8') : event.body)
  const {signature,...payload}=event || {}
  if (!Number.isInteger(payload.timestamp) || Math.abs(Math.floor(now()/1000)-payload.timestamp)>300) fail('INVALID_TIMESTAMP')
  const expected=crypto.createHmac('sha256',secret).update(canonicalize(payload)).digest('hex')
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature) || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) fail('INVALID_SIGNATURE')
  if (!['snapshot','import','publish-status'].includes(payload.action)) fail('INVALID_ACTION')
  const users=await db.collection('users').where({openid}).limit(2).get()
  if (users.data.length!==1) fail('OWNER_NOT_FOUND')
  const owner=users.data[0]
  if (!(await db.collection('admins').where({userId:owner.id}).limit(1).get()).data.length) fail('OWNER_NOT_ADMIN')
  if (payload.action==='publish-status') {
   if (typeof payload.publishRequestId!=='string' || !/^cloudflare:[\w-]{1,100}$/.test(payload.publishRequestId)) fail('INVALID_REQUEST_ID')
   const receipt=await find(db,'segmentationPublishes','segmentation_'+hash(payload.publishRequestId))
   if (!receipt) return {status:'pending'}
   const wall=await find(db,'walls',receipt.wallId)
   if (receipt.deleted || !wall || wall.deleting || await find(db,'wallDeletionJobs',receipt.wallId)) return {status:'deleted'}
   return {status:'published',wallId:receipt.wallId}
  }
  const selector=payload.selector
  if (!selector || !['experimentId','calibrationId','geometryHash'].every(k=>typeof selector[k]==='string' && selector[k])) fail('INVALID_SELECTOR')
  const candidates=(await all(db.collection('walls').where({'source.experimentId':selector.experimentId,'source.calibrationId':selector.calibrationId}))).filter(w=>!w.deleting && w.visibility==='public')
  if (candidates.length!==1) fail(candidates.length ? 'AMBIGUOUS_WALL' : 'WALL_NOT_FOUND')
  const selected=candidates[0], wallId=selected.id || selected._id
  const checkWall=async wall=>{
   if (!wall || wall.deleting || wall.visibility!=='public' || wall.source?.experimentId!==selector.experimentId || wall.source?.calibrationId!==selector.calibrationId || selector.wallId && selector.wallId!==wallId) fail('WALL_MISMATCH')
   if ((await geometry(wall,hash)).geometryHash!==selector.geometryHash) fail('WALL_GEOMETRY_MISMATCH')
  }
  await checkWall(selected)
  if (payload.action==='snapshot') {
   const offset=payload.offset===undefined ? 0 : payload.offset
   if (!Number.isSafeInteger(offset) || offset<0) fail('INVALID_OFFSET')
   const problems=(await all(db.collection('problems').where({wallId}))).sort((a,b)=>String(a.id||a._id)<String(b.id||b._id)?-1:1)
   const routes=[],invalid=[], prepared=await geometry(selected,hash)
   for (const problem of problems.slice(offset,offset+20)) {
    try {routes.push(await exportRoute(selected,problem,hash,prepared))} catch(error) {invalid.push({id:problem.id||problem._id,message:error.message})}
   }
   return {snapshotHash:hash(canonicalize(problems)),wall:{id:wallId,name:selected.name,wallNumber:selected.wallNumber,geometryHash:selector.geometryHash},routes,invalid,nextOffset:offset+20<problems.length ? offset+20 : null}
  }
  await importRoute(selected,payload.route,hash)
  const observedMax=await bootstrapWallNumbers(db)
  for (let attempt=0;attempt<5;attempt++) {
   const before=await find(db,'walls',wallId)
   await checkWall(before)
   const problems=await all(db.collection('problems').where({wallId}))
   const prepared=await geometry(before,hash)
   let duplicate
   for (const p of problems) {try {if ((await exportRoute(before,p,hash,prepared)).fingerprint===payload.route.fingerprint) {duplicate=p;break}} catch {}}
   const observedRouteMax=Math.max(0,...problems.map(p=>Number(String(p.number||'').slice(-4))).filter(Number.isInteger))
   try {
    return await db.runTransaction(async tx=>{
     const wall=await find(tx,'walls',wallId)
     await checkWall(wall)
     if ((wall.routeRevision||0)!==(before.routeRevision||0)) fail('ROUTE_SYNC_RETRY')
     const draft=await importRoute(wall,payload.route,hash)
     // The same wall document serializes this write with ordinary route creation.
     await tx.collection('walls').doc(wallId).update({data:{routeRevision:(wall.routeRevision||0)+1}})
     if (duplicate) {
      const current = await find(tx,'problems',duplicate.id||duplicate._id)
      if (!current || (await exportRoute(wall,current,hash)).fingerprint!==payload.route.fingerprint) fail('ROUTE_SYNC_RETRY')
      return {status:'existing',added:false,id:duplicate.id||duplicate._id,number:duplicate.number}
     }
     const id=`problem_sync_${crypto.randomUUID()}`
     const counterId=`routes_${wallId}`
     const routeNumber=observedRouteMax+1
     if (routeNumber>9999) fail('ROUTE_NUMBER_EXHAUSTED')
     const wallNumber=wall.wallNumber || await nextWallNumber(tx,observedMax,db)
     if (!wall.wallNumber) await tx.collection('walls').doc(wallId).update({data:{wallNumber}})
     const number=`CS-${String(wallNumber).padStart(2,'0')}${String(routeNumber).padStart(4,'0')}`
     await tx.collection('counters').doc(counterId).set({data:{id:counterId,value:routeNumber}})
     await tx.collection('problems').doc(id).set({data:{...draft,id,number,wallId,createdBy:owner.id,createdAt:now(),updatedAt:now()}})
     return {status:'created',added:true,id,number}
    })
   } catch(error) {if (error.message!=='ROUTE_SYNC_RETRY') throw error}
  }
  fail('ROUTE_SYNC_CONCURRENT_CHANGE')
 }
}
exports.createHandler=createHandler
exports.canonicalize=canonicalize
function httpAdapter(handler) {
 return async event => {
  try {
   const result = await handler(event)
   return event?.httpMethod ? {statusCode:200,headers:{'content-type':'application/json'},body:JSON.stringify(result)} : result
  } catch (error) {
   if (!event?.httpMethod) throw error
   const known = /^(?:INVALID_[A-Z_]+|OWNER_NOT_(?:FOUND|ADMIN)|WALL_(?:NOT_FOUND|MISMATCH|GEOMETRY_MISMATCH)|AMBIGUOUS_WALL|ROUTE_(?:SYNC_[A-Z_]+|NUMBER_EXHAUSTED|FINGERPRINT_MISMATCH)|METHOD_NOT_ALLOWED|DUPLICATE_HOLD_(?:ID|GEOMETRY))$/.test(error.message || '')
   const code = known ? error.message : error instanceof SyntaxError ? 'INVALID_JSON' : 'INTERNAL_ERROR'
   const statusCode = code === 'METHOD_NOT_ALLOWED' ? 405 : ['INVALID_SIGNATURE','INVALID_TIMESTAMP'].includes(code) ? 401 : code === 'OWNER_NOT_ADMIN' ? 403 : code === 'INTERNAL_ERROR' ? 500 : code === 'ROUTE_SYNC_NOT_CONFIGURED' ? 503 : 400
   return {statusCode,headers:{'content-type':'application/json'},body:JSON.stringify({error:{code,message:code}})}
  }
 }
}
exports.httpAdapter=httpAdapter
exports.main=httpAdapter(async event=>{
 const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV})
 return createHandler({db:cloud.database()})(event)
})
