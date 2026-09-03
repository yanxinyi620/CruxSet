import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('adds full-image local detections directly to the wall annotation', () => {
  const source = readFileSync('web/src/main.ts', 'utf8')

  expect(source).toContain('autoDetectHolds')
  expect(source).toContain('[data-detect]')
  expect(source).toContain('c.editor.replace(detected)')
  expect(source).not.toContain('data-roi')
  expect(source).not.toContain('data-confirm-all')
  expect(source).toContain('data-manual-calibration')
  expect(source).toContain('data-redo')
  expect(source).toContain('annotation-primary-active')
})
