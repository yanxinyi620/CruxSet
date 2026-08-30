import { expect, it } from 'vitest'
import { demoWall } from '../src/data/demo.js'

it('provides a self-contained demo wall with normalized holds', () => {
  expect(demoWall.imageWidth).toBeGreaterThan(0)
  expect(demoWall.holds.length).toBeGreaterThan(10)
  expect(demoWall.holds.every(h => h.x >= 0 && h.x <= 1 && h.y >= 0 && h.y <= 1)).toBe(true)
})
