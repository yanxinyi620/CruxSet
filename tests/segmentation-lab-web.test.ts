import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const staticRoot = resolve('tools/segmentation-lab/static')
const source = (name: string) => readFileSync(resolve(staticRoot, name), 'utf8')

describe('shared segmentation lab pages', () => {
  it('uses explicit local defaults and a cloud-safe shared request helper', () => {
    expect(existsSync(resolve(staticRoot, 'runtime-config.js'))).toBe(true)
    expect(existsSync(resolve(staticRoot, 'runtime.js'))).toBe(true)
    expect(source('runtime-config.js')).toContain('apiBase: "/api"')
    expect(source('runtime.js')).toContain('/api/v1/segmentation-lab')
    expect(source('runtime.js')).toContain('loginPath || "/me"')
    expect(source('runtime.js')).toContain('credentials: "include"')
  })

  it('keeps every page on the shared runtime contract', () => {
    for (const page of ['index.html', 'results.html', 'calibration.html']) {
      expect(source(page)).toContain('runtime-config.js')
      expect(source(page)).toContain('runtime.js')
      expect(source(page)).toContain('Lab.api')
    }
  })

  it('issues one configured request without replacing the browser fetch function', async () => {
    const runtime = source('runtime.js')
    for (const apiBase of ['/api', '/api/v1/segmentation-lab']) {
      const fetcher = vi.fn(async () => new Response('{}'))
      const window = { SEGMENTATION_LAB_CONFIG: { apiBase } }
      vm.runInNewContext(runtime, { window, fetch: fetcher, Error, String, Object, Response, TextDecoder })
      await (window as unknown as { Lab: { request: (path: string) => Promise<Response> } }).Lab.request('/experiments')
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(fetcher).toHaveBeenLastCalledWith(`${apiBase}/experiments`, expect.objectContaining({ credentials: 'include' }))
    }
    expect(source('calibration.html')).not.toContain('window.fetch=')
    expect(source('results.html')).not.toContain('window.fetch=')
  })

  it('saves a calibration through the configured API without a global fetch alias', async () => {
    const fetcher = vi.fn(async () => new Response('{}', {status:201}))
    const window:any = {SEGMENTATION_LAB_CONFIG:{mode:'cloud',apiBase:'/api/v1/segmentation-lab'}}
    const saveStatus = {textContent:'',dataset:{},innerHTML:''}
    const saveButton = {disabled:false}
    const context=vm.createContext({window,fetch:fetcher,Response,Error,String,Object,TextDecoder,eid:'exp-1',tid:'task-1',items:[],lastSavedSignature:null,savedHasPublication:false,sourceCalibrationId:null,calibrationViewVersion:0,msg:()=>{},q:(selector:string)=>selector==='#save'?saveButton:saveStatus})
    vm.runInContext(source('runtime.js'),context)
    context.Lab=window.Lab
    const save=source('calibration.html').match(/q\('#save'\)\.onclick=(async\(\)=>\{.*?\});stage/s)![1]
    await vm.runInContext(`(${save})()`,context)
    expect(fetcher).toHaveBeenCalledWith('/api/v1/segmentation-lab/experiments/exp-1/calibrations',expect.objectContaining({method:'POST'}))
    expect(source('calibration.html')).not.toMatch(/const fetch\s*=/)
    expect(saveStatus.textContent).toBe('保存成功，已保存为独立校准结果。')
    expect(saveButton.disabled).toBe(false)
  })

  it('shows the lab entry through effective Web capabilities', () => {
    const main = readFileSync(resolve('web/src/main.ts'), 'utf8')
    const api = readFileSync(resolve('web/src/api.ts'), 'utf8')
    expect(main).toContain('/segmentation-lab/')
    expect(main).toContain('分割实验台')
    expect(main).toContain('if (access().segmentationLab &&')
    expect(api).toContain('segmentationLab?: boolean')
    expect(source('index.html')).toContain('defaultPublishTarget')
    expect(source('index.html')).toContain('已删除任务')
    expect(source('index.html')).not.toContain('receipt?.targets?.cloudflare')
  })
})

it.each([401,403])('only offers login for an unauthenticated lab response (%s)', async status => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({error:{message: status === 401 ? '请先登录。' : '尚未获得实验台权限，请联系管理员开通。'}}), {status}))
  const window:any = {SEGMENTATION_LAB_CONFIG:{mode:'cloud'}}
  vm.runInNewContext(source('runtime.js'), {window,fetch:fetcher,Error,String,Object,Response})
  const error = await window.Lab.request('/experiments').catch((error:Error) => error)
  expect(error.loginPath).toBe(status === 401 ? '/me' : undefined)
  if (status === 403) expect(error.message).not.toContain('请先登录')
})

it('returns from the results viewer to the configured lab path', () => {
  expect(source('results.html')).toContain("document.querySelector('.bar a').href=Lab.config.labPath")
  expect(source('results.html')).toContain("location.pathname.replace(/\\/$/, '')")
})

function calibrationSaveHarness(fetcher = vi.fn(async () => new Response('{"id":"saved"}',{status:201}))) {
  const window:any={SEGMENTATION_LAB_CONFIG:{mode:'cloud',apiBase:'/api/v1/segmentation-lab'}}
  const status={textContent:'',dataset:{},innerHTML:''}, button={disabled:false}
  const context=vm.createContext({window,fetch:fetcher,Response,Error,String,Object,TextDecoder,
    eid:'e',tid:'t',items:[{id:'hold'}],lastSavedSignature:null,savedHasPublication:false,sourceCalibrationId:null,calibrationViewVersion:0,
    msg:()=>{},q:(selector:string)=>selector==='#save'?button:status})
  vm.runInContext(source('runtime.js'),context);context.Lab=window.Lab
  const code=source('calibration.html').match(/q\('#save'\)\.onclick=(async\(\)=>\{.*?\});stage/s)![1]
  return {context,status,button,fetcher,save:()=>vm.runInContext(`(${code})()`,context)}
}

it('saves once, skips unchanged content and saves again after an edit',async()=>{
  const f=calibrationSaveHarness()
  await f.save();await f.save()
  expect(f.fetcher).toHaveBeenCalledTimes(1)
  expect(f.status.textContent).toContain('没有新的修改')
  f.context.items=[{id:'edited'}];await f.save()
  expect(f.fetcher).toHaveBeenCalledTimes(2)
  const body=JSON.parse((f.fetcher.mock.calls[1] as any)[1].body)
  expect(body.sourceCalibrationId).toBe('saved')
})

it('keeps edits made while saving dirty instead of marking them already saved',async()=>{
  let finish!:(value:Response)=>void
  const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve}))
  const f=calibrationSaveHarness(fetcher)
  const saving=f.save();f.context.items=[{id:'edited-during-save'}]
  finish(new Response('{"id":"saved"}',{status:201}));await saving
  const second=f.save();expect(fetcher).toHaveBeenCalledTimes(2)
  finish(new Response('{"id":"next"}',{status:201}));await second
})

it('does not mark a new view saved when a previous view finishes saving',async()=>{
  let finish!:(value:Response)=>void
  const f=calibrationSaveHarness(vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve})))
  const saving=f.save()
  f.context.calibrationViewVersion=1;f.context.eid='other';f.context.lastSavedSignature=null
  finish(new Response('{"id":"old"}',{status:201}));await saving
  expect(f.context.lastSavedSignature).toBeNull()
  expect(f.context.sourceCalibrationId).toBeNull()
})

it('lets an unchanged published calibration reach the server to recover a deleted wall',async()=>{
  const f=calibrationSaveHarness()
  f.context.sourceCalibrationId='published'
  f.context.savedHasPublication=true
  f.context.lastSavedSignature=JSON.stringify([f.context.eid,f.context.tid,f.context.items])
  await f.save()
  expect(f.fetcher).toHaveBeenCalledTimes(1)
  expect(f.context.sourceCalibrationId).toBe('saved')
  expect(f.context.savedHasPublication).toBe(false)
  await f.save();expect(f.fetcher).toHaveBeenCalledTimes(1)
})
