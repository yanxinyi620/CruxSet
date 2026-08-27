// @ts-nocheck
import { deleteLayout, listLayouts } from '../../services/layouts.js'
import { deleteWall, listMyWalls } from '../../services/walls.js'

Page({
  data: { walls: [], loading: true },
  onShow() { this.reload() },
  async reload() {
    this.setData({ loading: true })
    try {
      const walls = await listMyWalls()
      const managed = await Promise.all(walls.map(async wall => ({ ...wall, layouts: await listLayouts(wall.id).catch(() => []) })))
      this.setData({ walls: managed, loading: false })
    } catch {
      this.setData({ walls: [], loading: false })
    }
  },
  confirmDeleteLayout(e) {
    const { wallId, layoutId, layoutName, published } = e.currentTarget.dataset
    const content = published ? `将删除“${layoutName}”及其全部关联线路，此操作不可恢复。` : `将删除草稿“${layoutName}”，此操作不可恢复。`
    wx.showModal({ title: '删除 Layout？', content, confirmText: '删除', confirmColor: '#d95b43', success: result => {
      if (!result.confirm) return
      deleteLayout(wallId, layoutId).then(() => this.reload()).catch(() => wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' }))
    }})
  },
  confirmDeleteWall(e) {
    const { wallId, wallName } = e.currentTarget.dataset
    wx.showModal({ title: '删除墙面？', content: `将删除“${wallName}”及其所有 Layout 和线路，此操作不可恢复。`, confirmText: '删除', confirmColor: '#d95b43', success: result => {
      if (!result.confirm) return
      deleteWall(wallId).then(() => this.reload()).catch(() => wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' }))
    }})
  },
})

