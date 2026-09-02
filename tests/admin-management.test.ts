import { expect, it, vi } from 'vitest'
import { LocalApiClient } from '../web/src/api.js'
import { adminUserCard } from '../web/src/admin-management.js'

it('loads the protected administrator user list', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ users: [{ id: 'usr_1', email: 'member@example.com', displayName: '', role: 'user', createdAt: 0 }] }), { headers: { 'Content-Type': 'application/json' } }))
  const api = new LocalApiClient('http://local.test', fetcher)

  await expect(api.listAdminUsers()).resolves.toEqual([{ id: 'usr_1', email: 'member@example.com', displayName: '', role: 'user', createdAt: 0 }])
  expect(fetcher).toHaveBeenCalledWith('http://local.test/api/v1/auth/admin/users', { credentials: 'include' })
})

it('uses the local part of an email when a user has no display name', () => {
  expect(adminUserCard({ id: 'usr_1', email: 'member@example.com', displayName: '', role: 'user', createdAt: 0 })).toMatchObject({ name: 'member', roleLabel: '普通用户' })
})
