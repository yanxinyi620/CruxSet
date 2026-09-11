import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { webAccess } from '../web/src/web-access.js'

const cloud = { readOnly: false, writes: true, authentication: true, wallAuthoring: false, imageUpload: false, aiJobs: false }
it('allows anonymous browsing but requires a session for personal and write views', () => {
  const access = webAccess(null, cloud)
  expect(access.requiresLogin('browse')).toBe(false)
  expect(access.requiresLogin('route-browser')).toBe(false)
  expect(access.requiresLogin('problem-detail')).toBe(false)
  for (const route of ['me', 'create', 'wall-editor', 'problem-editor']) expect(access.requiresLogin(route)).toBe(true)
})
it('disables cloud wall authoring while preserving administrator management and route writes', () => {
  const access = webAccess({ id: 'admin', email: 'a@example.com', isAdmin: true }, cloud)
  expect(access.wallAuthoring).toBe(false)
  expect(access.writes).toBe(true)
  expect(access.requiresLogin('me')).toBe(false)
  expect(webAccess({ id: 'admin', email: 'a@example.com', isAdmin: true }).wallAuthoring).toBe(true)
})
it('starts from bootstrap without an error-triggered read-only fallback', () => {
  const source = readFileSync(new URL('../web/src/main.ts', import.meta.url), 'utf8')
  expect(source).not.toContain('edgeReadOnly')
  expect(source).toContain('webAccess(')
  expect(source).toContain('data-continue-browse')
  expect(source).toContain('capabilities')
  expect(source).not.toContain('本地服务未启动')
})

it('exposes the lab to authorized members and never infers permission from administrator status alone', () => {
  const member = {id:'member',email:'member@example.com',isAdmin:false}
  expect(webAccess(member, {...cloud,segmentationLab:true}).segmentationLab).toBe(true)
  expect(webAccess(member, {...cloud,segmentationLab:false}).segmentationLab).toBe(false)
  expect(webAccess(null, {...cloud,segmentationLab:true}).segmentationLab).toBe(false)
  expect(webAccess({...member,isAdmin:true}, cloud).segmentationLab).toBe(false)
  expect(webAccess(member).segmentationLab).toBe(false)
})

it('requires explicit backend capabilities in local mode too', () => {
  const admin = {id:'admin',email:'admin@example.com',isAdmin:true}
  expect(webAccess(admin, undefined, true).segmentationLab).toBe(false)
  expect(webAccess({...admin,isAdmin:false}, undefined, true).segmentationLab).toBe(false)
  expect(webAccess(null, undefined, true).segmentationLab).toBe(false)
  expect(webAccess({...admin,isAdmin:false}, {...cloud,segmentationLab:true}, true).segmentationLab).toBe(true)
  expect(webAccess(admin, {...cloud,segmentationLab:false}, true).segmentationLab).toBe(false)
})
