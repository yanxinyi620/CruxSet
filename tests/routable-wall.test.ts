import { expect, it } from 'vitest'
import { isRoutableWall } from '../src/domain/routable-wall.js'
import type { Wall } from '../src/domain/types.js'

const wall = { visibility:'public', holds:[{id:'H001'},{id:'H002'}] } as Wall

it('requires a public wall with at least two holds', () => {
  expect(isRoutableWall(wall)).toBe(true)
  expect(isRoutableWall({ ...wall, visibility:'private' })).toBe(false)
  expect(isRoutableWall({ ...wall, holds:[{id:'H001'}] } as Wall)).toBe(false)
})
