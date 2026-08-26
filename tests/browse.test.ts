import { expect, it } from 'vitest'
import { adjacentProblem, browseProblems } from '../src/domain/browse.js'
import type { Problem } from '../src/domain/types.js'

const make = (number: string, angle = 35): Problem => ({ id: `problem_${number}`, number, wallId: 'w', layoutId: 'l', angle, grade: 'V4', footRule: 'feet_follow', holds: { start: ['H1'], foot: [], hand: [], assist: [], finish: ['H2'] }, createdBy: 'u', createdAt: 1, updatedAt: 1 })
it('keeps browse search and adjacent navigation in the active filter context', () => {
  const routes = [make('CS-000003'), make('CS-000001'), make('CS-000002', 25)]
  const filtered = browseProblems(routes, { wallId: 'w', layoutId: 'l', angle: 35, grade: 'V4' }, '000')
  expect(filtered.map(p => p.number)).toEqual(['CS-000001', 'CS-000003'])
  expect(adjacentProblem(filtered, 'CS-000001', 1)?.number).toBe('CS-000003')
  expect(adjacentProblem(filtered, 'CS-000001', -1)).toBeUndefined()
})
