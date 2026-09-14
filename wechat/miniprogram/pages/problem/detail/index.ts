// @ts-nocheck
import { browsePage } from '../../../services/browse-page.js'
import { getProblem, listProblems } from '../../../services/browse-data.js'
import { getWall } from '../../../services/browse-data.js'
import { beginPageRead, pageReadError } from '../../../services/page-read-state.js'
import { routeContextFromOptions, routeContextQuery, browseProblems } from '../../../domain/browse.js'
const rules = {feet_follow:['跟随手点','手类点可踩，黄色 Foot 只能脚踩'],specified:['指定脚点','脚只能踩线路中的黄色 Foot'],all:['全墙脚点','当前墙面所有允许踩的岩点均可作为脚点']}
Page(browsePage({
  data: { problem:null, wall:null, activeHolds:{}, footRuleLabel:'跟随手点', footRuleHint:rules.feet_follow[1], previous:null, next:null, error:'', notice:'', loading:true, refreshing:false, fullscreen:false },
  cacheMatches(key){if(key==='*')return true;const [,action,args]=JSON.parse(key),data=Object.fromEntries(args);return action==='getProblem'&&data.id===this.options?.id||action==='getWall'&&data.id===this.data.problem?.wallId||action==='listProblems'&&data.wallId===this.data.problem?.wallId},
  onCacheError(key,error){pageReadError(this,error,{problem:null,wall:null,previous:null,next:null},true)},
  async onLoad(options,readOptions={}) {
    const read=beginPageRead(this,{problem:null,wall:null,previous:null,next:null})
    this.options = options
    this.context = routeContextFromOptions(options)
    try {
      const p = await getProblem(options.id,readOptions)
      const filter = { wallId:p.wallId, ...this.context }
      const [wall, routes] = await Promise.all([getWall(p.wallId,readOptions), listProblems(filter,readOptions)])
      const problems = browseProblems(routes, filter), active = {}
      Object.entries(p.holds).forEach(([role,ids]) => ids.forEach(id => active[id] = role))
      const i = problems.findIndex(x => x.id === p.id)
      read.success({ problem:p, wall, activeHolds:active, footRuleLabel:rules[p.footRule][0], footRuleHint:rules[p.footRule][1], previous:i > 0 ? problems[i-1] : null, next:i >= 0 ? problems[i+1] || null : null })
    } catch (error) { read.failure(error) }
    finally { read.finish() }
  },
  retry() { return this.onPullDownRefresh() },
  open(e) { wx.redirectTo({url:`/pages/problem/detail/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}&${routeContextQuery(this.context)}`}) },
  openFullscreen() { this.setData({fullscreen:true}) },
  closeFullscreen() { this.setData({fullscreen:false}) },
  backToList() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.redirectTo({url:`/pages/route-browser/index?wallId=${encodeURIComponent(this.data.problem.wallId)}`}) },
  onShareAppMessage() { const p=this.data.problem; return p ? {title:`${p.number} · ${p.name || '线路'}`,path:`/pages/problem/detail/index?id=${encodeURIComponent(p.id)}`} : {title:'CruxSet',path:'/pages/walls/index'} },
}))
