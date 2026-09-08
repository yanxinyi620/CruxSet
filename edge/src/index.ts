import { apiError } from './errors.js'
import { listProblems, listWalls } from './browse.js'

export interface Env {
  ASSETS: Fetcher
  DB?: D1Database
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/v1/')) {
      if (pathname === '/api/v1/healthz' && request.method === 'GET') return Response.json({ status: 'ok' })
      if (pathname === '/api/v1/walls' && request.method === 'GET') return listWalls(request, env.DB)
      if (pathname === '/api/v1/problems' && request.method === 'GET') return listProblems(request, env.DB)
      return apiError('NOT_FOUND', 'API endpoint not found', 404)
    }
    return env.ASSETS.fetch(request)
  },
}

export default worker
