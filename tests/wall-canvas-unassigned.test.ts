import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('keeps every circular hold transparent like polygon holds', () => {
  const source = readFileSync('web/src/wall-canvas.ts', 'utf8')

  expect(source).not.toContain('const NEUTRAL')
  expect(source).not.toContain('const NEUTRAL_EDGE')
  expect(source).not.toContain('ctx.fillStyle = ROLE_COLORS[role]')
})
