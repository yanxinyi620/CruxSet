import type { Wall } from './types.js'

export const isRoutableWall = (wall: Wall) =>
  wall.visibility === 'public' && wall.holds.length >= 2
