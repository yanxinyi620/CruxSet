import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
const root=process.cwd()
const required=['project.config.json','miniprogram/app.json','miniprogram/app.ts','docs/IMPLEMENTATION_PLAN.md','docs/manual-test.md','cloudfunctions/login/index.js','cloudfunctions/saveProblem/index.js','cloudfunctions/deleteProblem/index.js','cloudfunctions/adminLayout/index.js']
const missing=required.filter(file=>!existsSync(join(root,file)))
const config=JSON.parse(readFileSync(join(root,'project.config.json'),'utf8'))
if(config.appid==='touristappid'||!config.appid) console.warn('WARN: project.config.json still uses a test AppID')
if(missing.length){console.error(`FAIL: missing ${missing.join(', ')}`);process.exitCode=1}else console.log('PASS: Phase 1 structure and CloudBase entrypoints are present')
