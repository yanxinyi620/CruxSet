import { expect, it } from 'vitest'
import { RandomSession } from '../src/domain/random.js'
it('emits every filtered route once before reshuffling', () => {
  const s = new RandomSession(['a','b','c'], () => .1)
  expect([s.next(), s.next(), s.next()].sort()).toEqual(['a','b','c'])
  expect(s.next()).toBeTruthy()
})
