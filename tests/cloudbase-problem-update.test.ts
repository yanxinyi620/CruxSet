import { expect, it } from 'vitest'
import { validateProblemUpdate } from '../wechat/cloudfunctions/updateProblem/validation.js'
import { MockRepository, mockCurrentUserId } from '../wechat/miniprogram/services/mock-repository.js'

const wall = {
  id: 'wall_public', visibility: 'public', angleOptions: [20, 35],
  holds: [
    { id: 'S' }, { id: 'F' }, { id: 'H' }, { id: 'X' }
  ]
}
const existing = {
  id: 'problem_keep', number: 'CS-000123', wallId: wall.id,
  createdBy: 'owner', createdAt: 10, updatedAt: 20
}
const valid = {
  angle: 35, grade: 'V12', footRule: 'specified', description: 'updated',
  holds: { start: ['S'], foot: ['F'], hand: ['H'], assist: [], finish: ['X'] }
}

it('accepts a complete update while preserving stable identifiers', () => {
  const result = validateProblemUpdate(existing, wall, valid, 'owner')
  expect(result).toMatchObject({ ...valid, id: existing.id, number: existing.number, wallId: wall.id, createdBy: existing.createdBy, createdAt: existing.createdAt })
  expect(result.updatedAt).toBeTypeOf('number')
})

it('accepts an explicitly configured zero-degree angle', () => {
  expect(validateProblemUpdate(existing, { ...wall, angleOptions: [0, 35] }, { ...valid, angle: 0 }, 'owner').angle).toBe(0)
})

it('applies the same ownership and metadata checks to mock updates', async () => {
  const repository = new MockRepository()
  const wallId = 'wall_demo'
  const problem = (await repository.createProblem(wallId, { angle: 35, grade: 'V4', holds: { start: ['H001'], foot: [], hand: [], assist: [], finish: ['H024'] } }))
  const base = { angle: 35, grade: 'V4' as const, holds: { start: ['H001'], foot: [], hand: [], assist: [], finish: ['H024'] } }
  await expect(repository.updateProblem(problem.id, { ...base, angle: 999 })).rejects.toThrow('INVALID_ROUTE_METADATA')
  await expect(repository.updateProblem(problem.id, { ...base, description: 'x'.repeat(501) })).rejects.toThrow('INVALID_ROUTE_METADATA')
  await expect(repository.updateProblem(problem.id, { ...base, holds: { ...base.holds, start: [] } })).rejects.toThrow('INVALID_ROUTE_HOLDS')
  await expect(repository.updateProblem(problem.id, { ...base, holds: { ...base.holds, start: ['UNKNOWN'] } })).rejects.toThrow('INVALID_HOLD_ID')
  await expect(repository.updateProblem(problem.id, { ...base, name: 3 as any })).rejects.toThrow('INVALID_ROUTE_METADATA')
  await expect(repository.updateProblem(problem.id, { ...base, name: 'x'.repeat(81) })).rejects.toThrow('INVALID_ROUTE_METADATA')
  await expect(repository.updateProblem(problem.id, { ...base, holds: { ...base.holds, hand: 'H001' as any } })).rejects.toThrow('INVALID_ROUTE_HOLDS')
  await expect(repository.updateProblem(problem.id, { ...base, holds: { ...base.holds, hand: [3 as any] } })).rejects.toThrow('INVALID_HOLD_ID')
  const result = await repository.updateProblem(problem.id, base)
  expect(result).toMatchObject({ id: problem.id, number: problem.number })
  expect((await repository.getProblem(problem.id)).name).toBe('')
  expect((await repository.getProblem(problem.id)).description).toBe('')
  expect(mockCurrentUserId).toBeTruthy()
})

it.each([
  ['non-owner', { actor: 'other' }, 'FORBIDDEN'],
  ['private wall', { wall: { ...wall, visibility: 'private' } }, 'WALL_NOT_ROUTABLE'],
  ['bad angle', { draft: { ...valid, angle: 25 } }, 'INVALID_ROUTE_METADATA'],
  ['bad grade', { draft: { ...valid, grade: 'V13' } }, 'INVALID_ROUTE_METADATA'],
  ['missing Start', { draft: { ...valid, holds: { ...valid.holds, start: [] } } }, 'INVALID_ROUTE_HOLDS'],
  ['missing Finish', { draft: { ...valid, holds: { ...valid.holds, finish: [] } } }, 'INVALID_ROUTE_HOLDS'],
  ['duplicate Hold', { draft: { ...valid, holds: { ...valid.holds, hand: ['S'] } } }, 'INVALID_HOLD_ID'],
  ['unknown Hold', { draft: { ...valid, holds: { ...valid.holds, hand: ['UNKNOWN'] } } }, 'INVALID_HOLD_ID'],
  ['long description', { draft: { ...valid, description: 'x'.repeat(501) } }, 'INVALID_ROUTE_METADATA'],
] as const)('rejects %s', (_label, changes, error) => {
  const actor = 'actor' in changes ? changes.actor : 'owner'
  const nextWall = 'wall' in changes ? changes.wall : wall
  const draft = 'draft' in changes ? changes.draft : valid
  expect(() => validateProblemUpdate(existing, nextWall, draft, actor)).toThrow(error)
})
