import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { isLocalLabHost } from './src/local-lab-host.js'

const sourceRoot = fileURLToPath(new URL('../tools/segmentation-lab/static/', import.meta.url))
export const labApiPrefix = '/api/v1/segmentation-lab'
const labPath = '/segmentation-lab/'
export function labRuntimeConfig(local: boolean): string {
  return `window.SEGMENTATION_LAB_CONFIG = ${JSON.stringify({
    mode: local ? 'local' : 'cloud', apiBase: labApiPrefix, homePath: '/', labPath, loginPath: '/me',
    models: local ? ['sam2', 'sam2_tiled', 'sam3'] : ['sam2', 'sam2_tiled'],
    publishTargets: local ? ['web', 'cloudbase', 'cloudflare'] : ['cloudflare'],
  })};\n`
}
function pageSource(file: string, root = sourceRoot): string {
  return readFileSync(resolve(root, file), 'utf8')
    .replaceAll('src="/runtime-config.js"', 'src="/segmentation-lab/runtime-config.js"')
    .replaceAll('src="/runtime.js"', 'src="/segmentation-lab/runtime.js"')
}
function localPages(root: string, built = false): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
    const path = url.pathname
    const isApi = path === labApiPrefix || path.startsWith(labApiPrefix + '/')
    if (!isApi && path !== '/segmentation-lab' && !path.startsWith(labPath)) return next()
    if (!isLocalLabHost(url.hostname)) { res.statusCode = 403; res.end('Local lab is available only on local hosts.'); return }
    if (isApi) return next()
    if (path === '/segmentation-lab') { res.writeHead(302, {Location: labPath + url.search}); res.end(); return }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return }
    const file = path === labPath || path === labPath + 'index.html' ? 'index.html'
      : /^\/segmentation-lab\/results\/[\w-]+\/?$/.test(path) || path === labPath + 'results.html' ? 'results.html'
      : /^\/segmentation-lab\/calibrations\/?$/.test(path) || path === labPath + 'calibration.html' ? 'calibration.html'
      : path === labPath + 'runtime.js' ? 'runtime.js'
      : path === labPath + 'runtime-config.js' ? 'runtime-config.js' : null
    if (!file) { res.statusCode = 404; res.end(); return }
    try {
      const content = file === 'runtime-config.js' && !built ? labRuntimeConfig(true) : pageSource(file, root)
      res.writeHead(200, {'Content-Type': file.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store'})
      res.end(req.method === 'HEAD' ? undefined : content)
    } catch (error) { next(error) }
  }
}
export function segmentationLabAssets(local: boolean): Plugin {
  let outputRoot: string
  return {
    name: 'segmentation-lab-assets',
    configResolved(config) { outputRoot = resolve(config.root, config.build.outDir, 'segmentation-lab') },
    configureServer(server) { server.middlewares.use(localPages(sourceRoot)) },
    configurePreviewServer(server) { if (local) server.middlewares.use(localPages(outputRoot, true)) },
    writeBundle() {
      cpSync(sourceRoot, outputRoot, {recursive: true})
      for (const page of ['index.html', 'results.html', 'calibration.html']) writeFileSync(resolve(outputRoot, page), pageSource(page))
      writeFileSync(resolve(outputRoot, 'runtime-config.js'), labRuntimeConfig(local))
    },
  }
}
