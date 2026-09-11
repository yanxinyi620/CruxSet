import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer as httpServer, request } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build, createServer, preview, type ViteDevServer } from 'vite'

let server: ViteDevServer
let origin: string
const upstream = httpServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({path:req.url,method:req.method,body:Buffer.concat(chunks).toString()}))
})
beforeAll(async () => {
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const target = `http://127.0.0.1:${(upstream.address() as {port:number}).port}`
  server = await createServer({configFile:resolve('web/vite.config.ts'),logLevel:'silent',server:{port:5197,strictPort:false,host:'127.0.0.1',proxy:{'/api/v1/segmentation-lab':{target},'/api':{target}}}})
  await server.listen()
  origin = `http://127.0.0.1:${(server.httpServer!.address() as {port:number}).port}`
})
afterAll(async () => {
  await server?.close()
  await new Promise<void>(resolve => upstream.close(() => resolve()))
})
it('serves shared local lab pages, deep links and runtime config beneath the main origin', async () => {
  for (const path of ['/segmentation-lab/', '/segmentation-lab/results/exp-1', '/segmentation-lab/calibrations?experiment=e&calibration=c']) {
    const response = await fetch(origin + path)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('/segmentation-lab/runtime-config.js')
    expect(html).toContain('/segmentation-lab/runtime.js')
  }
  const config = await (await fetch(origin+'/segmentation-lab/runtime-config.js')).text()
  expect(config).toContain('"mode":"local"')
  expect(config).toContain('"apiBase":"/api/v1/segmentation-lab"')
  expect(config).toContain('"sam3"')
  expect(config).toContain('["web","cloudbase","cloudflare"]')
})
it('forwards lab methods, bodies and query strings to the authenticated FastAPI lab gateway unchanged', async () => {
  for (const method of ['POST','DELETE']) {
    const response = await fetch(origin+'/api/v1/segmentation-lab/experiments/e/calibrations?source=a%20b', {method,body:'{"target":"web"}',headers:{'Content-Type':'application/json'}})
    expect(await response.json()).toEqual({method,body:'{"target":"web"}',path:'/api/v1/segmentation-lab/experiments/e/calibrations?source=a%20b'})
  }
  expect(await (await fetch(origin+'/api/v1/bootstrap')).json()).toMatchObject({path:'/api/v1/bootstrap'})
})
it('does not publish the unauthenticated local lab through a public hostname', async () => {
  for (const path of ['/segmentation-lab/', '/api/v1/segmentation-lab/experiments']) {
    const status = await new Promise<number | undefined>((resolve,reject) => {
      const req = request(origin+path,{headers:{Host:'example.trycloudflare.com'}},res => {res.resume();resolve(res.statusCode)}); req.on('error',reject);req.end()
    })
    expect(status).toBe(403)
  }
})
it('builds local and cloud lab assets from the same pages with different capabilities', async () => {
  const temp = await mkdtemp(join(tmpdir(),'cruxset-lab-build-'))
  try {
    for (const mode of ['local-web','production']) {
      const outDir=join(temp,mode)
      await build({configFile:resolve('web/vite.config.ts'),mode,logLevel:'silent',build:{outDir}})
      const config = await readFile(join(outDir,'segmentation-lab/runtime-config.js'),'utf8')
      expect(config).toContain(`"mode":"${mode==='local-web'?'local':'cloud'}"`)
      expect(config.includes('"sam3"')).toBe(mode==='local-web')
      expect(await readFile(join(outDir,'segmentation-lab/results.html'),'utf8')).toContain('/segmentation-lab/runtime.js')
      if (mode === 'local-web') {
        const target = `http://127.0.0.1:${(upstream.address() as {port:number}).port}`
        const built = await preview({configFile:resolve('web/vite.config.ts'),mode,logLevel:'silent',build:{outDir},preview:{port:5198,strictPort:false,host:'127.0.0.1',proxy:{'/api/v1/segmentation-lab':{target}}}})
        try {
          const base = `http://127.0.0.1:${(built.httpServer.address() as {port:number}).port}`
          expect(await (await fetch(base+'/segmentation-lab/runtime-config.js')).text()).toBe(config)
          expect(await (await fetch(base+'/segmentation-lab/results/e')).text()).toContain('/segmentation-lab/runtime.js')
          expect(await (await fetch(base+'/api/v1/segmentation-lab/health')).json()).toMatchObject({path:'/api/v1/segmentation-lab/health'})
        } finally { await new Promise<void>(resolve => built.httpServer.close(() => resolve())) }
      }
    }
  } finally { await rm(temp,{recursive:true,force:true}) }
},15000)

it('keeps the main Web available when the separate lab process is down', async () => {
  const stopped = httpServer()
  await new Promise<void>(resolve => stopped.listen(0,'127.0.0.1',resolve))
  const stoppedPort = (stopped.address() as {port:number}).port
  await new Promise<void>(resolve => stopped.close(() => resolve()))
  const offline = await createServer({configFile:resolve('web/vite.config.ts'),logLevel:'silent',server:{port:5199,strictPort:false,host:'127.0.0.1',proxy:{'/api/v1/segmentation-lab':{target:`http://127.0.0.1:${stoppedPort}`}}}})
  try {
    await offline.listen()
    const base = `http://127.0.0.1:${(offline.httpServer!.address() as {port:number}).port}`
    expect((await fetch(base+'/api/v1/segmentation-lab/health')).status).toBe(500)
    expect((await fetch(base+'/')).status).toBe(200)
    expect((await fetch(base+'/segmentation-lab/')).status).toBe(200)
  } finally { await offline.close() }
})
