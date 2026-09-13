import { expect, it } from 'vitest'
import worker from '../src/index.js'
import { database } from './helpers/database.js'

it.each([[[], 'CS-030001'], [[1, 3], 'CS-030004'], [[1, 12], 'CS-030013']])('numbers new routes after the current wall maximum: %j', async (sequences, expected) => {
  const { sqlite, db } = database()
  sqlite.exec("INSERT INTO users VALUES ('admin','Admin',1,1); INSERT INTO admins (user_id,role,created_at,updated_at,email_normalized,password_hash) VALUES ('admin','admin',1,1,'admin@example.com','x'); INSERT INTO walls VALUES ('wall',3,'Wall','','image',100,100,'circle','[20]','admin','public',1,1,1); INSERT INTO walls VALUES ('other',4,'Other','','image',100,100,'circle','[20]','admin','public',1,1,1);")
  const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('session')))].map(x => x.toString(16).padStart(2, '0')).join('')
  sqlite.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(tokenHash, 'admin', Date.now() + 3600000, Date.now())
  for (const id of ['A', 'B']) sqlite.prepare('INSERT INTO holds (wall_id,id,x,y,radius,kind) VALUES (?,?,?,?,?,?)').run('wall', id, .1, .1, .1, 'hold')
  for (const n of sequences) sqlite.prepare('INSERT INTO problems VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(`p${n}`, `CS-03${String(n).padStart(4, '0')}`, 'wall', null, null, 20, 'V2', 'feet_follow', 'admin', 1, 1)
  sqlite.exec("INSERT INTO problems VALUES ('other-route','CS-040099','other',NULL,NULL,20,'V2','feet_follow','admin',1,1)")
  const response = await worker.fetch(new Request('https://cruxset.xinyilab.top/api/v1/problems', {
    method: 'POST', headers: { Cookie: 'cruxset_session=session', Origin: 'https://cruxset.xinyilab.top', 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallId: 'wall', angle: 20, grade: 'V2', holds: { start: ['A'], finish: ['B'] } }),
  }), { DB: db, ASSETS: {} as Fetcher }, {} as never)
  expect(response.status).toBe(201)
  expect((await response.json() as any).problem.number).toBe(expected)
})
