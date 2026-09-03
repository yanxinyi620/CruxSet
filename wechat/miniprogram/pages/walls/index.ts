// @ts-nocheck
import { listWalls } from '../../services/walls.js'
const demo=[{id:'wall_demo',name:'日坛 Spraywall',holds:Array(24),angleOptions:[20,25,30,35,40,45]}]
Page({data:{walls:demo,loading:true,error:''},onShow(){listWalls().then(walls=>this.setData({walls,error:''})).catch(error=>this.setData({error:error.message||'加载失败，请稍后重试'})).finally(()=>this.setData({loading:false}))},openWall(e){wx.navigateTo({url:`/pages/wall/index?wallId=${e.currentTarget.dataset.id}`})}})
