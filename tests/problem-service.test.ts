import { expect, it } from 'vitest'
import { createProblemNumber, MemoryProblemService } from '../src/repository/problem-service.js'
import { demoLayout, demoWall } from '../src/data/demo.js'

it('generates the next visible route number from a server-side counter', () => {
  expect(createProblemNumber(0)).toBe('CS-000001')
  expect(createProblemNumber(128)).toBe('CS-000129')
})

it('validates and persists a route with a distinct generated id', async () => {
  const service = new MemoryProblemService({ nextNumber: 7 })
  const problem = await service.save({ wall: demoWall, layout: demoLayout, draft: { wallId: demoWall.id, layoutId: demoLayout.id, angle: 35, grade: 'V4', holds: { start: ['H001'], finish: ['H002'] }, createdBy: 'usr_demo' } })
  expect(problem.number).toBe('CS-000008')
  expect(problem.id).not.toBe(problem.number)
  expect((await service.list())[0].createdBy).toBe('usr_demo')
})
