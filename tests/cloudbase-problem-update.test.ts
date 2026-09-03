import { expect, it } from 'vitest'
import { validateProblemUpdate } from '../cloudfunctions/updateProblem/validation.js'

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
