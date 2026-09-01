import { expect, it } from 'vitest'
import { createProblemNumber, MemoryProblemService } from '../src/repository/problem-service.js'
import { demoWall } from '../src/data/demo.js'

it('generates the next visible route number from a server-side counter', () => {
  expect(createProblemNumber(0)).toBe('CS-000001')
  expect(createProblemNumber(128)).toBe('CS-000129')
})

it('numbers routes by wall number and sequence within that wall', async () => {
  const service = new MemoryProblemService({ nextNumber: 7 })
  const draft = { wallId: demoWall.id, angle: 35, grade: 'V4' as const, holds: { start: ['H001'], finish: ['H002'] }, createdBy: 'usr_demo' }
  const first = await service.save({ wall: demoWall, draft })
  const second = await service.save({ wall: demoWall, draft })
  expect(first.number).toBe('CS-010001')
  expect(second.number).toBe('CS-010002')
  expect(first.id).not.toBe(first.number)
  expect((await service.list())[0].createdBy).toBe('usr_demo')
})
