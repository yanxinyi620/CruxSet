import { expect, it, vi } from 'vitest'
import { LocalApiClient, localApiBaseUrl } from '../web/src/api.js'

it('sends login requests with browser credentials and parses the current user', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'usr_1', isAdmin: true } }))); const api = new LocalApiClient('http://localhost:8000', fetcher)
  await expect(api.login('admin@example.com', 'correct horse')).resolves.toEqual({ id: 'usr_1', isAdmin: true }); expect(fetcher).toHaveBeenCalledWith('http://localhost:8000/api/v1/auth/admin/login', expect.objectContaining({ credentials: 'include', method: 'POST' }))
})
it('returns null when no local administrator session exists', async () => { await expect(new LocalApiClient('http://localhost:8000', vi.fn().mockResolvedValue(new Response('', { status: 401 }))).currentUser()).resolves.toBeNull() })
it('loads the signed-in email and clears its session on logout', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'usr_1', email: 'alex@example.com', isAdmin: true } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
  const api = new LocalApiClient('http://localhost:8000', fetcher)
  await expect(api.currentUser()).resolves.toEqual({ id: 'usr_1', email: 'alex@example.com', isAdmin: true })
  await expect(api.logout()).resolves.toEqual({ ok: true })
  expect(fetcher).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/v1/auth/logout', expect.objectContaining({ credentials: 'include', method: 'POST' }))
})
it('does not bind a supplied fetch function to the API client instance', async () => {
  const fetcher = function (this: unknown) { if (this !== undefined) throw new Error('illegal invocation'); return Promise.resolve(new Response(JSON.stringify({ user: { id: 'usr_1', isAdmin: true } }))) }
  await expect(new LocalApiClient('http://localhost:8000', fetcher as typeof fetch).currentUser()).resolves.toEqual({ id: 'usr_1', isAdmin: true })
})
it('does not bind the browser fetch function while logging in', async () => {
  const fetcher = function (this: unknown) { if (this !== undefined) throw new Error('illegal invocation'); return Promise.resolve(new Response(JSON.stringify({ user: { id: 'usr_1', isAdmin: true } }))) }
  await expect(new LocalApiClient('http://localhost:8000', fetcher as typeof fetch).login('admin@example.com', 'correct horse')).resolves.toEqual({ id: 'usr_1', isAdmin: true })
})
it('calls the default browser fetch with globalThis as its receiver', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = function (this: unknown) { if (this !== globalThis) throw new Error('illegal invocation'); return Promise.resolve(new Response(JSON.stringify({ user: { id: 'usr_1', isAdmin: true } }))) } as typeof fetch
  try {
    await expect(new LocalApiClient('http://localhost:8000').login('admin@example.com', 'correct horse')).resolves.toEqual({ id: 'usr_1', isAdmin: true })
  } finally {
    globalThis.fetch = originalFetch
  }
})
it('uses a same-origin API base for LAN and localhost pages', () => { expect(localApiBaseUrl({ protocol: 'http:', hostname: '192.168.43.179' })).toBe(''); expect(localApiBaseUrl({ protocol: 'http:', hostname: 'localhost' })).toBe('') })

it('loads only walls and problems from the local API', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ walls: [{ id: 'wall_demo' }] }))).mockResolvedValueOnce(new Response(JSON.stringify({ problems: [{ id: 'problem_1' }] })))
  await expect(new LocalApiClient('http://localhost:8000', fetcher).loadBrowseData()).resolves.toEqual({ walls: [{ id: 'wall_demo' }], problems: [{ id: 'problem_1' }] }); expect(fetcher).toHaveBeenCalledTimes(2)
})

it('starts walls and problems requests together during the initial browse load', async () => {
  let resolveWalls!: (response: Response) => void
  let resolveProblems!: (response: Response) => void
  const fetcher = vi.fn((url: string) => new Promise<Response>((resolve) => {
    if (url.endsWith('/walls')) resolveWalls = resolve
    if (url.endsWith('/problems')) resolveProblems = resolve
  }))
  const loading = new LocalApiClient('http://localhost:8000', fetcher as typeof fetch).loadBrowseData()
  expect(fetcher).toHaveBeenCalledTimes(2)
  resolveWalls(new Response(JSON.stringify({ walls: [] })))
  resolveProblems(new Response(JSON.stringify({ problems: [] })))
  await expect(loading).resolves.toEqual({ walls: [], problems: [] })
})

it('uploads an image and creates one complete private wall', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ media: { url: '/api/v1/media/media_1.jpg' } }), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify({ wall: { id: 'wall_1', visibility: 'private' } }), { status: 201 }))
  const api = new LocalApiClient('http://localhost:8000', fetcher); const image = new File(['image'], 'wall.jpg', { type: 'image/jpeg' })
  await expect(api.createWall({ name: '测试墙', image, imageWidth: 100, imageHeight: 200 })).resolves.toEqual({ id: 'wall_1', visibility: 'private' })
  expect(fetcher).toHaveBeenCalledTimes(2); expect(fetcher).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/v1/walls', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '测试墙', imageFileId: '/api/v1/media/media_1.jpg', imageWidth: 100, imageHeight: 200 }) }))
})

it('saves wall holds and publishes a wall', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ wall: { id: 'wall_1', visibility: 'private' } }))).mockResolvedValueOnce(new Response(JSON.stringify({ wall: { id: 'wall_1', visibility: 'public' } })))
  const api = new LocalApiClient('http://localhost:8000', fetcher); const holds = [{ id: 'H001', x: .1, y: .2, radius: .03, kind: 'hold' }]
  await api.saveWallHolds('wall_1', holds); await api.publishWall('wall_1')
  expect(fetcher).toHaveBeenNthCalledWith(1, 'http://localhost:8000/api/v1/walls/wall_1/holds', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ holds }) })); expect(fetcher).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/v1/walls/wall_1/publish', expect.objectContaining({ method: 'POST' }))
})

it('creates a problem without layout fields and deletes resources', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ problem: { id: 'problem_1', number: 'CS-000125' } }), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }))).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
  const api = new LocalApiClient('http://localhost:8000', fetcher); const input = { wallId: 'wall_1', angle: 25, grade: 'V1', footRule: 'feet_follow', holds: { start: ['H001'], finish: ['H002'] } }
  await api.createProblem(input); await api.deleteProblem('problem_1'); await api.deleteWall('wall_1')
  expect(fetcher).toHaveBeenNthCalledWith(1, 'http://localhost:8000/api/v1/problems', expect.objectContaining({ body: JSON.stringify(input) })); expect(fetcher).toHaveBeenNthCalledWith(3, 'http://localhost:8000/api/v1/walls/wall_1', expect.objectContaining({ method: 'DELETE' }))
})

it('surfaces the server error message from the error envelope', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'WALL_LOCKED', message: 'Wall is already published' } }), { status: 409 }))
  await expect(new LocalApiClient('http://localhost:8000', fetcher).publishWall('wall_1')).rejects.toThrow('Wall is already published')
})
