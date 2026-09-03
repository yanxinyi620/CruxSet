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

it('requires administrator identity for every wall-management server action', () => {
  const cloud = read('cloudfunctions/wallManager/index.js')
  expect(cloud).toMatch(/if \(action === 'listAdminWalls'[\s\S]*!actor\.isAdmin\)/)
  expect(cloud).toMatch(/if \(action !== 'deleteWall'[\s\S]*actor\.isAdmin|deleteWall'[\s\S]*actor\.isAdmin/)
})

it('removes wall mutation actions from the mini-program cloud boundary', () => {
  const service = read('miniprogram/services/walls.ts')
  const adminWall = read('cloudfunctions/adminWall/index.js')
  for (const action of ['createWall', 'updateWall', 'updateWallHolds', 'publishWall']) {
    expect(service).not.toMatch(new RegExp(`export const ${action}`))
    expect(adminWall).not.toContain(`'${action}'`)
  }
  expect(service).toContain('listAdminWalls')
  expect(service).toContain('deleteWall')
})

it('keeps phase-one verification and docs aligned with the admin-only contract', () => {
  const verifier = read('scripts/verify-phase1.mjs')
  const cloudDocs = read('cloudfunctions/README.md')
  const testDocs = read('docs/testing.md')
  expect(verifier).toContain('INVALID_ACTION')
  expect(verifier).not.toContain('wall client action contract is incomplete')
  expect(cloudDocs).toContain('listAdminWalls')
  expect(cloudDocs).toContain('deleteWall')
  expect(cloudDocs).not.toContain('拥有者或管理员创建')
  expect(testDocs).not.toContain('adminWall 的 create、update、publish')
})
