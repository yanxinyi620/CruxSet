import { expect, it } from 'vitest'
import { latestLayouts } from '../src/domain/layout-publication.js'

it('keeps only the newest snapshot for each layout id', () => {
  expect(latestLayouts([
    { id: 'layout_a', version: 1, published: false },
    { id: 'layout_a', version: 2, published: true },
    { id: 'layout_b', version: 1, published: false }
  ])).toEqual([
    { id: 'layout_a', version: 2, published: true },
    { id: 'layout_b', version: 1, published: false }
  ])
})
