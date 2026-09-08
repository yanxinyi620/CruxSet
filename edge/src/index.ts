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
      if (pathname === '/api/v1/bootstrap' && request.method === 'GET') {
        if (!env.DB) return apiError('SERVICE_UNAVAILABLE', 'Browse database is not configured', 503)
        const [walls, problems] = await Promise.all([
          listWalls(new Request(new URL('/api/v1/walls?limit=50', request.url)), env.DB),
          listProblems(new Request(new URL('/api/v1/problems?limit=50', request.url)), env.DB),
        ])
        if (!walls.ok || !problems.ok) return apiError('SERVICE_UNAVAILABLE', 'Unable to load browse data', 503)
        const wallData = await walls.json() as { walls: unknown[] }
        const problemData = await problems.json() as { problems: unknown[] }
        return Response.json({ user: null, walls: wallData.walls, problems: problemData.problems, capabilities: { readOnly: true, writes: false, authentication: false } })
      }
      if (pathname === '/api/v1/walls' && request.method === 'GET') return listWalls(request, env.DB)
      if (pathname === '/api/v1/problems' && request.method === 'GET') return listProblems(request, env.DB)
      return apiError('NOT_FOUND', 'API endpoint not found', 404)
    }
    return env.ASSETS.fetch(request)
  },
}

export default worker
