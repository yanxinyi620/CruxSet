import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const validation = require(resolve(process.cwd(), 'cloudfunctions/saveProblem/validation.js')) as { validateRouteMetadata: (draft: Record<string, unknown>) => void }

it('rejects non-string or overlong route names', () => {
  expect(() => validation.validateRouteMetadata({ name: 3 })).toThrow('INVALID_ROUTE_METADATA')
  expect(() => validation.validateRouteMetadata({ name: 'x'.repeat(81) })).toThrow('INVALID_ROUTE_METADATA')
})

it('rejects non-string or overlong route descriptions', () => {
  expect(() => validation.validateRouteMetadata({ description: 3 })).toThrow('INVALID_ROUTE_METADATA')
  expect(() => validation.validateRouteMetadata({ description: 'x'.repeat(501) })).toThrow('INVALID_ROUTE_METADATA')
})
