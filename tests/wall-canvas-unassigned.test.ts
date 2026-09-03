import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('draws all three outline bands outside assigned holds', () => {
  const source = readFileSync('web/src/wall-canvas.ts', 'utf8')

  expect(source).not.toContain('const NEUTRAL')
  expect(source).not.toContain('const NEUTRAL_EDGE')
  expect(source).toContain('ctx.lineWidth = 8')
  expect(source).toContain('ctx.lineWidth = 6')
  expect(source).toContain('ctx.strokeStyle = "#ffffff"')
  expect(source).toContain('ctx.clip("evenodd")')
  expect(source).toContain('ctx.lineWidth = 2')
  expect(source).toContain('ctx.strokeStyle = ROLE_COLORS[role]')
})
