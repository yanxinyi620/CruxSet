import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('adds full-image local detections directly to the wall annotation', () => {
  const source = readFileSync('web/src/main.ts', 'utf8')

  expect(source).toContain('autoDetectHolds')
  expect(source).toContain('[data-detect]')
  expect(source).toContain('confirmCandidates')
  expect(source).not.toContain('data-roi')
  expect(source).not.toContain('data-confirm-all')
})
