import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

it('backfills daily use including deleted tasks without deleting existing over-quota data', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const dir = new URL('../migrations/', import.meta.url)
    for (const file of readdirSync(dir).sort().filter(file=>file<'0011_lab_quotas.sql')) db.exec(readFileSync(new URL(file,dir),'utf8'))
    db.exec("INSERT INTO users VALUES('creator','Creator',1,1); INSERT INTO admins(user_id,role,created_at,updated_at) VALUES('creator','user',1,1)")
    for(let i=0;i<11;i++) db.prepare("INSERT INTO lab_experiments VALUES(?,'creator','image',1,1,'hash','image/png','key',1,NULL)").run('e'+i)
    const beforeMidnight=Date.UTC(2026,8,11,15,59)
    for(let i=0;i<20;i++) db.prepare("INSERT INTO lab_tasks(id,experiment_id,owner_id,attempt_id,model,parameters,status,output_prefix,created_at,updated_at,deadline,deleted_at) VALUES(?,'e0','creator',?,'sam2','{}','failed','key',?,1,1,1)").run('t'+i,'a'+i,beforeMidnight)
    db.exec(readFileSync(new URL('0011_lab_quotas.sql',dir),'utf8'))
    expect(db.prepare('SELECT COUNT(*) n FROM lab_experiments').get().n).toBe(11)
    expect(db.prepare('SELECT * FROM lab_daily_usage').get()).toMatchObject({owner_id:'creator',day:'2026-09-11',task_count:20})
    db.exec('DELETE FROM lab_tasks')
    expect(db.prepare('SELECT task_count FROM lab_daily_usage').get().task_count).toBe(20)
    const insert=db.prepare("INSERT INTO lab_tasks(id,experiment_id,owner_id,attempt_id,model,parameters,status,output_prefix,created_at,updated_at,deadline) VALUES('next','e0','creator','next','sam2','{}','queued','key',?,1,1)")
    expect(()=>insert.run(beforeMidnight)).toThrow('LAB_DAILY_QUOTA')
    insert.run(Date.UTC(2026,8,11,16,0))
    expect(db.prepare("SELECT task_count FROM lab_daily_usage WHERE day='2026-09-12'").get().task_count).toBe(1)
  } finally {db.close()}
})
