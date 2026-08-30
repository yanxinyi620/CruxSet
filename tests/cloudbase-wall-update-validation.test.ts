import { expect, it } from 'vitest'
import { validateWallUpdate } from '../cloudfunctions/adminWall/validation.js'

const wall = {
  id: 'wall_1', name: 'Wall', description: '', imageFileId: 'cloud://wall.jpg', imageWidth: 100, imageHeight: 100,
  geometryType: 'circle', holds: [{ id: 'H001', kind: 'hold', x: 0.1, y: 0.1, radius: 0.1 }],
  angleOptions: [20, 25], ownerId: 'user_1', visibility: 'private', createdAt: 1, updatedAt: 1
}

it('retains INVALID_WALL_HOLDS for malformed legacy hold-only updates', () => {
  expect(() => validateWallUpdate(wall, { holds: [{ id: 'broken' }] }, 'updateWallHolds')).toThrow('INVALID_WALL_HOLDS')
})

it('rejects invalid generic Wall metadata before persistence', () => {
  expect(() => validateWallUpdate(wall, { angleOptions: [] }, 'updateWall')).toThrow('INVALID_WALL_DATA')
  expect(() => validateWallUpdate(wall, { angleOptions: [20, Number.NaN] }, 'updateWall')).toThrow('INVALID_WALL_DATA')
  expect(() => validateWallUpdate(wall, { angleOptions: [15] }, 'updateWall')).toThrow('INVALID_WALL_DATA')
  expect(() => validateWallUpdate(wall, { description: 3 }, 'updateWall')).toThrow('INVALID_WALL_DATA')
  expect(() => validateWallUpdate(wall, { imageFileId: false }, 'updateWall')).toThrow('INVALID_WALL_DATA')
})
