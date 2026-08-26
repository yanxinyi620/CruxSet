// @ts-nocheck
import { demoLayout } from '../../../src/data/demo.js'
import { demoProblems } from '../../../src/data/demo-problems.js'
import { browseProblems } from '../../../src/domain/browse.js'
import { RandomSession } from '../../../src/domain/random.js'
import { getLayout } from '../../services/layouts.js'
import { listProblems } from '../../services/problems.js'
let randomSession
Page({data:{wallName:'日坛 Spraywall',layoutName:'2026-08 Layout',layout:demoLayout,angles:[20,25,30,35,40,45],grades:['全部','V0','V1','V2','V3','V4','V5','V6'],angle:35,grade:'V4',query:'',problems:[]},onLoad(){this.refresh();getLayout('layout_demo').then(layout=>this.setData({layout,layoutName:layout.name})).catch(()=>{});listProblems({wallId:'wall_demo',layoutId:'layout_demo'}).then(problems=>{this.remoteProblems=problems;this.refresh()}).catch(()=>{})},refresh(){const source=this.remoteProblems||demoProblems;const problems=browseProblems(source,{wallId:'wall_demo',layoutId:'layout_demo',angle:this.data.angle,grade:this.data.grade},this.data.query);randomSession=new RandomSession(problems);this.setData({problems})},selectAngle(e){this.setData({angle:e.currentTarget.dataset.value},()=>this.refresh())},selectGrade(e){this.setData({grade:e.currentTarget.dataset.value},()=>this.refresh())},setQuery(e){this.setData({query:e.detail.value},()=>this.refresh())},openProblem(e){wx.navigateTo({url:`/pages/problem/detail/index?id=${e.currentTarget.dataset.id}`})},randomProblem(){if(this.data.problems.length){const problem=randomSession.next();wx.navigateTo({url:`/pages/problem/detail/index?id=${problem.id}`})}},createProblem(){wx.navigateTo({url:'/pages/problem/editor/index?wallId=wall_demo&layoutId=layout_demo'})}})
