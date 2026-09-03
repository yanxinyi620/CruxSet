import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('uses one role-colored outline with a white glow for assigned holds', () => {
  const source = readFileSync('web/src/wall-canvas.ts', 'utf8')

  expect(source).not.toContain('const NEUTRAL')
  expect(source).not.toContain('const NEUTRAL_EDGE')
  expect(source).not.toContain('ctx.strokeStyle = "#ffffff"')
  expect(source).toContain('ctx.shadowColor = "#ffffff"')
  expect(source).toContain('ctx.strokeStyle = ROLE_COLORS[role]')
})
