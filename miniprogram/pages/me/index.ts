// @ts-nocheck
import { listMyProblems } from '../../services/problems.js'
import { listMyWalls } from '../../services/walls.js'
Page({data:{wallCount:0,problemCount:0},onShow(){Promise.all([listMyWalls(),listMyProblems()]).then(([walls,problems])=>this.setData({wallCount:walls.length,problemCount:problems.length}))},openWalls(){wx.navigateTo({url:'/pages/me/walls/index'})},openProblems(){wx.navigateTo({url:'/pages/me/problems/index'})}})
