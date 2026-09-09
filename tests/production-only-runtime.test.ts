import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('ships CloudBase mini-program services and API-backed Web sessions only', () => {
  expect(existsSync('wechat/miniprogram/config/runtime.ts')).toBe(false)
  expect(existsSync('wechat/miniprogram/services/mock-repository.ts')).toBe(false)
  expect(existsSync('web/src/data/preview-repository.ts')).toBe(false)
  expect(existsSync('web/src/data/preview-session.ts')).toBe(false)
  expect(readFileSync('web/src/preview-store.ts', 'utf8')).toContain('ApiSession')
  expect(readFileSync('web/src/preview-store.ts', 'utf8')).not.toContain('PreviewSession')
})
