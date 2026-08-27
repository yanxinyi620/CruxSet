// @ts-nocheck
import { listLayouts } from '../../services/layouts.js'
import { getWall, listWalls } from '../../services/walls.js'
Page({data:{items:[],mode:'browse'},async onLoad(o){const mode=o.mode||'browse',walls=o.wallId?[await getWall(o.wallId)]:await listWalls();const items=(await Promise.all(walls.map(async wall=>(await listLayouts(wall.id)).filter(l=>l.published).map(layout=>({id:layout.id,wall,layout}))))).flat();this.setData({items,mode})},choose(e){const {wallId,layoutId}=e.currentTarget.dataset;if(this.data.mode==='create')wx.navigateTo({url:`/pages/problem/editor/index?wallId=${wallId}&layoutId=${layoutId}`});else wx.navigateTo({url:`/pages/wall/index?id=${wallId}&layoutId=${layoutId}`})}})
