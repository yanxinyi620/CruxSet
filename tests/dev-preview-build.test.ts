import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('dev preview scaffold', () => {
  it('has a Vite entry point and configuration', () => {
    expect(existsSync(resolve('dev-preview/index.html'))).toBe(true)
    expect(existsSync(resolve('dev-preview/vite.config.ts'))).toBe(true)
    expect(existsSync(resolve('dev-preview/src/main.ts'))).toBe(true)
  })
})
