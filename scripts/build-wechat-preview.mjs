import ts from 'typescript'
import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
const source = path.resolve('wechat/miniprogram')
const output = path.resolve(process.argv[2] || '.runtime/wechat-preview')
if (output === source || output.startsWith(source + path.sep)) throw Error('Preview output must be outside source directory')
const target = output
let count = 0
async function build(dir, dest) {
  await mkdir(dest, { recursive: true })
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const input = path.join(dir, item.name), out = path.join(dest, item.name)
    if (item.name === 'node_modules' || item.name === 'tsconfig.json' || item.name.endsWith('.d.ts')) continue
    if (item.isDirectory()) await build(input, out)
    else if (item.name.endsWith('.ts')) {
      const result = ts.transpileModule(await readFile(input, 'utf8'), { fileName: input, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS, esModuleInterop: true } })
      const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error)
      if (errors.length) throw Error(ts.formatDiagnosticsWithColorAndContext(errors, {getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=> '\n'}))
      await writeFile(out.replace(/\.ts$/, '.js'), result.outputText); count++
    } else await copyFile(input, out)
  }
}
await build(source, target)
const config = JSON.parse(await readFile('wechat/project.config.json', 'utf8'))
config.miniprogramRoot = './'
config.packOptions.ignore = [...(config.packOptions.ignore || []), {type:'folder',value:'miniprogram'}, {type:'folder',value:'miniprogram-built'}]
config.projectname = 'CruxSet 新版真机调试'
config.setting.useCompilerPlugins = []
await writeFile(path.join(output, 'project.config.json'), JSON.stringify(config, null, 2))
const app = JSON.parse(await readFile(path.join(target, 'app.json'), 'utf8'))
for (const page of app.pages) await readFile(path.join(target, page + '.js'))
console.log(`Compiled ${count} modules; verified ${app.pages.length} page entries. Output: ${output}`)
