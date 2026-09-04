// @ts-nocheck
import { demoWall } from '../../data/demo.js'
import { getWall } from '../../services/walls.js'
Page({ data: { wallId: 'wall_demo', wallName: demoWall.name, wall: demoWall }, onLoad(options) { const wallId = options.wallId || 'wall_demo'; this.setData({ wallId }); getWall(wallId).then(wall => this.setData({ wall, wallName: wall.name })).catch(() => {}) }, openRouteBrowser() { wx.navigateTo({ url: `/pages/route-browser/index?wallId=${this.data.wallId}` }) } })
