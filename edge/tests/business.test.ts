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
    sqlite.exec("INSERT INTO users VALUES ('u','Setter',1,1)")
    for(let i=0;i<55;i++) sqlite.prepare('INSERT INTO walls VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('w'+i,i+1,'Wall','','wall-images/a.webp',100,100,'circle','[20]','u',i===54?'private':'public',i===54?0:1,i,i)
    const body = await (await call('/bootstrap')).json() as any
    expect(body.walls).toHaveLength(54)
    expect(body.capabilities).toMatchObject({writes:true,authentication:true,wallAuthoring:false,imageUpload:false})
    expect(body.walls[0]).toMatchObject({visibility:'public',published:true,ownerId:'u'})
  })
})
