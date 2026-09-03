// @ts-nocheck
import { listMyProblems } from '../../services/problems.js'
Page({data:{problemCount:0},onShow(){listMyProblems().then(problems=>this.setData({problemCount:problems.length}))},openWalls(){wx.navigateTo({url:'/pages/me/walls/index'})},openProblems(){wx.navigateTo({url:'/pages/me/problems/index'})}})
