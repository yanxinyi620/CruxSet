import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createProblem, filterProblems, searchProblems } from '../src/domain/routes.js'
import { createProblem as miniCreateProblem, filterProblems as miniFilterProblems, searchProblems as miniSearchProblems } from '../miniprogram/domain/routes.js'

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

it('matches web route filtering and searching behavior directly', () => {
  const wall = { id: 'wall_1', angleOptions: [25, 35] }
  const layout = { id: 'layout_1', wallId: 'wall_1', version: 1, holds: [{ id: 'H001' }, { id: 'H002' }] }
  const drafts = [
    { id: 'problem_2', number: 'CS-000002', name: '左侧动态', wallId: 'wall_1', layoutId: 'layout_1', angle: 35, grade: 'V4', holds: { start: ['H001'], finish: ['H002'] }, createdBy: 'usr_1', now: 100 },
    { id: 'problem_1', number: 'CS-000001', name: '右侧静态', wallId: 'wall_1', layoutId: 'layout_1', angle: 25, grade: 'V3', holds: { start: ['H001'], finish: ['H002'] }, createdBy: 'usr_1', now: 100 },
  ]
  const webProblems = drafts.map(draft => createProblem(draft as any, wall as any, layout as any))
  const miniProblems = drafts.map(draft => miniCreateProblem(draft as any, wall as any, layout as any))

  expect(miniFilterProblems(miniProblems as any, { angle: 35 })).toEqual(filterProblems(webProblems, { angle: 35 }))
  expect(miniFilterProblems(miniProblems as any, {})).toEqual(filterProblems(webProblems, {}))
  expect(miniSearchProblems(miniProblems as any, '动态')).toEqual(searchProblems(webProblems, '动态'))
  expect(miniSearchProblems(miniProblems as any, '000')).toEqual(searchProblems(webProblems, '000'))
  expect(miniSearchProblems(miniProblems as any, '  ')).toEqual(searchProblems(webProblems, '  '))
})
