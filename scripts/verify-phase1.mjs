import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
const root=process.cwd()
const required=['project.config.json','miniprogram/app.json','miniprogram/app.ts','docs/IMPLEMENTATION_PLAN.md','docs/manual-test.md','docs/cloudbase-setup.md','config/cloudbase.collections.json','cloudfunctions/login/index.js','cloudfunctions/saveProblem/index.js','cloudfunctions/deleteProblem/index.js','cloudfunctions/adminLayout/index.js']
const missing=required.filter(file=>!existsSync(join(root,file)))
const config=JSON.parse(readFileSync(join(root,'project.config.json'),'utf8'))
const schema=JSON.parse(readFileSync(join(root,'config/cloudbase.collections.json'),'utf8'))
const expected=['users','walls','layouts','problems','admins','counters']
if(expected.some(name=>!schema.collections.some(collection=>collection.name===name))){console.error('FAIL: CloudBase collection declaration is incomplete');process.exitCode=1}
if(config.appid==='touristappid'||!config.appid) console.warn('WARN: project.config.json still uses a test AppID')
if(missing.length){console.error(`FAIL: missing ${missing.join(', ')}`);process.exitCode=1}else console.log('PASS: Phase 1 structure and CloudBase entrypoints are present')
