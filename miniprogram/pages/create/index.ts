// @ts-nocheck
Page({
  createWall() { wx.navigateTo({ url: '/pages/admin/index' }) },
  openDrafts() { wx.navigateTo({ url: '/pages/create/drafts/index' }) },
  createProblem() { wx.navigateTo({ url: '/pages/layout-picker/index?mode=create' }) },
})
