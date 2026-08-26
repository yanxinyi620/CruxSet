import { expect, it } from 'vitest'
import { demoLayout, demoWall } from '../src/data/demo.js'

it('provides a consistent demo wall, layout, and normalized holds', () => {
  expect(demoLayout.wallId).toBe(demoWall.id)
  expect(demoWall.activeLayoutId).toBe(demoLayout.id)
  expect(demoLayout.holds.length).toBeGreaterThan(10)
  expect(demoLayout.holds.every(h => h.x >= 0 && h.x <= 1 && h.y >= 0 && h.y <= 1)).toBe(true)
})
