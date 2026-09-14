// @ts-nocheck
import { browsePage } from '../../services/browse-page.js'
import { browseProblems, routeContextQuery } from '../../domain/browse.js'
import { listProblems } from '../../services/browse-data.js'
import { getWall } from '../../services/browse-data.js'
import { beginPageRead, pageReadError } from '../../services/page-read-state.js'
import { isReadRevoked } from '../../services/read-cache.js'
const grades = ['全部', ...Array.from({ length: 17 }, (_, i) => `V${i}`)]
import { routeAngles } from '../../domain/angles.js'
Page(browsePage({
  data: { wallId:'', wallName:'', angles:[null,...routeAngles], angleLabels:['全部',...routeAngles.map(angle=>`${angle}°`)], angleIndex:0, gradeIndex:0, grades, angle:null, grade:'全部', problems:[], loading:true, refreshing:false, error:'', notice:'' },
  cacheMatches(key){if(key==='*')return true;const [,action,args]=JSON.parse(key),data=Object.fromEntries(args);return action==='getWall'&&data.id===this.data.wallId||action==='listProblems'&&data.wallId===this.data.wallId},
  onCacheError(key,error){if(isReadRevoked(error))this.remoteProblems=[];pageReadError(this,error,{problems:[],wallName:''},true)},
  async onLoad(options, readOptions={}) {
    const wallId=options.wallId||''
    this.setData({wallId})
    const read=beginPageRead(this,{problems:[],wallName:''})
    if(!this._hasRead)this.remoteProblems=[]
    try {
      const [wall,problems]=await Promise.all([getWall(wallId,readOptions),listProblems({wallId},readOptions)])
      if(!read.current())return
      this.remoteProblems=problems
      read.success({wallName:wall.name})
      this.refresh()
    } catch(error) { if(read.current()&&isReadRevoked(error))this.remoteProblems=[];read.failure(error) }
    finally { read.finish() }
  },
  refresh(){
    const filter={wallId:this.data.wallId}
    if(this.data.angle!==null)filter.angle=this.data.angle
    if(this.data.grade!=='全部')filter.grade=this.data.grade
    this.setData({problems:browseProblems(this.remoteProblems||[],filter)})
  },
  selectAngle(e){const angleIndex=Number(e.detail.value);this.setData({angleIndex,angle:this.data.angles[angleIndex]},()=>this.refresh())},
  selectGrade(e){const gradeIndex=Number(e.detail.value);this.setData({gradeIndex,grade:this.data.grades[gradeIndex]},()=>this.refresh())},
  openProblem(e){wx.navigateTo({url:`/pages/problem/detail/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}&${routeContextQuery(this.data)}`})},
}))
