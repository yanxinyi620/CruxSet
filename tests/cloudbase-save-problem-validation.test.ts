import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const validation = require(resolve(process.cwd(), 'wechat/cloudfunctions/saveProblem/validation.js')) as { validateRouteMetadata: (draft: Record<string, unknown>) => void }

it('rejects non-string or overlong route names', () => {
  expect(() => validation.validateRouteMetadata({ name: 3 })).toThrow('INVALID_ROUTE_METADATA')
  expect(() => validation.validateRouteMetadata({ name: 'x'.repeat(81) })).toThrow('INVALID_ROUTE_METADATA')
})

it('rejects non-string or overlong route descriptions', () => {
  expect(() => validation.validateRouteMetadata({ description: 3 })).toThrow('INVALID_ROUTE_METADATA')
  expect(() => validation.validateRouteMetadata({ description: 'x'.repeat(501) })).toThrow('INVALID_ROUTE_METADATA')
})

it('initializes the problem number counter when its document is missing', () => {
  const source = readFileSync(resolve(process.cwd(), 'wechat/cloudfunctions/saveProblem/index.js'), 'utf8')
  expect(source).toContain('problem_number does not exist')
  expect(source).toContain('value: 0')
})
