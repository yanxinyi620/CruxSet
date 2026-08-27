// @ts-nocheck
import { listMyWalls } from '../../services/walls.js'
Page({data:{walls:[],loading:true},onShow(){listMyWalls().then(walls=>this.setData({walls,loading:false})).catch(()=>this.setData({loading:false}))},create(){wx.navigateTo({url:'/pages/admin/index'})},open(e){wx.navigateTo({url:`/pages/wall/index?id=${e.currentTarget.dataset.id}`})}})
