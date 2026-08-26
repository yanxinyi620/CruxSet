// 微信原生 Component 的动态 this 类型由开发者工具注入；领域模块保持严格类型。
// @ts-nocheck
import type { Hold, Layout } from '../../../src/domain/types.js'
import { circleHitTest, nearestHold } from '../../../src/domain/geometry.js'
import { imageToScreen, screenToImage } from '../../../src/domain/transform.js'
import { GestureController } from '../../../src/domain/gesture.js'

Component({ properties: { layout: { type: Object, value: null } }, data: { transform: { scale: 1, offsetX: 0, offsetY: 0 } }, methods: {
  onReady() { this.render() },
  render() { const query = wx.createSelectorQuery().in(this); query.select('#wallCanvas').fields({ node: true, size: true }).exec((result) => { const canvas = result[0]?.node; const layout = this.properties.layout as Layout | null; if (!canvas || !layout) return; const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, result[0].width, result[0].height); for (const hold of layout.holds) { const [x, y] = imageToScreen([hold.x * layout.imageWidth, hold.y * layout.imageHeight], this.data.transform); ctx.beginPath(); ctx.arc(x, y, Math.max(8, hold.radius * layout.imageWidth * this.data.transform.scale), 0, Math.PI * 2); ctx.fillStyle = hold.kind === 'volume' ? '#ef8f39' : '#316eea'; ctx.fill() } }) },
  onTouchStart(e: WechatMiniprogram.TouchEvent) { this.gesture = new GestureController(this.data.transform); this.gesture.start(e.touches.map(t => ({ x: t.x, y: t.y })), Date.now()) },
  onTouchMove(e: WechatMiniprogram.TouchEvent) { if (!this.gesture) return; const result = this.gesture.move(e.touches.map(t => ({ x: t.x, y: t.y })), Date.now()); if (result.kind !== 'tap') { this.setData({ transform: result.transform }); this.render() } },
  onTouchEnd() { this.gesture?.end() },
  hitTest(x: number, y: number): Hold | undefined { const layout = this.properties.layout as Layout; const image = screenToImage([x, y], this.data.transform); const direct = layout.holds.find(h => circleHitTest([image[0] / layout.imageWidth, image[1] / layout.imageHeight], h)); return direct ?? nearestHold([image[0] / layout.imageWidth, image[1] / layout.imageHeight], layout.holds, 24 / this.data.transform.scale / layout.imageWidth) }
} })
