import {createRequire} from 'node:module'
import {createHmac} from 'node:crypto'
import {it,expect} from 'vitest'
const require=createRequire(import.meta.url)
const {createHandler,canonicalize}=require('../wechat/cloudfunctions/routeSync/index.js')
it('rejects absent configuration and forged bridge requests before database access',async()=>{
 const handler=createHandler({db:{},env:{},now:()=>1000})
 await expect(handler({action:'snapshot'})).rejects.toThrow('NOT_CONFIGURED')
 const configured=createHandler({db:{},env:{CRUXSET_CLOUDBASE_SIGNING_KEY:'key',CRUXSET_CLOUDBASE_OWNER_OPENID:'admin'},now:()=>1000})
 await expect(configured({action:'snapshot',timestamp:1,signature:'0'.repeat(64)})).rejects.toThrow('SIGNATURE')
 const payload={action:'snapshot',timestamp:0,selector:{}}
 const signature=createHmac('sha256','key').update(canonicalize(payload)).digest('hex')
 await expect(createHandler({db:{},env:{CRUXSET_CLOUDBASE_SIGNING_KEY:'key',CRUXSET_CLOUDBASE_OWNER_OPENID:'admin'},now:()=>400000})({...payload,signature})).rejects.toThrow('TIMESTAMP')
})
const fixture=require('./fixtures/route-sync.json')
const env={CRUXSET_CLOUDBASE_SIGNING_KEY:'key',CRUXSET_CLOUDBASE_OWNER_OPENID:'admin'}
function database() {
 const tables:any={users:[{id:'owner',openid:'admin'}],admins:[{userId:'owner'}],walls:[{...structuredClone(fixture.wall),visibility:'public',wallNumber:1,source:{experimentId:'exp',calibrationId:'cal'}}],problems:[],counters:[]}
 const db:any={collection:(name:string)=>{
  let filter:any={},offset=0,size=100
  const query:any={where:(f:any)=>{filter=f;return query},skip:(n:number)=>{offset=n;return query},limit:(n:number)=>{size=n;return query},get:async()=>({data:structuredClone(tables[name].filter((r:any)=>Object.entries(filter).every(([k,v])=>k.split('.').reduce((o,key)=>o?.[key],r)===v)).slice(offset,offset+size))}),doc:(id:string)=>({get:async()=>({data:structuredClone(tables[name].find((r:any)=>(r.id||r._id)===id)||null)}),set:async({data}:any)=>{const i=tables[name].findIndex((r:any)=>(r.id||r._id)===id);if(i<0)tables[name].push({...data,_id:id});else tables[name][i]={...data,_id:id}},update:async({data}:any)=>{Object.assign(tables[name].find((r:any)=>(r.id||r._id)===id),data)}})}
  return query
 },runTransaction:async(fn:any)=>fn(db)}
 return {db,tables}
}
const selector={experimentId:'exp',calibrationId:'cal',geometryHash:fixture.geometry.geometryHash}
function sign(payload:any) {const data={...payload,timestamp:1};return {...data,signature:createHmac('sha256','key').update(canonicalize(data)).digest('hex')}}
it('imports under configured admin and dedupes old routes beyond the first query page',async()=>{
 const {db,tables}=database(),handler=createHandler({db,env,now:()=>1000})
 for(let i=0;i<105;i++) tables.problems.push({id:`invalid-${i}`,wallId:'wall-a',number:`CS-01${String(i+1).padStart(4,'0')}`})
 tables.problems.push({...fixture.problem,id:'old',wallId:'wall-a',name:'Other title',number:'CS-010106'})
 expect(await handler(sign({action:'import',selector,route:fixture.wire}))).toMatchObject({status:'existing',id:'old'})
 tables.problems.pop()
 expect(await handler(sign({action:'import',selector,route:fixture.wire}))).toMatchObject({status:'created',number:'CS-010106'})
 expect(tables.problems.at(-1).createdBy).toBe('owner')
 expect(await handler(sign({action:'import',selector,route:fixture.wire}))).toMatchObject({status:'existing'})
})
it('refuses wrong provenance or receiving owner without admin record',async()=>{
 const {db,tables}=database(),handler=createHandler({db,env,now:()=>1000})
 await expect(handler(sign({action:'snapshot',selector:{...selector,wallId:'other'}}))).rejects.toThrow('MISMATCH')
 tables.admins=[]
 await expect(handler(sign({action:'snapshot',selector}))).rejects.toThrow('OWNER_NOT_ADMIN')
})
it('pages invalid snapshot rows and preserves edits when reimporting the original',async()=>{
 const {db,tables}=database(),handler=createHandler({db,env,now:()=>1000})
 await handler(sign({action:'import',selector,route:fixture.wire}))
 tables.problems[0].grade='V3'
 expect(await handler(sign({action:'import',selector,route:fixture.wire}))).toMatchObject({added:true})
 expect(tables.problems).toHaveLength(2)
 expect(tables.problems[0].grade).toBe('V3')
 for(let i=0;i<25;i++) tables.problems.push({id:`bad-${i}`,wallId:'wall-a'})
 const result=await handler(sign({action:'snapshot',selector}))
 expect(result.invalid).toHaveLength(20)
 expect(result.nextOffset).toBe(20)
 const last=await handler(sign({action:'snapshot',selector,offset:20}))
 expect(last.routes).toHaveLength(2)
 expect(last.nextOffset).toBe(null)
 expect(last.snapshotHash).toBe(result.snapshotHash)
 tables.problems[0].name='Edited during pagination'
 expect((await handler(sign({action:'snapshot',selector,offset:20}))).snapshotHash).not.toBe(result.snapshotHash)
})
it('formats HTTP errors without internal details while keeping non-HTTP failures throwable',async()=>{
 const {httpAdapter}=require('../wechat/cloudfunctions/routeSync/index.js')
 const response=await httpAdapter(async()=>{throw new Error('INVALID_SIGNATURE')})({httpMethod:'POST'})
 expect(response.statusCode).toBe(401)
 expect(JSON.parse(response.body)).toEqual({error:{code:'INVALID_SIGNATURE',message:'INVALID_SIGNATURE'}})
 const unknown=await httpAdapter(async()=>{throw new Error('secret database connection details')})({httpMethod:'POST'})
 expect(unknown.statusCode).toBe(500)
 expect(unknown.body).not.toContain('secret')
 await expect(httpAdapter(async()=>{throw new Error('INVALID_SIGNATURE')})({})).rejects.toThrow('INVALID_SIGNATURE')
})

it('restarts imported route numbering after routes are cleared',async()=>{
 const {db,tables}=database(),handler=createHandler({db,env,now:()=>1000})
 tables.counters.push({id:'routes_wall-a',value:200})
 expect(await handler(sign({action:'import',selector,route:fixture.wire}))).toMatchObject({number:'CS-010001'})
})
it('queries signed publication receipts without restoring deleted walls',async()=>{
 const {db,tables}=database(),handler=createHandler({db,env,now:()=>1000})
 tables.segmentationPublishes=[];tables.wallDeletionJobs=[]
 const request=sign({action:'publish-status',publishRequestId:'cloudflare:test'})
 expect(await handler(request)).toEqual({status:'pending'})
 const {createHash}=require('node:crypto')
 tables.segmentationPublishes.push({id:'segmentation_'+createHash('sha256').update('cloudflare:test').digest('hex'),wallId:'wall-a'})
 expect(await handler(request)).toEqual({status:'published',wallId:'wall-a'})
 tables.walls=[]
 expect(await handler(request)).toEqual({status:'deleted'})
})
