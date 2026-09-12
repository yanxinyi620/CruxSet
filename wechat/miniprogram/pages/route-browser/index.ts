// @ts-nocheck
import { browseProblems, routeContextQuery } from '../../domain/browse.js'
import { listProblems } from '../../services/problems.js'
import { getWall } from '../../services/walls.js'
const grades = ['全部', ...Array.from({ length: 17 }, (_, i) => `V${i}`)]
const routeAngles = Array.from({ length: 15 }, (_, i) => i * 5)
Page({
  data: { wallId:'', wallName:'', angles:[null,...routeAngles], angleLabels:['全部',...routeAngles.map(angle=>`${angle}°`)], angleIndex:0, gradeIndex:0, grades, angle:null, grade:'全部', problems:[], loading:true, error:'' },
  async onLoad(options) {
    const wallId=options.wallId||''
    this.setData({wallId})
    try {
      const [wall,problems]=await Promise.all([getWall(wallId),listProblems({wallId})])
      this.remoteProblems=problems
      this.setData({wallName:wall.name,error:''})
      this.refresh()
    } catch(error) { this.setData({problems:[],error:error.message||'线路加载失败，请稍后重试'}) }
    finally { this.setData({loading:false}) }
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
})
