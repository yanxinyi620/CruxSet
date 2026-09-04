// @ts-nocheck
import { listWalls } from '../../services/walls.js'
Page({data:{walls:[],loading:true,error:''},onShow(){this.setData({loading:true,error:''});listWalls().then(walls=>this.setData({walls,error:''})).catch(error=>this.setData({walls:[],error:error.message||'加载失败，请稍后重试'})).finally(()=>this.setData({loading:false}))},openWall(e){wx.navigateTo({url:`/pages/wall/index?wallId=${e.currentTarget.dataset.id}`})}})
