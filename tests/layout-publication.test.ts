import { expect, it } from 'vitest'
import { canEditLayout, isLayoutPublished } from '../src/domain/layout-publication.js'

it('only treats an explicitly published layout as locked', () => {
  expect(isLayoutPublished({ published: true })).toBe(true)
  expect(isLayoutPublished({ published: false })).toBe(false)
  expect(isLayoutPublished({})).toBe(false)
  expect(canEditLayout({ published: true })).toBe(false)
  expect(canEditLayout({ published: false })).toBe(true)
})
