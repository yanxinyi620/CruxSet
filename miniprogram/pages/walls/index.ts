// @ts-nocheck
import { listLayouts } from '../../services/layouts.js'
import { listWalls } from '../../services/walls.js'
const formatWall = async w => {
  const published = (await listLayouts(w.id).catch(() => [])).filter(layout => layout.published)
  return published.length ? { id: w.id, name: w.name, publishedCount: published.length, angles: w.angles || w.angleOptions || [] } : undefined
}
const demo=[{id:'wall_demo',name:'日坛 Spraywall',publishedCount:1,angles:[20,25,30,35,40,45]}]
const load = async () => (await Promise.all((await listWalls()).map(formatWall))).filter(Boolean)
Page({data:{walls:demo,loading:true,error:''},onShow(){load().then(walls=>this.setData({walls,error:''})).catch(error=>this.setData({error:error.message||'加载失败，请稍后重试'})).finally(()=>this.setData({loading:false}))},openWall(e){wx.navigateTo({url:`/pages/layout-picker/index?wallId=${e.currentTarget.dataset.id}&mode=browse`})}})
