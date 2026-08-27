import { describe, expect, it } from 'vitest'
import { createMockRepository, mockCurrentUserId } from '../miniprogram/services/mock-repository.js'

describe('my problems', () => {
  it('lists only problems created by the current user', async () => {
    const repository = createMockRepository()
    const mine = await repository.listMyProblems()
    expect(mine.every(problem => problem.createdBy === mockCurrentUserId)).toBe(true)
  })
})
