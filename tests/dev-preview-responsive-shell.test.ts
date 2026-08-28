import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('uses a stable dynamic viewport height for the responsive preview shell', () => {
  const css = readFileSync('dev-preview/src/styles/responsive.css', 'utf8')
  expect(css).toMatch(/\n  height: 100dvh;/)
  expect(css).toMatch(/\n    height: calc\(100dvh - 48px\);/)
})
