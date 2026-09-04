// @ts-nocheck
import { demoWall } from '../../data/demo.js'
import { demoProblems } from '../../data/demo-problems.js'
import { browseProblems } from '../../domain/browse.js'
import { listProblems } from '../../services/problems.js'
import { getWall } from '../../services/walls.js'
const grades = ['全部', ...Array.from({ length: 13 }, (_, i) => `V${i}`)]
Page({ data: { wallId:'wall_demo', wallName:demoWall.name, angles:[null,20,25,30,35,40,45], grades, angle:null, grade:'全部', problems:[] }, onLoad(options) { const wallId=options.wallId||'wall_demo'; this.setData({wallId}); Promise.all([getWall(wallId),listProblems({wallId})]).then(([wall,problems])=>{this.remoteProblems=problems;this.setData({wallName:wall.name,angles:[null,...wall.angleOptions]});this.refresh()}).catch(()=>{this.remoteProblems=demoProblems;this.refresh()}) }, refresh(){const filter={wallId:this.data.wallId};if(this.data.angle!==null)filter.angle=this.data.angle;if(this.data.grade!=='全部')filter.grade=this.data.grade;this.setData({problems:browseProblems(this.remoteProblems||[],filter)})}, selectAngle(e){this.setData({angle:e.currentTarget.dataset.value},()=>this.refresh())}, selectGrade(e){this.setData({grade:e.currentTarget.dataset.value},()=>this.refresh())}, openProblem(e){wx.navigateTo({url:`/pages/problem/detail/index?id=${e.currentTarget.dataset.id}`})} })
