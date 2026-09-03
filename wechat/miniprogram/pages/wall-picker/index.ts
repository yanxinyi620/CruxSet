// @ts-nocheck
import { listWalls } from '../../services/walls.js'
Page({data:{items:[],mode:'browse'},async onLoad(options){this.setData({items:(await listWalls()).filter(wall=>wall.visibility==='public'&&wall.holds.length>=2),mode:options.mode||'browse'})},choose(event){const wallId=event.currentTarget.dataset.wallId;wx.navigateTo({url:this.data.mode==='create'?`/pages/problem/editor/index?wallId=${wallId}`:`/pages/wall/index?wallId=${wallId}`})}})
