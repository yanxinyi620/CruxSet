// @ts-nocheck
import { draftLayoutsForWalls } from '../../../domain/draft-layout.js'
import { listLayouts } from '../../../services/layouts.js'
import { listMyWalls } from '../../../services/walls.js'

Page({
  data: { drafts: [], loading: true },
  onShow() { this.reload() },
  async reload() {
    this.setData({ loading: true })
    try {
      const walls = await listMyWalls()
      const layouts = (await Promise.all(walls.map(wall => listLayouts(wall.id).catch(() => [])))).flat()
      const wallById = new Map(walls.map(wall => [wall.id, wall]))
      const drafts = draftLayoutsForWalls(walls, layouts).map(layout => ({
        wallId: layout.wallId,
        layoutId: layout.id,
        wallName: wallById.get(layout.wallId)?.name || '未命名墙面',
        layoutName: layout.name,
      }))
      this.setData({ drafts, loading: false })
    } catch {
      this.setData({ drafts: [], loading: false })
    }
  },
  resumeDraft(event) {
    const { wallId, layoutId } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/admin/layout-editor/index?wallId=${wallId}&layoutId=${layoutId}` })
  },
})
