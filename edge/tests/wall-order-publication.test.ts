import { expect, it } from 'vitest'
import { database } from './helpers/database.js'
import { listWalls, listAllPublicWalls } from '../src/browse.js'
import { publishCalibration } from '../src/lab/publish.js'
import worker from '../src/index.js'
function fixture() {
 const f=database()
 f.sqlite.exec("INSERT INTO users VALUES ('u','Setter',1,1); INSERT INTO admins(user_id,role,created_at,updated_at) VALUES ('u','admin',1,1)")
 for(const [id,created,updated] of [['old',30,10],['new',10,30],['middle',20,20]] as const) f.sqlite.prepare('INSERT INTO walls VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,created,id,'','image',100,100,'circle','[20]','u','public',1,created,updated)
 return f
}
it('paginates walls by update time without omissions and retains public metadata',async()=>{
 const {db}=fixture()
 let cursor='', ids:string[]=[]
 do {
  const body=await (await listWalls(new Request('https://example.com/?limit=1'+(cursor?'&cursor='+encodeURIComponent(cursor):'')),db)).json() as any
  ids.push(...body.walls.map((w:any)=>w.id))
  expect(body.walls[0]).toMatchObject({visibility:'public',published:true,ownerId:'u'})
  cursor=body.nextCursor
 } while(cursor)
 expect(ids).toEqual(['new','middle','old'])
 expect((await listAllPublicWalls(db) as any[]).map(w=>w.id)).toEqual(ids)
})
it('repeated lab publication keeps the original update time',async()=>{
 const {sqlite,db}=fixture()
 const receipt={wallId:'new',status:'succeeded'}
 await publishCalibration(new Request('https://example.com'),{DB:db} as any,{}, {publish:JSON.stringify(receipt)},'u','Wall')
 expect(sqlite.prepare("SELECT updated_at FROM walls WHERE id='new'").get().updated_at).toBe(30)
})
it.each([true,false])('ordinary publication preserves timestamps on retry (initially published: %s)',async published=>{
 const {sqlite,db}=fixture()
 sqlite.exec("INSERT INTO holds (wall_id,id,x,y,radius,kind) VALUES ('new','a',.1,.1,.1,'hold'),('new','b',.2,.2,.1,'hold')")
 if(!published) sqlite.exec("UPDATE walls SET published=0,visibility='private' WHERE id='new'")
 const token='ordering-session'
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('')
 sqlite.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash,'u',Date.now()+60000,Date.now())
 const response=await worker.fetch(new Request('https://cruxset.xinyilab.top/api/v1/walls/new/publish',{method:'POST',headers:{Origin:'https://cruxset.xinyilab.top',Cookie:'cruxset_session='+token}}),{DB:db,ASSETS:{} as Fetcher},{} as never)
 expect(response.status).toBe(200)
 const timestamp=sqlite.prepare("SELECT updated_at FROM walls WHERE id='new'").get().updated_at
 if(published) expect(timestamp).toBe(30); else expect(timestamp).toBeGreaterThan(30)
 const retry=await worker.fetch(new Request('https://cruxset.xinyilab.top/api/v1/walls/new/publish',{method:'POST',headers:{Origin:'https://cruxset.xinyilab.top',Cookie:'cruxset_session='+token}}),{DB:db,ASSETS:{} as Fetcher},{} as never)
 expect(retry.status).toBe(200)
 expect(sqlite.prepare("SELECT updated_at FROM walls WHERE id='new'").get().updated_at).toBe(timestamp)
})
it('sets update time when a previously private lab wall becomes public',async()=>{
 const {sqlite,db}=fixture()
 sqlite.exec("UPDATE walls SET visibility='private',published=0 WHERE id='new'")
 await publishCalibration(new Request('https://example.com'),{DB:db} as any,{}, {publish:JSON.stringify({wallId:'new'})},'u','Wall')
 expect(sqlite.prepare("SELECT updated_at,visibility,published FROM walls WHERE id='new'").get()).toMatchObject({visibility:'public',published:1,updated_at:expect.any(Number)})
 expect(sqlite.prepare("SELECT updated_at FROM walls WHERE id='new'").get().updated_at).toBeGreaterThan(30)
})
it('uses ID descending to keep tied wall timestamps stable across pages',async()=>{
 const {sqlite,db}=fixture()
 sqlite.exec('UPDATE walls SET updated_at=30')
 let cursor='', ids:string[]=[]
 do {
  const body=await (await listWalls(new Request('https://example.com/?limit=1'+(cursor?'&cursor='+encodeURIComponent(cursor):'')),db)).json() as any
  ids.push(...body.walls.map((w:any)=>w.id));cursor=body.nextCursor
 }while(cursor)
 expect(ids).toEqual(['old','new','middle'])
})
