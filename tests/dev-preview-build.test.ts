import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('dev preview scaffold', () => {
  it('has a Vite entry point and configuration', () => {
    expect(existsSync(resolve('web/index.html'))).toBe(true)
    expect(existsSync(resolve('web/vite.config.ts'))).toBe(true)
    expect(existsSync(resolve('web/src/main.ts'))).toBe(true)
  })

  it('uses wall fields throughout the web entry point', () => {
    const source = readFileSync(resolve('web/src/main.ts'), 'utf8')
    expect(source).toContain('wall.imageFileId')
    expect(source).toContain('wall.holds')
    expect(source).toContain('wall.visibility')
    expect(source).not.toMatch(/\b(?:get|list|update|publish|delete)Layout\b/)
  })
})
