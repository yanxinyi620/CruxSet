// @ts-nocheck
import { listWalls } from '../../services/walls.js'
const demo=[{id:'wall_demo',name:'日坛 Spraywall',layoutName:'2026-08 Layout',angles:[20,25,30,35,40,45]}]
Page({data:{walls:demo,loading:true},onLoad(){listWalls().then(walls=>this.setData({walls:walls.map(w=>({id:w.id,name:w.name,layoutName:w.activeLayoutId,angles:w.angleOptions}))})).catch(()=>{}).finally(()=>this.setData({loading:false}))},openWall(e){wx.navigateTo({url:`/pages/wall/index?id=${e.currentTarget.dataset.id}`})}})
