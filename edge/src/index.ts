import { apiError } from './errors.js'

export interface Env {
  ASSETS: Fetcher
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/v1/')) {
      if (pathname === '/api/v1/healthz' && request.method === 'GET') return Response.json({ status: 'ok' })
      return apiError('NOT_FOUND', 'API endpoint not found', 404)
    }
    return env.ASSETS.fetch(request)
  },
}

export default worker
