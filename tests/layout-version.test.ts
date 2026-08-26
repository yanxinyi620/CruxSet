import { expect, it } from 'vitest'
import { nextLayoutVersion } from '../src/domain/layout-version.js'
it('increments layout version for every update while reset starts a new layout at one', () => { expect(nextLayoutVersion(1)).toBe(2); expect(nextLayoutVersion(8)).toBe(9); expect(nextLayoutVersion(undefined)).toBe(1) })
