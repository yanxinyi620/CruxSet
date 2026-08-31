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

it('uses an edge-to-edge mobile viewport shell without legacy device dimensions', () => {
  const css = readFileSync('web/src/styles/responsive.css', 'utf8')
  const legacyDeviceCss = readFileSync('web/src/styles/device.css', 'utf8')
  expect(css).toMatch(/\.device \{\n  width: 100vw;\n  height: 100dvh;\n  margin: 0;/)
  expect(legacyDeviceCss).not.toMatch(/width: min\(390px, 100vw\);|height: 844px;/)
})

it('limits the framed shell to wide pointer-based desktop devices', () => {
  const css = readFileSync('web/src/styles/responsive.css', 'utf8')
  expect(css).toContain('@media (min-width: 720px) and (hover: hover) and (pointer: fine)')
})
