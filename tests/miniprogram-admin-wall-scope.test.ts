import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

it('uses an admin-only wall list action and guards direct page access', () => {
  const client = read('miniprogram/pages/me/walls/index.ts')
  const service = read('miniprogram/services/walls.ts')
  const cloud = read('cloudfunctions/wallManager/index.js')

  expect(service).toContain("wallManager('listAdminWalls')")
  expect(client).toContain('currentUserIsAdmin')
  expect(client).toMatch(/isAdmin[\s\S]*listAdminWalls/)
  expect(cloud).toContain("action === 'listAdminWalls'")
  expect(cloud).toMatch(/listAdminWalls[\s\S]*actor\.isAdmin/)
})

it('provides an explicit mock administrator switch for testing admin flows', () => {
  const users = read('miniprogram/services/users.ts')
  expect(users).toContain('setMockAdmin')
  expect(users).toContain('currentUserIsAdmin')
})
