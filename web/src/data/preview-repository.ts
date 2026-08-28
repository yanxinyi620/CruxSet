import { isRoutableWall } from '../../../miniprogram/domain/routable-wall.js'
import type { Layout, Wall } from '../../../miniprogram/domain/types.js'
import type { PreviewSession } from './preview-session.js'

export type RoutableLayout = { wall: Wall; layout: Layout }

export const listRoutableLayouts = async (session: PreviewSession, walls: Wall[]): Promise<RoutableLayout[]> => {
  const entries = await Promise.all(walls.map(async wall => {
    if (!wall.activeLayoutId) return undefined
    const layout = await session.getLayout(wall.activeLayoutId)
    return isRoutableWall(wall, layout) ? { wall, layout } : undefined
  }))
  return entries.filter((entry): entry is RoutableLayout => Boolean(entry))
}
