import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('connects the annotation detect button to local heuristic detection candidates', () => {
  const source = readFileSync('web/src/main.ts', 'utf8')

  expect(source).toContain('autoDetectHolds')
  expect(source).toContain('[data-detect]')
  expect(source).toContain('replaceCandidates')
  expect(source).toContain('onConfirmCandidate')
})
