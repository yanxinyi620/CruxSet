import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

it('keeps creator applications and receipts while hiding historical administrator direct publications', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const dir = new URL('../migrations/', import.meta.url)
    for (const file of readdirSync(dir).sort().filter(file => file < '0013_lab_publish_request_visibility.sql')) db.exec(readFileSync(new URL(file, dir), 'utf8'))
    db.exec("INSERT INTO users VALUES('admin','Admin',1,1); INSERT INTO admins(user_id,role,created_at,updated_at) VALUES('admin','admin',1,1)")
    const insert = db.prepare("INSERT INTO lab_publish_requests(id,applicant_id,experiment_id,calibration_id,wall_name,target,status,snapshot_key,created_at,reviewer_id) VALUES(?,?,'e',?,'Wall','cloudbase',?,'snapshot',1,?)")
    insert.run('direct','admin','c1','published','admin')
    insert.run('approved','creator','c2','published','admin')
    insert.run('pending','creator','c3','pending',null)
    db.exec(readFileSync(new URL('0013_lab_publish_request_visibility.sql', dir), 'utf8'))
    expect(db.prepare('SELECT id FROM lab_publish_requests WHERE requires_review=1 ORDER BY id').all().map((r:any) => r.id)).toEqual(['approved','pending'])
    expect(db.prepare('SELECT count(*) n FROM lab_publish_requests').get().n).toBe(3)
  } finally { db.close() }
})
