// @ts-nocheck
import { syncTabBar } from '../../services/tab-bar.js'
Page({
  onShow() { syncTabBar(this, 1) },
  createProblem() { wx.navigateTo({ url: '/pages/wall-picker/index?mode=create' }) },
})
