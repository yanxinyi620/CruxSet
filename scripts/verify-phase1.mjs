import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import process from 'node:process'
const root=process.cwd()
const required=['project.config.json','miniprogram/app.json','miniprogram/app.ts','miniprogram/sitemap.json','docs/IMPLEMENTATION_PLAN.md','docs/manual-test.md','docs/cloudbase-setup.md','config/cloudbase.collections.json','config/cloudbase.rules.json','cloudfunctions/login/index.js','cloudfunctions/saveProblem/index.js','cloudfunctions/deleteProblem/index.js','cloudfunctions/adminWall/index.js','cloudfunctions/adminWall/validation.js','cloudfunctions/getWallImageUrl/index.js','cloudfunctions/wallManager/index.js']
const missing=required.filter(file=>!existsSync(join(root,file)))
const config=JSON.parse(readFileSync(join(root,'project.config.json'),'utf8'))
const app=JSON.parse(readFileSync(join(root,'miniprogram/app.json'),'utf8'))
const schema=JSON.parse(readFileSync(join(root,'config/cloudbase.collections.json'),'utf8'))
const rules=JSON.parse(readFileSync(join(root,'config/cloudbase.rules.json'),'utf8'))
const expected=['users','walls','problems','admins','counters']
const collectTs=(directory)=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?collectTs(join(directory,entry.name)):entry.name.endsWith('.ts')?[join(directory,entry.name)]:[])
const collectJs=(directory)=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?collectJs(join(directory,entry.name)):entry.name.endsWith('.js')?[join(directory,entry.name)]:[])
const collectFiles=(directory)=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?collectFiles(join(directory,entry.name)):[join(directory,entry.name)])
const collectMarkdown=(directory)=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.name==='superpowers'?[]:entry.isDirectory()?collectMarkdown(join(directory,entry.name)):entry.name.endsWith('.md')?[join(directory,entry.name)]:[])
const externalImports=collectTs(join(root,'miniprogram')).filter(file=>readFileSync(file,'utf8').includes('/src/'))
if(externalImports.length){console.error(`FAIL: mini program imports files outside its package: ${externalImports.map(file=>file.slice(root.length+1)).join(', ')}`);process.exitCode=1}
if(!Array.isArray(config.setting?.useCompilerPlugins)||!config.setting.useCompilerPlugins.includes('typescript')){console.error('FAIL: the WeChat TypeScript compiler plugin must be enabled');process.exitCode=1}
if(expected.some(name=>!schema.collections.some(collection=>collection.name===name))){console.error('FAIL: CloudBase collection declaration is incomplete');process.exitCode=1}
const legacyCollection='lay'+'outs'
const legacyId='layout'+'Id'
const legacyVersion='layout'+'Version'
const legacyActive='active'+'LayoutId'
const legacyAdmin='admin'+'Layout'
const legacyImage='get'+'LayoutImageUrl'
if(schema.collections.some(collection=>collection.name===legacyCollection)||JSON.stringify(rules).includes(legacyCollection)){console.error('FAIL: CloudBase configuration still declares legacy collections');process.exitCode=1}
if(rules.client?.write?.length || rules.client?.read?.length || !expected.every(name=>rules.cloudFunctions?.write?.includes(name))){console.error('FAIL: CloudBase permission policy is unsafe or incomplete');process.exitCode=1}
const missingPages=app.pages.filter(page=>['ts','wxml','json','wxss'].some(ext=>!existsSync(join(root,'miniprogram',`${page}.${ext}`))))
if(missingPages.length){console.error(`FAIL: app.json references missing page files: ${missingPages.join(', ')}`);process.exitCode=1}
for(const fn of ['login','saveProblem','deleteProblem','adminWall']){try{const source=readFileSync(join(root,'cloudfunctions',fn,'index.js'),'utf8');execFileSync(process.execPath,['--check',join(root,'cloudfunctions',fn,'index.js')],{stdio:'pipe'});const pkg=JSON.parse(readFileSync(join(root,'cloudfunctions',fn,'package.json'),'utf8'));if(!pkg.dependencies?.['wx-server-sdk'])throw new Error('wx-server-sdk is not declared');if(fn==='adminWall'&&(!source.includes("'createWall'")||!source.includes("'updateWall'")||!source.includes("'publishWall'")||!source.includes('const wallId = data.wallId || data.id')||!source.includes('WALL_LOCKED')))throw new Error('wall client action contract is incomplete')}catch(error){console.error(`FAIL: cloudfunction ${fn} is not deployable: ${error.message}`);process.exitCode=1}}
try{execFileSync(process.execPath,['--check',join(root,'cloudfunctions/adminWall/validation.js')],{stdio:'pipe'})}catch(error){console.error(`FAIL: cloudfunction adminWall validation is not deployable: ${error.message}`);process.exitCode=1}
try{const source=readFileSync(join(root,'cloudfunctions/getWallImageUrl/index.js'),'utf8');execFileSync(process.execPath,['--check',join(root,'cloudfunctions/getWallImageUrl/index.js')],{stdio:'pipe'});const pkg=JSON.parse(readFileSync(join(root,'cloudfunctions/getWallImageUrl/package.json'),'utf8'));if(!pkg.dependencies?.['wx-server-sdk'])throw new Error('wx-server-sdk is not declared');if(!source.includes('getTempFileURL'))throw new Error('temporary image URL generation is missing')}catch(error){console.error(`FAIL: cloudfunction getWallImageUrl is not deployable: ${error.message}`);process.exitCode=1}
try{const source=readFileSync(join(root,'cloudfunctions/wallManager/index.js'),'utf8');execFileSync(process.execPath,['--check',join(root,'cloudfunctions/wallManager/index.js')],{stdio:'pipe'});const pkg=JSON.parse(readFileSync(join(root,'cloudfunctions/wallManager/package.json'),'utf8'));if(!pkg.dependencies?.['wx-server-sdk']||!source.includes('ownerId')||!source.includes('visibility')||!source.includes('FORBIDDEN'))throw new Error('ownership enforcement is incomplete')}catch(error){console.error(`FAIL: cloudfunction wallManager is not deployable: ${error.message}`);process.exitCode=1}
const cloudbaseSource=collectJs(join(root,'cloudfunctions')).map(file=>readFileSync(file,'utf8')).join('\n')
const legacyIdentifiers=[`collection('`+legacyCollection+`')`,legacyId,legacyActive,legacyAdmin,legacyImage]
if(legacyIdentifiers.some(identifier=>cloudbaseSource.includes(identifier))){console.error('FAIL: CloudBase source still contains legacy wall identifiers');process.exitCode=1}
if([legacyAdmin,legacyImage].some(name=>existsSync(join(root,'cloudfunctions',name)))){console.error('FAIL: obsolete CloudBase package directories remain');process.exitCode=1}
const activeScanRoots=['src','miniprogram','web','server','cloudfunctions','config','scripts','docs']
const activeLegacyPatterns=[new RegExp('interface Lay'+'out'),new RegExp(legacyId),new RegExp(legacyVersion),new RegExp(legacyActive),new RegExp('/'+legacyCollection),new RegExp(`collection\\(['"]${legacyCollection}['"]\\)`)]
// The offline migration and its fixture tests intentionally read historical
// documents. They are not loaded by the Wall-only runtime; scan every other
// active source file for obsolete identifiers.
const legacyMigrationPaths=new Set(['server/app/migrations.py','server/tests/test_wall_only_migration.py'])
const migrationModule=join(root,'server/app/migrations.py')
try{
  const source=readFileSync(migrationModule,'utf8')
  if(!source.includes('def flatten_legacy_documents')||!source.includes('def migrate_sqlite_wall_only'))throw new Error('required transform or SQLite runner is missing')
}catch(error){console.error(`FAIL: legacy migration module is unavailable: ${error.message}`);process.exitCode=1}
const activeLegacyFiles=[]
for(const scanRoot of activeScanRoots){
  const directory=join(root,scanRoot)
  if(!existsSync(directory))continue
  const files=scanRoot==='docs'?collectMarkdown(directory):collectFiles(directory).filter(file=>/\.(?:ts|tsx|js|mjs|cjs|py|json|ya?ml|wxml|wxss|css|html)$/i.test(file))
  for(const file of files){
    const relative=file.slice(root.length+1)
    try{if(!legacyMigrationPaths.has(relative)&&activeLegacyPatterns.some(pattern=>pattern.test(readFileSync(file,'utf8'))))activeLegacyFiles.push(relative)}catch{}
  }
}
if(activeLegacyFiles.length){console.error(`FAIL: active product or current documentation still contains legacy Layout fields: ${activeLegacyFiles.join(', ')}`);process.exitCode=1}
const legacyDocs=collectMarkdown(join(root,'docs')).filter(file=>new RegExp(`\\b${legacyCollection}s?\\b|${legacyId}|${legacyActive}|${legacyAdmin}|${legacyImage}`,'i').test(readFileSync(file,'utf8')))
if(legacyDocs.length){console.error(`FAIL: non-historical documentation still describes obsolete storage: ${legacyDocs.map(file=>file.slice(root.length+1)).join(', ')}`);process.exitCode=1}
const release=process.argv.includes('--release')
if(config.appid==='touristappid'||!config.appid){if(release){console.error('FAIL: release verification requires a real AppID');process.exitCode=1}else console.warn('WARN: project.config.json still uses a test AppID')}
if(missing.length){console.error(`FAIL: missing ${missing.join(', ')}`);process.exitCode=1}else console.log('PASS: Phase 1 structure and CloudBase entrypoints are present')
