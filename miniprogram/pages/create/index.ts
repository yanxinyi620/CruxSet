// @ts-nocheck
Page({
  createWall() { wx.navigateTo({ url: '/pages/admin/index' }) },
  openDrafts() { wx.navigateTo({ url: '/pages/create/drafts/index' }) },
  createProblem() { wx.navigateTo({ url: '/pages/wall-picker/index?mode=create' }) },
})
