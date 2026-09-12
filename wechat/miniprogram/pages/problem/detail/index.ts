// @ts-nocheck
import { browsePage } from '../../../services/browse-page.js'
import { getProblem, listProblems } from '../../../services/browse-data.js'
import { getWall } from '../../../services/browse-data.js'
import { cloudErrorMessage } from '../../../services/errors.js'
import { routeContextFromOptions, routeContextQuery, browseProblems } from '../../../domain/browse.js'
const rules = {feet_follow:['跟随手点','手类点可踩，黄色 Foot 只能脚踩'],specified:['指定脚点','脚只能踩线路中的黄色 Foot'],all:['全墙脚点','当前墙面所有允许踩的岩点均可作为脚点']}
Page(browsePage({
  data: { problem:null, wall:null, activeHolds:{}, footRuleLabel:'跟随手点', footRuleHint:rules.feet_follow[1], previous:null, next:null, error:'', loading:true, fullscreen:false },
  async onLoad(options) {
    const request=this._browseRequest=(this._browseRequest||0)+1
    this.options = options
    this.context = routeContextFromOptions(options)
    try {
      const p = await getProblem(options.id)
      const filter = { wallId:p.wallId, ...this.context }
      const [wall, routes] = await Promise.all([getWall(p.wallId), listProblems(filter)])
      const problems = browseProblems(routes, filter), active = {}
      Object.entries(p.holds).forEach(([role,ids]) => ids.forEach(id => active[id] = role))
      const i = problems.findIndex(x => x.id === p.id)
      if(request!==this._browseRequest)return
      this.setData({ problem:p, wall, activeHolds:active, footRuleLabel:rules[p.footRule][0], footRuleHint:rules[p.footRule][1], previous:i > 0 ? problems[i-1] : null, next:i >= 0 ? problems[i+1] || null : null, loading:false, error:'' })
    } catch (error) { if(request===this._browseRequest)this.setData({ problem:null, wall:null, loading:false, error:cloudErrorMessage(error) }) }
  },
  retry() { this.setData({loading:true,error:''}); return this.onLoad(this.options) },
  open(e) { wx.redirectTo({url:`/pages/problem/detail/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}&${routeContextQuery(this.context)}`}) },
  openFullscreen() { this.setData({fullscreen:true}) },
  closeFullscreen() { this.setData({fullscreen:false}) },
  backToList() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.redirectTo({url:`/pages/route-browser/index?wallId=${encodeURIComponent(this.data.problem.wallId)}`}) },
  onShareAppMessage() { const p=this.data.problem; return p ? {title:`${p.number} · ${p.name || '线路'}`,path:`/pages/problem/detail/index?id=${encodeURIComponent(p.id)}`} : {title:'CruxSet',path:'/pages/walls/index'} },
}))
