import {createRequire} from 'node:module'
import {readFileSync,readdirSync} from 'node:fs'
import {expect,it} from 'vitest'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')

it('backfills source identity without rewriting old calibration data and accepts old explicit inserts',()=>{
  const db=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url)
  try {
    for(const file of readdirSync(dir).sort().filter(f=>f<'0018_lab_calibration_save_dedup.sql'))db.exec(readFileSync(new URL(file,dir),'utf8'))
    db.exec("INSERT INTO users VALUES('admin','Admin',1,1); INSERT INTO admins(user_id,role,created_at,updated_at) VALUES('admin','admin',1,1)")
    db.exec("INSERT INTO lab_experiments VALUES('e','admin','image',1,1,'sha','image/png','input',1,NULL)")
    db.exec("INSERT INTO lab_tasks(id,experiment_id,owner_id,attempt_id,model,parameters,status,output_prefix,created_at,updated_at,deadline) VALUES('t','e','admin','a','sam2','{}','succeeded','task/',1,1,2)")
    const insert=db.prepare("INSERT INTO lab_calibrations(id,experiment_id,source_task_id,candidates_key,display_key,candidate_count,changes,created_at) VALUES(?,'e',?,'data',?,1,'{}',1)")
    insert.run('linked','t','linked.webp');insert.run('orphan',null,'orphan.webp')
    db.exec(readFileSync(new URL('0018_lab_calibration_save_dedup.sql',dir),'utf8'))
    expect(db.prepare('SELECT id,image_source_key,content_hash FROM lab_calibrations ORDER BY id').all()).toEqual([
      {id:'linked',image_source_key:'task/display.webp',content_hash:null},
      {id:'orphan',image_source_key:'orphan.webp',content_hash:null},
    ])
    // The currently deployed Worker uses explicit column names, so no compatibility deployment is needed.
    insert.run('old-worker','t','new.webp')
    expect(db.prepare("SELECT content_hash FROM lab_calibrations WHERE id='old-worker'").get().content_hash).toBeNull()
  }finally{db.close()}
})
