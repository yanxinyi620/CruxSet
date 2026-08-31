import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('uses a stable dynamic viewport height for the responsive preview shell', () => {
  const css = readFileSync('web/src/styles/responsive.css', 'utf8')
  expect(css).toMatch(/\n  height: 100dvh !important;/)
  expect(css).not.toMatch(/height: calc\(100dvh - 48px\)/)
})

it('styles owned wall cards without layout-specific selectors', () => {
  const css = readFileSync('web/src/styles/device.css', 'utf8')
  expect(css).toContain('.wall-management-card')
  expect(css).not.toContain('.layout-card')
})

it('uses an edge-to-edge mobile viewport shell without legacy device dimensions', () => {
  const css = readFileSync('web/src/styles/responsive.css', 'utf8')
  const legacyDeviceCss = readFileSync('web/src/styles/device.css', 'utf8')
  expect(css).toMatch(/\.device \{\n  width: 100vw !important;[\s\S]*height: 100dvh !important;[\s\S]*margin: 0 !important;/)
  expect(legacyDeviceCss).not.toMatch(/width: min\(390px, 100vw\);|height: 844px;/)
})

it('makes the document and shell explicitly fill the viewport', () => {
  const css = readFileSync('web/src/styles/responsive.css', 'utf8')
  expect(css).toContain('html, body, #app { width: 100%; height: 100%; min-height: 100%; margin: 0; padding: 0; }')
  expect(css).toContain('max-width: none !important;')
})

it('does not add an outer framed shell around the viewport', () => {
  const css = readFileSync('web/src/styles/responsive.css', 'utf8')
  expect(css).not.toMatch(/@media[^{]*\{[\s\S]*\.device[\s\S]*margin: 24px auto;/)
})
