import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'
import { database } from './helpers/database.js'

describe('segmentation publish', () => {
  it('verifies HMAC and makes repeated requests idempotent', async () => {
    const { sqlite, db } = database(); sqlite.exec("INSERT INTO users VALUES ('admin','Admin',1,1); INSERT INTO admins (user_id,role,created_at,updated_at,email_normalized,password_hash) VALUES ('admin','admin',1,1,'admin@example.com','x')")
    const objects = new Map<string, Uint8Array>(); const media = { put: async (key:string,value:ReadableStream) => { objects.set(key,new Uint8Array(await new Response(value).arrayBuffer())) }, delete: async (key:string) => { objects.delete(key) } } as unknown as R2Bucket
    const metadata = JSON.stringify({ holds:[{kind:'hold',polygon:[[0,0],[10,0],[10,10]]}], imageHeight:10,imageWidth:10,publishRequestId:'request-1',wallName:'Published wall' })
    const key = await crypto.subtle.importKey('raw',new TextEncoder().encode('secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']); const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(metadata)))].map(x=>x.toString(16).padStart(2,'0')).join('')
    const call = () => { const form=new FormData(); form.set('metadata',metadata); form.set('display_image',new File([new Uint8Array([1])],'wall.webp',{type:'image/webp'})); return worker.fetch(new Request('https://api.cruxset.xinyilab.top/api/v1/admin/segmentation-walls',{method:'POST',headers:{'X-CruxSet-Signature':signature},body:form}),{DB:db,MEDIA:media,SEGMENTATION_PUBLISH_KEY:'secret',ASSETS:{} as Fetcher},{ } as never) }
    expect((await call()).status).toBe(201); expect(objects.size).toBe(1); const second=await call(); expect(second.status).toBe(200); expect(sqlite.prepare('SELECT COUNT(*) n FROM walls').get().n).toBe(1)
  })
})
