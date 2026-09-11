import { expect, it } from 'vitest'
import { webConfig } from '../web/vite.config.js'
const config = webConfig({command:'serve',mode:'development'})

it('forwards same-origin API requests to loopback FastAPI', () => {
  expect(config.server?.proxy?.['/api']).toMatchObject({ target: 'http://127.0.0.1:8000', changeOrigin: false })
})

it('routes lab requests through the authenticated main API without rewriting the path', () => {
  const proxy = config.server?.proxy?.['/api/v1/segmentation-lab'] as {target?: string; rewrite?: unknown} | undefined
  if (proxy) { expect(proxy.target).toBe('http://127.0.0.1:8000'); expect(proxy.rewrite).toBeUndefined() }
})
