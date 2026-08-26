// @ts-nocheck
import { demoLayout } from '../../../src/data/demo.js'
Page({data:{wallName:'日坛 Spraywall',layoutName:'2026-08 Layout',layout:demoLayout,angles:[20,25,30,35,40,45],grades:['全部','V0','V1','V2','V3','V4','V5','V6'],angle:35,grade:'V4',query:'',problems:[]},selectAngle(e){this.setData({angle:e.currentTarget.dataset.value})},selectGrade(e){this.setData({grade:e.currentTarget.dataset.value})},setQuery(e){this.setData({query:e.detail.value})},createProblem(){wx.navigateTo({url:'/pages/problem/editor/index?wallId=wall_demo&layoutId=layout_demo'})}})
