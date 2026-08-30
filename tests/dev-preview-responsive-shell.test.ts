import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('uses a stable dynamic viewport height for the responsive preview shell', () => {
  const css = readFileSync('web/src/styles/responsive.css', 'utf8')
  expect(css).toMatch(/\n  height: 100dvh;/)
  expect(css).toMatch(/\n    height: calc\(100dvh - 48px\);/)
})

it('styles owned wall cards without layout-specific selectors', () => {
  const css = readFileSync('web/src/styles/device.css', 'utf8')
  expect(css).toContain('.wall-management-card')
  expect(css).not.toContain('.layout-card')
})
