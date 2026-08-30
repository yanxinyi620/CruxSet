import { describe, expect, it } from 'vitest'
import { createProblem } from '../src/domain/routes.js'
import { isRoutableWall } from '../src/domain/routable-wall.js'
import type { Wall } from '../src/domain/types.js'

const wall: Wall = {
  id: 'wall_1',
  name: '日坛',
  description: '',
  imageFileId: 'cloud://wall',
  displayImageFileId: 'cloud://wall-display',
  imageWidth: 1000,
  imageHeight: 800,
  geometryType: 'circle',
  holds: [
    { id: 'H001', x: .1, y: .1, radius: .02, kind: 'hold' },
    { id: 'H002', x: .2, y: .2, radius: .02, kind: 'hold' },
  ],
  angleOptions: [25, 35],
  ownerId: 'usr_1',
  visibility: 'public',
  createdAt: 1,
  updatedAt: 1,
}

describe('wall lifecycle', () => {
  it('makes a public wall with two holds routable', () => {
    expect(isRoutableWall(wall)).toBe(true)
  })

  it('rejects a problem assigned to a hold outside the wall', () => {
    expect(() => createProblem({
      id: 'problem_1',
      number: 'CS-000001',
      wallId: wall.id,
      angle: 35,
      grade: 'V4',
      holds: { start: ['missing'], finish: ['H002'] },
      createdBy: 'usr_1',
      now: 100,
    }, wall)).toThrow('unknown hold: missing')
  })
})
