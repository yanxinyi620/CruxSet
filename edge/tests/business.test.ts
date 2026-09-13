import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'
import { database } from './helpers/database.js'
const origin = 'https://cruxset.xinyilab.top'
const base = 'https://api.cruxset.xinyilab.top'
function setup() {
  const {sqlite, db} = database()
  const env = { DB: db, ASSETS: {fetch: async () => new Response('asset')} as unknown as Fetcher }
  const call = (path: string, method = 'GET', body?: unknown, cookie?: string, requestOrigin = origin) => worker.fetch(new Request(base + '/api/v1' + path, {method, headers: {Origin: requestOrigin, ...(body ? {'Content-Type':'application/json'} : {}), ...(cookie ? {Cookie: cookie} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}), env, {} as never)
  return {sqlite, call}
}
describe('online business API', () => {
  it('supports accounts, cookies, role checks and revoked sessions', async () => {
    const {call} = setup()
    const response = await call('/auth/register','POST',{email:'user@example.com',password:'correct-password',confirmPassword:'correct-password'})
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie')!.split(';')[0]
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(await (await call('/auth/me','GET',undefined,cookie)).json()).toMatchObject({user:{email:'user@example.com',isAdmin:false}})
    expect((await call('/auth/admin/users','GET',undefined,cookie)).status).toBe(403)
    expect(await (await call('/auth/profile','PATCH',{displayName:'Setter'},cookie)).json()).toMatchObject({user:{displayName:'Setter',isAdmin:false}})
    expect((await call('/auth/profile','PATCH',{displayName:'bad'},cookie,'https://evil.example')).status).toBe(403)
    expect((await call('/auth/logout','POST',undefined,cookie)).status).toBe(200)
    expect((await call('/auth/me','GET',undefined,cookie)).status).toBe(401)
    expect((await call('/auth/admin/login','POST',{email:'user@example.com',password:'wrong'})).status).toBe(401)
    expect((await call('/auth/admin/login','POST',{email:'USER@example.com',password:'correct-password'})).status).toBe(200)
  }, 15000)
  it('rejects upload and wall authoring explicitly; rejects unknown CORS origins', async () => {
    const {call} = setup()
    expect((await call('/media/images','POST')).status).toBe(403)
    expect((await call('/walls','POST',{})).status).toBe(403)
    const preflight = await call('/problems','OPTIONS')
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true')
    expect((await call('/problems','OPTIONS',undefined,undefined,'https://evil.example')).status).toBe(403)
  })
  it('returns complete public bootstrap with capabilities and hides private walls', async () => {
    const {sqlite,call} = setup()
    // Administrator fixtures can exceed creator quotas to exercise full-list pagination.
    sqlite.exec("INSERT INTO users VALUES ('u','Setter',1,1); INSERT INTO admins(user_id,role,created_at,updated_at) VALUES ('u','admin',1,1)")
    for(let i=0;i<55;i++) sqlite.prepare('INSERT INTO walls VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('w'+i,i+1,'Wall','','wall-images/a.webp',100,100,'circle','[20]','u',i===54?'private':'public',i===54?0:1,i,i)
    const body = await (await call('/bootstrap')).json() as any
    expect(body.walls).toHaveLength(54)
    expect(body.capabilities).toMatchObject({writes:true,authentication:true,wallAuthoring:false,imageUpload:false})
    expect(body.walls[0]).toMatchObject({visibility:'public',published:true,ownerId:'u'})
  })
})
it.each(['admin','user','owner'])('wall deletion honors administrator and owner access: %s',async role=>{
 const {sqlite,call}=setup()
 sqlite.exec("INSERT INTO users VALUES ('owner','Owner',1,1),('actor','Actor',1,1); INSERT INTO admins(user_id,role,created_at,updated_at) VALUES ('owner','user',1,1)")
 sqlite.prepare('INSERT INTO admins(user_id,role,created_at,updated_at) VALUES (?,?,1,1)').run('actor',role==='admin'?'admin':'user')
 const actor=role==='owner'?'owner':'actor'
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('delete-session')))].map(x=>x.toString(16).padStart(2,'0')).join('')
 sqlite.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash,actor,Date.now()+60000,Date.now())
 sqlite.exec("INSERT INTO walls VALUES ('wall',5,'Wall','','image',100,100,'circle','[20]','owner','public',1,1,1); INSERT INTO holds (wall_id,id,x,y,radius,kind) VALUES ('wall','A',.1,.1,.1,'hold'); INSERT INTO problems VALUES ('p','CS-050001','wall',NULL,NULL,20,'V2','feet_follow','owner',1,1); INSERT INTO problem_holds VALUES ('p','wall','A','start')")
 const result=await call('/walls/wall','DELETE',undefined,'cruxset_session=delete-session')
 expect(result.status).toBe(role==='user'?404:200)
 for(const table of ['walls','holds','problems','problem_holds'])expect(sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n).toBe(role==='user'?1:0)
})
