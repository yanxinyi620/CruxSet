import type { Layout, Wall } from './types.js'

export const draftLayoutsForWalls = (walls: readonly Wall[], layouts: readonly Layout[]) => {
  const wallIds = new Set(walls.map(wall => wall.id))
  return layouts.filter(layout => wallIds.has(layout.wallId) && !layout.published)
}
