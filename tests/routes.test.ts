import { describe, expect, it } from 'vitest'
import { createProblem, filterProblems, searchProblems } from '../src/domain/routes.js'
import type { Hold } from '../src/domain/types.js'

const holds: Hold[] = [
  { id: 'H1', layoutId: 'L1', type: 'start', x: .1, y: .1, radius: .02 },
  { id: 'H2', layoutId: 'L1', type: 'hand', x: .2, y: .2, radius: .02 },
  { id: 'H3', layoutId: 'L1', type: 'foot', x: .3, y: .3, radius: .02 },
]

describe('route rules', () => {
  it('defaults to feet_follow and validates referenced holds', () => {
    expect(createProblem({ number: 'CS-000001', wallId: 'W1', layoutId: 'L1', angle: 35, grade: 'V4', holds }, { start: ['H1'], hand: ['H2'], foot: ['H3'] }).footRule).toBe('feet_follow')
    expect(() => createProblem({ number: 'CS-000002', wallId: 'W1', layoutId: 'L1', angle: 35, grade: 'V4', holds }, { start: ['missing'] })).toThrow()
  })
  it('filters and searches within route metadata', () => {
    const a = createProblem({ number: 'CS-000002', name: '左侧动态', wallId: 'W1', layoutId: 'L1', angle: 35, grade: 'V4', holds }, { start: ['H1'] })
    const b = createProblem({ number: 'CS-000001', wallId: 'W1', layoutId: 'L1', angle: 25, grade: 'V3', holds }, { start: ['H1'] })
    expect(filterProblems([a, b], { wallId: 'W1', layoutId: 'L1', angle: 35, grade: 'V4' })).toEqual([a])
    expect(searchProblems([a, b], '动态')).toEqual([a])
  })
})
