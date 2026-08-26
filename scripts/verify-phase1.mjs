import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import process from 'node:process'
const root=process.cwd()
const required=['project.config.json','miniprogram/app.json','miniprogram/app.ts','miniprogram/sitemap.json','docs/IMPLEMENTATION_PLAN.md','docs/manual-test.md','docs/cloudbase-setup.md','config/cloudbase.collections.json','config/cloudbase.rules.json','cloudfunctions/login/index.js','cloudfunctions/saveProblem/index.js','cloudfunctions/deleteProblem/index.js','cloudfunctions/adminLayout/index.js']
const missing=required.filter(file=>!existsSync(join(root,file)))
const config=JSON.parse(readFileSync(join(root,'project.config.json'),'utf8'))
const schema=JSON.parse(readFileSync(join(root,'config/cloudbase.collections.json'),'utf8'))
const expected=['users','walls','layouts','problems','admins','counters']
if(expected.some(name=>!schema.collections.some(collection=>collection.name===name))){console.error('FAIL: CloudBase collection declaration is incomplete');process.exitCode=1}
for(const fn of ['login','saveProblem','deleteProblem','adminLayout']){try{execFileSync(process.execPath,['--check',join(root,'cloudfunctions',fn,'index.js')],{stdio:'pipe'});const pkg=JSON.parse(readFileSync(join(root,'cloudfunctions',fn,'package.json'),'utf8'));if(!pkg.dependencies?.['wx-server-sdk'])throw new Error('wx-server-sdk is not declared')}catch(error){console.error(`FAIL: cloudfunction ${fn} is not deployable: ${error.message}`);process.exitCode=1}}
const release=process.argv.includes('--release')
if(config.appid==='touristappid'||!config.appid){if(release){console.error('FAIL: release verification requires a real AppID');process.exitCode=1}else console.warn('WARN: project.config.json still uses a test AppID')}
if(missing.length){console.error(`FAIL: missing ${missing.join(', ')}`);process.exitCode=1}else console.log('PASS: Phase 1 structure and CloudBase entrypoints are present')
