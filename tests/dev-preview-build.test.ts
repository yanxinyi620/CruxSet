import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('dev preview scaffold', () => {
  it('has a Vite entry point and configuration', () => {
    expect(existsSync(resolve('web/index.html'))).toBe(true)
    expect(existsSync(resolve('web/vite.config.ts'))).toBe(true)
    expect(existsSync(resolve('web/src/main.ts'))).toBe(true)
  })
})
