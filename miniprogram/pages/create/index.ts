// @ts-nocheck
import { draftLayoutsForWalls } from '../../domain/draft-layout.js'
import { listLayouts } from '../../services/layouts.js'
import { listMyWalls } from '../../services/walls.js'

Page({
  data: { drafts: [], loading: true },
  onShow() { this.reload() },
  async reload() {
    this.setData({ loading: true })
    try {
      const ownedWalls = await listMyWalls()
      const ownedLayouts = (await Promise.all(ownedWalls.map(wall => listLayouts(wall.id).catch(() => [])))).flat()
      const wallById = new Map(ownedWalls.map(wall => [wall.id, wall]))
      const drafts = draftLayoutsForWalls(ownedWalls, ownedLayouts).map(layout => {
        const wall = wallById.get(layout.wallId)
        return { wallId: layout.wallId, layoutId: layout.id, wallName: wall?.name || '未命名墙面', layoutName: layout.name, visibility: wall?.visibility || 'private' }
      })
      this.setData({ drafts, loading: false })
    } catch {
      this.setData({ drafts: [], loading: false })
    }
  },
  createWall() { wx.navigateTo({ url: '/pages/admin/index' }) },
  resumeDraft(e) {
    const { wallId, layoutId } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/admin/layout-editor/index?wallId=${wallId}&layoutId=${layoutId}` })
  },
  createProblem() { wx.navigateTo({ url: '/pages/layout-picker/index?mode=create' }) },
})
