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

it('loads the complete session snapshot with one bootstrap request', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'usr_1', isAdmin: true }, walls: [{ id: 'wall_demo' }], problems: [{ id: 'problem_1' }] })))
  await expect(new LocalApiClient('http://localhost:8000', fetcher).loadBootstrap()).resolves.toEqual({ user: { id: 'usr_1', isAdmin: true }, walls: [{ id: 'wall_demo' }], problems: [{ id: 'problem_1' }] })
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher).toHaveBeenCalledWith('http://localhost:8000/api/v1/bootstrap', expect.objectContaining({ credentials: 'include' }))
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

it('shares the current origin with the lab on every deployed frontend hostname', () => {
  for (const hostname of ['cruxset.xinyilab.top', 'api.cruxset.xinyilab.top', 'cruxset-edge.cruxset.workers.dev']) {
    expect(localApiBaseUrl({ protocol: 'https:', hostname })).toBe('')
  }
})

it('resolves published static image paths against the API while preserving local URLs', async () => {
  const { wallImageUrl } = await import('../web/src/api.js')
  expect(wallImageUrl('wall-images/hash.webp', 'https://api.cruxset.xinyilab.top')).toBe('https://api.cruxset.xinyilab.top/wall-images/hash.webp')
  expect(wallImageUrl('/wall-images/hash.webp', 'https://api.cruxset.xinyilab.top')).toBe('https://api.cruxset.xinyilab.top/wall-images/hash.webp')
  for (const path of ['/api/v1/media/image.jpg', 'blob:local-image', 'https://images.example/wall.webp']) expect(wallImageUrl(path, '')).toBe(path)
})

it('uses a service error message for non-JSON server failures', async () => {
  const api = new LocalApiClient('', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })))
  await expect(api.loadBootstrap()).rejects.toThrow('服务暂时不可用，请稍后重试')
})
