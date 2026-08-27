import type { Layout, Wall } from './types.js'

export const isRoutableWall = (_wall: Wall, layout?: Layout) =>
  Boolean(layout?.published && layout.holds.length >= 2)
