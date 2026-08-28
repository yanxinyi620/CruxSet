import { expect, it, vi } from 'vitest'
import { LocalApiClient } from '../web/src/api.js'

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
