import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
const require = createRequire(import.meta.url)
const core = require('../wechat/cloudfunctions/routeSync/fingerprint.js')
const hash = (s:string) => createHash('sha256').update(s).digest('hex')
const wall = { angleOptions:[20], holds:[{id:'a',kind:'hold',polygon:[[0,0],[1,0],[0,1]]},{id:'b',kind:'hold',x:.7,y:.8,radius:.03}] }
const route = {angle:20,grade:'V2',footRule:'feet_follow',holds:{start:['a'],finish:['b']},name:'Original'}
describe('portable route fingerprints',()=>{
 it('ignores IDs, polygon orientation and prose',async()=>{
 const other = {...wall,holds:[wall.holds[1],{id:'z',kind:'hold',polygon:[[1,0],[0,0],[0,1],[1,0]]}]}
 const wire = await core.exportRoute(wall,route,hash)
 expect((await core.exportRoute(other,{...route,name:'Changed',holds:{start:['z'],finish:['b']}},hash)).fingerprint).toBe(wire.fingerprint)
 expect((await core.importRoute(other,wire,hash)).holds.start).toEqual(['z'])
 })
 it('includes angle grade and roles and rejects forged fingerprints',async()=>{
 const wire = await core.exportRoute(wall,route,hash)
 expect((await core.exportRoute(wall,{...route,grade:'V3'},hash)).fingerprint).not.toBe(wire.fingerprint)
 await expect(core.importRoute(wall,{...wire,fingerprint:'0'.repeat(64)},hash)).rejects.toThrow('FINGERPRINT')
 })
 it('rejects ambiguous geometry and duplicated role assignments',async()=>{
 await expect(core.geometry({...wall,holds:[wall.holds[0],{...wall.holds[0],id:'c'}]},hash)).rejects.toThrow()
 await expect(core.exportRoute(wall,{...route,holds:{start:['a'],finish:['a']}},hash)).rejects.toThrow()
 })
})
it('normalizes legacy null prose and rejects degenerate geometry and unexpected role keys',async()=>{
 expect((await core.exportRoute(wall,{...route,name:null,description:null},hash)).name).toBe('')
 await expect(core.exportRoute(wall,{...route,holds:{...route.holds,typo:['b']}},hash)).rejects.toThrow()
 await expect(core.geometry({...wall,holds:[{id:'a',polygon:[[0,0],[.5,.5],[1,1]]},wall.holds[1]]},hash)).rejects.toThrow()
 await expect(core.geometry({...wall,holds:[{id:'a',x:0,y:0,radius:1e-9},wall.holds[1]]},hash)).rejects.toThrow()
})
it('matches the shared cross-language fixture exactly',async()=>{
 const fixture=require('./fixtures/route-sync.json')
 expect(await core.geometry(fixture.wall,hash)).toEqual(fixture.geometry)
 expect(await core.exportRoute(fixture.wall,fixture.problem,hash)).toEqual(fixture.wire)
})

it('supports published polygons above 256 vertices with stable rotation hashes',async()=>{
 const polygon=Array.from({length:1000},(_,i)=>[.5+.4*Math.cos(i*Math.PI/500),.5+.4*Math.sin(i*Math.PI/500)])
 const large={...wall,holds:[{id:'a',kind:'hold',polygon},wall.holds[1]]}
 const rotated={...large,holds:[{...large.holds[0],polygon:[...polygon.slice(200),...polygon.slice(0,200)].reverse()},wall.holds[1]]}
 expect((await core.geometry(large,hash)).geometryHash).toBe((await core.geometry(rotated,hash)).geometryHash)
})

it.each(Array.from({length:15},(_,i)=>i*5))('round-trips angle %s through sync with legacy wall options',async angle=>{
 const wire=await core.exportRoute(wall,{...route,angle},hash)
 expect((await core.importRoute(wall,wire,hash)).angle).toBe(angle)
})
