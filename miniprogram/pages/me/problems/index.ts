// @ts-nocheck
import { deleteProblem, listMyProblems } from '../../../services/problems.js'
Page({data:{problems:[]},onShow(){this.reload()},reload(){listMyProblems().then(problems=>this.setData({problems}))},open(e){wx.navigateTo({url:`/pages/problem/detail/index?id=${e.currentTarget.dataset.id}`})},remove(e){wx.showModal({title:'删除线路？',content:'此操作不可恢复。',success:r=>r.confirm&&deleteProblem(e.currentTarget.dataset.id).then(()=>this.reload())})}})
