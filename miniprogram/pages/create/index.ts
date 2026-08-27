// @ts-nocheck
import { draftLayoutsForWalls } from '../../domain/draft-layout.js'
import { isRoutableWall } from '../../domain/routable-wall.js'
import { getLayout, listLayouts } from '../../services/layouts.js'
import { listMyWalls, listWalls } from '../../services/walls.js'

Page({
  data: { drafts: [], routableWalls: [], loading: true },
  onShow() { this.reload() },
  async reload() {
    this.setData({ loading: true })
    try {
      const [ownedWalls, publicWalls] = await Promise.all([listMyWalls(), listWalls()])
      const ownedLayouts = (await Promise.all(ownedWalls.map(wall => listLayouts(wall.id).catch(() => [])))).flat()
      const wallById = new Map(ownedWalls.map(wall => [wall.id, wall]))
      const drafts = draftLayoutsForWalls(ownedWalls, ownedLayouts).map(layout => {
        const wall = wallById.get(layout.wallId)
        return { wallId: layout.wallId, layoutId: layout.id, wallName: wall?.name || '未命名墙面', layoutName: layout.name, visibility: wall?.visibility || 'private' }
      })
      const allWalls = [...ownedWalls, ...publicWalls.filter(wall => !wallById.has(wall.id))]
      const routableWalls = (await Promise.all(allWalls.map(async wall => {
        if (!wall.activeLayoutId) return undefined
        const layout = await getLayout(wall.activeLayoutId).catch(() => undefined)
        return isRoutableWall(wall, layout) ? wall : undefined
      }))).filter(Boolean)
      this.setData({ drafts, routableWalls, loading: false })
    } catch {
      this.setData({ drafts: [], routableWalls: [], loading: false })
    }
  },
  createWall() { wx.navigateTo({ url: '/pages/admin/index' }) },
  resumeDraft(e) {
    const { wallId, layoutId } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/admin/layout-editor/index?wallId=${wallId}&layoutId=${layoutId}` })
  },
  openWall(e) { wx.navigateTo({ url: `/pages/wall/index?id=${e.currentTarget.dataset.id}` }) },
})

