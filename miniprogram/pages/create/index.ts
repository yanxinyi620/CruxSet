// @ts-nocheck
import { listWalls, listMyWalls } from '../../services/walls.js'
Page({data:{walls:[],loading:true},onShow(){Promise.all([listWalls(),listMyWalls()]).then(([publicWalls,owned])=>{const all=[...owned,...publicWalls.filter(w=>!owned.some(o=>o.id===w.id))];this.setData({walls:all,loading:false})}).catch(()=>this.setData({loading:false}))},createWall(){wx.navigateTo({url:'/pages/admin/index'})},openWall(e){wx.navigateTo({url:`/pages/wall/index?id=${e.currentTarget.dataset.id}`})}})
