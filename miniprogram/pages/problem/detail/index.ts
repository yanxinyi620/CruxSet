// @ts-nocheck
import { demoProblems } from '../../../../src/data/demo-problems.js'
import { getProblem } from '../../../services/problems.js'
Page({data:{problem:null,previous:null,next:null},onLoad(options){const load=(problems)=>{const index=problems.findIndex(p=>p.id===options.id);const selected=problems[index<0?0:index];this.setData({problem:selected,previous:problems[index-1],next:problems[index+1]})};getProblem(options.id).then(problem=>this.setData({problem})).catch(()=>load(demoProblems))},open(e){wx.redirectTo({url:`/pages/problem/detail/index?id=${e.currentTarget.dataset.id}`})},onShareAppMessage(){return{title:`${this.data.problem.number} · ${this.data.problem.name}`,path:`/pages/problem/detail/index?id=${this.data.problem.id}`}}})
