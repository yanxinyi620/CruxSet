import { expect, it } from 'vitest'
import { createId } from '../src/domain/ids.js'

it('creates prefixed unique ids without using visible numbers', () => {
  const first = createId('problem', () => 1700000000000)
  const second = createId('problem', () => 1700000000000)
  expect(first).toMatch(/^problem_[0-9a-z]+_[0-9a-z]+$/)
  expect(second).not.toBe(first)
  expect(first).not.toBe('CS-000001')
})
