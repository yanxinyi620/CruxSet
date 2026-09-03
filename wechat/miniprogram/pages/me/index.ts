// @ts-nocheck
import { listMyProblems } from '../../services/problems.js'
import { currentUserIsAdmin } from '../../services/users.js'
Page({data:{problemCount:0,isAdmin:false},onShow(){Promise.all([listMyProblems(),currentUserIsAdmin()]).then(([problems,isAdmin])=>this.setData({problemCount:problems.length,isAdmin}))},openWalls(){if(!this.data.isAdmin)return wx.showToast({title:'仅管理员可管理墙面',icon:'none'});wx.navigateTo({url:'/pages/me/walls/index'})},openProblems(){wx.navigateTo({url:'/pages/me/problems/index'})}})
