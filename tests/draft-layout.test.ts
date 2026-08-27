import { expect, it } from 'vitest'
import { draftLayoutsForWalls } from '../src/domain/draft-layout.js'

const walls = [{ id: 'wall_a' }, { id: 'wall_b' }] as any
const layouts = [
  { id: 'draft_a', wallId: 'wall_a', published: false },
  { id: 'published_a', wallId: 'wall_a', published: true },
  { id: 'foreign', wallId: 'wall_x', published: false },
] as any

it('returns only unpublished layouts belonging to supplied walls', () => {
  expect(draftLayoutsForWalls(walls, layouts)).toEqual([
    { id: 'draft_a', wallId: 'wall_a', published: false },
  ])
})
