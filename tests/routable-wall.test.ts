import { expect, it } from 'vitest'
import { isRoutableWall } from '../src/domain/routable-wall.js'

const wall = { id: 'w', activeLayoutId: 'l' } as any
const usable = { id: 'l', published: true, holds: [{ id: 'H001' }, { id: 'H002' }] } as any

it('requires the active published layout to have two holds', () => {
  expect(isRoutableWall(wall, usable)).toBe(true)
  expect(isRoutableWall({ ...wall, activeLayoutId: '' }, usable)).toBe(false)
  expect(isRoutableWall(wall, { ...usable, published: false })).toBe(false)
  expect(isRoutableWall(wall, { ...usable, holds: [{ id: 'H001' }] })).toBe(false)
  expect(isRoutableWall(wall, { ...usable, id: 'another' })).toBe(false)
})
