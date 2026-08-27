import type { Layout, Wall } from './types.js'

export const isRoutableWall = (wall: Wall, layout?: Layout) =>
  Boolean(wall.activeLayoutId && layout && layout.id === wall.activeLayoutId && layout.published && layout.holds.length >= 2)
