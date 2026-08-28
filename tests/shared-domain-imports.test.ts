import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createProblem } from '../src/domain/routes.js'
import { createProblem as miniCreateProblem } from '../miniprogram/domain/routes.js'

it('keeps mini program routes inside its package while preserving route behavior', () => {
  const source = readFileSync('miniprogram/domain/routes.ts', 'utf8')
  expect(source).not.toContain('/src/')

  const draft = {
    id: 'problem_1', number: 'CS-000001', wallId: 'wall_1', layoutId: 'layout_1',
    angle: 35, grade: 'V4', holds: { start: ['H001'], finish: ['H002'] }, createdBy: 'usr_1', now: 100,
  }
  const wall = { id: 'wall_1', angleOptions: [35] }
  const layout = { id: 'layout_1', wallId: 'wall_1', version: 1, holds: [{ id: 'H001' }, { id: 'H002' }] }
  expect(miniCreateProblem(draft as any, wall as any, layout as any)).toEqual(createProblem(draft as any, wall as any, layout as any))
})
