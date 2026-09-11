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

it('updates lab access with a credentialed request and returns the saved account', async () => {
  const user = {id:'member',email:'member@example.com',displayName:'',role:'user',labEnabled:true,createdAt:0}
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({user})))
  const api = new LocalApiClient('', fetcher)
  await expect(api.updateLabAccess('member', true)).resolves.toEqual(user)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/admin/users/member/lab-access', {credentials:'include',method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true})})
})
it('shows a granted member as a creator without changing the account role', () => {
  expect(adminUserCard({id:'member',email:'member@example.com',displayName:'',role:'user',labEnabled:true,createdAt:0})).toMatchObject({role:'user',roleLabel:'创作者'})
})
