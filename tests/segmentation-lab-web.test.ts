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

  it('packages the shared sources beneath the cloud entry without copied sources', () => {
    const vite = readFileSync(resolve('web/vite.config.ts'), 'utf8')
    expect(vite).toContain('segmentation-lab')
    expect(vite).toContain('tools/segmentation-lab/static')
    expect(vite).toContain('apiBase: "/api/v1/segmentation-lab"')
  })

  it('saves a calibration through the configured API without a global fetch alias', async () => {
    const fetcher = vi.fn(async () => new Response('{}', {status:201}))
    const window:any = {SEGMENTATION_LAB_CONFIG:{mode:'cloud',apiBase:'/api/v1/segmentation-lab'}}
    const context=vm.createContext({window,fetch:fetcher,Response,Error,String,Object,TextDecoder,eid:'exp-1',tid:'task-1',items:[],msg:()=>{}})
    vm.runInContext(source('runtime.js'),context)
    context.Lab=window.Lab
    const save=source('calibration.html').match(/q\('#save'\)\.onclick=(async\(\)=>\{.*?\});stage/s)![1]
    await vm.runInContext(`(${save})()`,context)
    expect(fetcher).toHaveBeenCalledWith('/api/v1/segmentation-lab/experiments/exp-1/calibrations',expect.objectContaining({method:'POST'}))
    expect(source('calibration.html')).not.toMatch(/const fetch\s*=/)
  })

  it('shows the lab entry only to administrators in the web workspace', () => {
    const main = readFileSync(resolve('web/src/main.ts'), 'utf8')
    const api = readFileSync(resolve('web/src/api.ts'), 'utf8')
    expect(main).toContain('/segmentation-lab/')
    expect(main).toContain('分割实验台')
    expect(main).toContain('capabilities?.segmentationLab')
    expect(api).toContain('segmentationLab?: boolean')
    expect(source('index.html')).toContain('defaultPublishTarget')
    expect(source('index.html')).toContain('已删除任务')
    expect(source('index.html')).toContain('receipt?.targets?.cloudflare')
  })
})
