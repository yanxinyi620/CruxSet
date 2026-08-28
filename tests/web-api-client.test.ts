import { expect, it, vi } from 'vitest'
import { LocalApiClient } from '../web/src/api.js'
import { localApiBaseUrl } from '../web/src/api.js'

it('sends login requests with browser credentials and parses the current user', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'usr_1', isAdmin: true } }), { status: 200 }))
  const api = new LocalApiClient('http://localhost:8000', fetcher)

  await expect(api.login('admin@example.com', 'correct horse')).resolves.toEqual({ id: 'usr_1', isAdmin: true })
  expect(fetcher).toHaveBeenCalledWith('http://localhost:8000/api/v1/auth/admin/login', expect.objectContaining({ credentials: 'include', method: 'POST' }))
})

it('returns null when no local administrator session exists', async () => {
  const api = new LocalApiClient('http://localhost:8000', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
  await expect(api.currentUser()).resolves.toBeNull()
})

it('does not bind a supplied fetch function to the API client instance', async () => {
  const fetcher = function (this: unknown) {
    if (this !== undefined) throw new Error('illegal invocation')
    return Promise.resolve(new Response(JSON.stringify({ user: { id: 'usr_1', isAdmin: true } })))
  }
  const api = new LocalApiClient('http://localhost:8000', fetcher as typeof fetch)
  await expect(api.currentUser()).resolves.toEqual({ id: 'usr_1', isAdmin: true })
})

it('uses the current LAN host instead of phone localhost for the local API', () => {
  expect(localApiBaseUrl({ protocol: 'http:', hostname: '192.168.43.179' })).toBe('http://192.168.43.179:8000')
})

it('loads walls, layouts, and problems from the local API', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ walls: [{ id: 'wall_demo' }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ layouts: [{ id: 'layout_demo', published: true }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ problems: [{ id: 'problem_1' }] })))
  const api = new LocalApiClient('http://localhost:8000', fetcher)

  await expect(api.loadBrowseData()).resolves.toEqual({ walls: [{ id: 'wall_demo' }], layouts: [{ id: 'layout_demo', published: true }], problems: [{ id: 'problem_1' }] })
})

it('creates a local wall and its draft layout after uploading an image', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ media: { url: '/api/v1/media/media_1.jpg' } }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ wall: { id: 'wall_1' } }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ layout: { id: 'layout_1', published: false } }), { status: 201 }))
  const api = new LocalApiClient('http://localhost:8000', fetcher)
  const image = new File(['image'], 'wall.jpg', { type: 'image/jpeg' })

  await expect(api.createWallWithDraft({ name: '测试墙', layoutName: '首次标注', image, imageWidth: 100, imageHeight: 200 })).resolves.toEqual({ id: 'layout_1', published: false })
  expect(fetcher).toHaveBeenCalledTimes(3)
})

it('saves draft layout holds through PUT', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ layout: { id: 'layout_1', published: false } }), { status: 200 }))
  const api = new LocalApiClient('http://localhost:8000', fetcher)
  const holds = [{ id: 'H001', x: 0.1, y: 0.2, radius: 0.03, kind: 'hold' }]

  await expect(api.saveLayoutHolds('layout_1', holds)).resolves.toEqual({ layout: { id: 'layout_1', published: false } })
  expect(fetcher).toHaveBeenCalledWith('http://localhost:8000/api/v1/layouts/layout_1/holds', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ holds }) }))
})

it('publishes a draft layout through POST', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ layout: { id: 'layout_1', published: true } }), { status: 200 }))
  const api = new LocalApiClient('http://localhost:8000', fetcher)
  const holds = [{ id: 'H001', x: 0.1, y: 0.2, radius: 0.03, kind: 'hold' }]

  await expect(api.publishLayout('layout_1', holds)).resolves.toEqual({ layout: { id: 'layout_1', published: true } })
  expect(fetcher).toHaveBeenCalledWith('http://localhost:8000/api/v1/layouts/layout_1/publish', expect.objectContaining({ method: 'POST' }))
})

it('creates a problem through POST and deletes through DELETE', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ problem: { id: 'problem_1', number: 'CS-000125' } }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  const api = new LocalApiClient('http://localhost:8000', fetcher)

  await expect(api.createProblem({ wallId: 'wall_1', layoutId: 'layout_1', angle: 25, grade: 'V1', footRule: 'feet_follow', holds: { start: ['H001'], finish: ['H002'] } })).resolves.toEqual({ problem: { id: 'problem_1', number: 'CS-000125' } })
  await api.deleteProblem('problem_1')
  expect(fetcher).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/v1/problems/problem_1', expect.objectContaining({ method: 'DELETE' }))
})

it('deletes layouts and walls with cascade confirmation', async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })))
  const api = new LocalApiClient('http://localhost:8000', fetcher)

  await api.deleteLayout('layout_1')
  await api.deleteWall('wall_1')
  expect(fetcher).toHaveBeenNthCalledWith(1, 'http://localhost:8000/api/v1/layouts/layout_1?confirmCascade=true', expect.objectContaining({ method: 'DELETE' }))
  expect(fetcher).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/v1/walls/wall_1?confirmCascade=true', expect.objectContaining({ method: 'DELETE' }))
})

it('surfaces the server error message from the error envelope', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'LAYOUT_LOCKED', message: 'Layout is already published' } }), { status: 409 }))
  const api = new LocalApiClient('http://localhost:8000', fetcher)

  await expect(api.publishLayout('layout_1', [])).rejects.toThrow('Layout is already published')
})