import { expect, it } from 'vitest'
import config from '../web/vite.config.js'

it('forwards same-origin API requests to loopback FastAPI', () => {
  expect(config.server?.proxy?.['/api']).toMatchObject({ target: 'http://127.0.0.1:8000', changeOrigin: true })
})
