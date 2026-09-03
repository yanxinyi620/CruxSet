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
  expect(source).toContain('确认一键清空所有岩点？')
  expect(source).toContain('发布后即公开并锁定墙面，不支持再次修改。')
  expect(source).not.toContain('saveDraft(`wall:')
})
