// @ts-nocheck
import { getWall } from '../../services/walls.js'
Page({ data: { wallId: '', wallName: '', wall: null, loading: true, error: '' }, onLoad(options) { const wallId = options.wallId || ''; this.setData({ wallId }); getWall(wallId).then(wall => this.setData({ wall, wallName: wall.name })).catch(error => this.setData({ error: error.message || '墙面加载失败，请稍后重试' })).finally(() => this.setData({ loading: false })) }, openRouteBrowser() { if (this.data.wall) wx.navigateTo({ url: `/pages/route-browser/index?wallId=${this.data.wallId}` }) } })
