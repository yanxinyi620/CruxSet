import { expect, it } from 'vitest'
import { toggleGradeFilter } from '../web/src/route-grade-filter.js'

it('adds and removes individual route grades while keeping prior selections', () => {
  expect(toggleGradeFilter([], 'V3')).toEqual(['V3'])
  expect(toggleGradeFilter(['V3'], 'V5')).toEqual(['V3', 'V5'])
  expect(toggleGradeFilter(['V3', 'V5'], 'V3')).toEqual(['V5'])
})
