// @ts-nocheck
import { demoProblems } from '../../../../src/data/demo-problems.js'
Page({data:{problem:null,previous:null,next:null},onLoad(options){const index=demoProblems.findIndex(p=>p.id===options.id);const problem=demoProblems[index<0?0:index];this.setData({problem,previous:demoProblems[index-1],next:demoProblems[index+1]})},open(e){wx.redirectTo({url:`/pages/problem/detail/index?id=${e.currentTarget.dataset.id}`})},onShareAppMessage(){return{title:`${this.data.problem.number} · ${this.data.problem.name}`,path:`/pages/problem/detail/index?id=${this.data.problem.id}`}}})
