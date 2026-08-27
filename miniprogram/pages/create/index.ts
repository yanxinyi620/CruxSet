// @ts-nocheck
import { listWalls, listMyWalls } from '../../services/walls.js'
import { getLayout } from '../../services/layouts.js'
import { isRoutableWall } from '../../domain/routable-wall.js'
Page({data:{walls:[],loading:true},onShow(){this.setData({loading:true});Promise.all([listWalls(),listMyWalls()]).then(async([publicWalls,owned])=>{const all=[...owned,...publicWalls.filter(w=>!owned.some(o=>o.id===w.id))];const routable=await Promise.all(all.map(async wall=>{if(!wall.activeLayoutId)return undefined;const layout=await getLayout(wall.activeLayoutId).catch(()=>undefined);return isRoutableWall(wall,layout)?wall:undefined}));this.setData({walls:routable.filter(Boolean),loading:false})}).catch(()=>this.setData({loading:false}))},createWall(){wx.navigateTo({url:'/pages/admin/index'})},openWall(e){wx.navigateTo({url:`/pages/wall/index?id=${e.currentTarget.dataset.id}`})}})
