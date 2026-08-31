import type { Hold, HoldRole, Point, ViewTransform } from "../../miniprogram/domain/types.js"
import { clampTransform, screenToImage, zoomAroundAnchor } from "../../miniprogram/domain/transform.js"
import { circleHitTest, nearestHold, polygonHitTest } from "../../miniprogram/domain/geometry.js"

/** 统一角色配色：Start 绿、Foot 黄、Hand 蓝、Assist 橙、Finish 紫。 */
export const ROLE_COLORS: Record<HoldRole, string> = {
  start: "#3fb96a",
  foot: "#f0c24b",
  hand: "#3f7bd9",
  assist: "#f08e63",
  finish: "#8f5fd9",
}
const NEUTRAL = "#c6c8e0"
const NEUTRAL_EDGE = "#a9accc"
const SNAP_PX = 20

export interface WallCanvasOptions {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  polygonCoordinates?: 'normalized' | 'pixels'
  viewportHeight?: number
  initialTransform?: ViewTransform
  fitContain?: boolean
  dimImage?: boolean
  holds: Hold[]
  getAssignments: () => Record<HoldRole, readonly string[]>
  getSelectedRole: () => HoldRole | null
  onTapHold: (holdId: string) => void
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const wallHoldAt = (point: Point, holds: Hold[], tolerance: number) => holds.find(hold => hold.polygon?.length ? polygonHitTest(point, hold) : circleHitTest(point, hold)) ?? nearestHold(point, holds, tolerance)
export const imageUrlFor = (imageFileId: string) => /^(https?:\/\/|\/)/.test(imageFileId) ? imageFileId : `/api/v1/media/${encodeURIComponent(imageFileId)}`
export const projectHoldPoint = (point: Point, scale: number, imageWidth: number, pixels = false): Point => [point[0] * scale / (pixels ? imageWidth : 1), point[1] * scale / (pixels ? imageWidth : 1)]

export class WallCanvasView {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private image?: HTMLImageElement
  private imageError = false
  private scale = 1
  private offsetX = 0
  private offsetY = 0
  private readonly aspect: number
  private readonly viewportWidth: number
  private readonly viewportHeight: number
  private readonly minScale: number
  private readonly maxScale: number
  private down = false
  private moved = false
  private downTime = 0
  private lastX = 0
  private lastY = 0
  private pointers = new Map<number, { x: number; y: number }>()
  private pinch: { dist: number; scale: number } | null = null
  private pinchHappened = false

  constructor(private container: HTMLElement, private opts: WallCanvasOptions) {
    this.canvas = document.createElement("canvas")
    this.canvas.className = "wall-canvas"
    this.container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext("2d")!

    this.aspect = opts.imageHeight / opts.imageWidth
    const width = Math.max(container.clientWidth || 360, 200)
    const canvasHeight = Math.round(opts.viewportHeight ?? width * this.aspect)
    const dpr = Math.max(window.devicePixelRatio || 1, 1)
    this.viewportWidth = width
    this.viewportHeight = canvasHeight
    const fitScale = opts.fitContain ? Math.min(width, canvasHeight / this.aspect) : canvasHeight / this.aspect
    this.scale = this.minScale = fitScale
    this.maxScale = width * 5
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(canvasHeight * dpr)
    this.canvas.style.width = width + "px"
    this.canvas.style.height = canvasHeight + "px"
    this.canvas.style.touchAction = "none"
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.offsetX = (width - fitScale) / 2
    this.offsetY = (canvasHeight - fitScale * this.aspect) / 2
    if (opts.initialTransform) this.applyTransform(opts.initialTransform)

    this.bindEvents()
    const img = new Image()
    img.onload = () => { this.image = img; this.redraw() }
    img.onerror = () => { this.imageError = true; this.redraw() }
    img.src = imageUrlFor(opts.imageUrl)
  }

  private updatePinch() {
    const [a, b] = [...this.pointers.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const rect = this.canvas.getBoundingClientRect()
    const anchor: Point = [(a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top]
    const factor = dist / this.pinch!.dist
    const nextScale = clamp(this.pinch!.scale * factor, this.minScale * 0.6, this.maxScale)
    this.applyTransform(zoomAroundAnchor({ scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY }, nextScale, anchor))
    this.redraw()
  }

  private bindEvents() {
    this.canvas.addEventListener("pointerdown", (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.canvas.setPointerCapture(e.pointerId)
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale }
        this.pinchHappened = false
        return
      }
      if (this.pointers.size > 2) return
      this.down = true
      this.moved = false
      this.downTime = Date.now()
      this.lastX = e.clientX
      this.lastY = e.clientY
    })
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.pinch) { this.pinchHappened = true; this.updatePinch(); return }
      if (!this.down) return
      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY
      this.lastX = e.clientX
      this.lastY = e.clientY
      if (Math.hypot(dx, dy) > 2) this.moved = true
      this.offsetX += dx
      this.offsetY += dy
      this.clampTransform()
      this.redraw()
    })
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
      if (this.pinch) {
        this.pinch = null
        this.pinchHappened = true
        if (this.pointers.size === 1) {
          const [rest] = [...this.pointers.values()]
          this.down = true
          this.moved = false
          this.downTime = Date.now()
          this.lastX = rest.x
          this.lastY = rest.y
        }
        return
      }
      if (this.pointers.size === 0) {
        const wasPinch = this.pinchHappened
        const wasDown = this.down
        this.down = false
        this.pinchHappened = false
        if (!wasDown || wasPinch) return
        const elapsed = Date.now() - this.downTime
        if (!this.moved && elapsed <= 300) {
          const rect = this.canvas.getBoundingClientRect()
          this.tap(e.clientX - rect.left, e.clientY - rect.top)
        }
      }
    }
    this.canvas.addEventListener("pointerup", up)
    this.canvas.addEventListener("pointercancel", up)
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault()
      const rect = this.canvas.getBoundingClientRect()
      const anchor: Point = [e.clientX - rect.left, e.clientY - rect.top]
      const factor = Math.exp(-e.deltaY * 0.001)
      const nextScale = clamp(this.scale * factor, this.minScale * 0.6, this.maxScale)
      this.applyTransform(zoomAroundAnchor({ scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY }, nextScale, anchor))
      this.redraw()
    }, { passive: false })
  }

  private applyTransform(next: ViewTransform) {
    this.scale = next.scale
    this.offsetX = next.offsetX
    this.offsetY = next.offsetY
  }

  private clampTransform() {
    this.applyTransform(clampTransform({ scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY }, this.viewportWidth, this.viewportHeight, 1, this.aspect))
  }

  private tap(screenX: number, screenY: number) {
    const point = screenToImage([screenX, screenY], { scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY })
    const normalizedPoint: Point = [point[0], point[1] / this.aspect]
    const polygonPoint: Point = this.opts.polygonCoordinates === 'pixels' ? [point[0] * this.opts.imageWidth, point[1] * this.opts.imageWidth] : normalizedPoint
    const hold = this.opts.holds.find(item => item.polygon?.length ? polygonHitTest(polygonPoint, item) : circleHitTest(normalizedPoint, item)) ?? nearestHold(normalizedPoint, this.opts.holds.filter(item => !item.polygon?.length), SNAP_PX / this.scale)
    if (hold) this.opts.onTapHold(hold.id)
  }

  private roleOf(holdId: string): HoldRole | null {
    const assignments = this.opts.getAssignments()
    for (const role of Object.keys(assignments) as HoldRole[]) {
      if (assignments[role].includes(holdId)) return role
    }
    return null
  }

  toScreen(point: Point, pixels = false): Point {
    const [x, y] = projectHoldPoint(point, this.scale, this.opts.imageWidth, pixels)
    const screenY = pixels ? y : y * this.aspect
    return [x + this.offsetX, screenY + this.offsetY]
  }

  redraw() {
    const ctx = this.ctx
    const w = this.viewportWidth
    const h = this.viewportHeight
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#f2f2fa"
    ctx.fillRect(0, 0, w, h)

    if (this.image) {
      ctx.drawImage(this.image, this.offsetX, this.offsetY, this.scale, this.scale * this.aspect)
      if (this.opts.dimImage) {
        ctx.fillStyle = "rgba(8,12,24,.10)"
        ctx.fillRect(this.offsetX, this.offsetY, this.scale, this.scale * this.aspect)
      }
    } else if (this.imageError) {
      ctx.fillStyle = "#e6e3f5"
      ctx.font = "14px sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("墙图加载失败", w / 2, h / 2)
    } else {
      ctx.fillStyle = "#e9e7f7"
      ctx.font = "14px sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("加载墙图中…", w / 2, h / 2)
    }

    for (const hold of this.opts.holds) {
      const role = this.roleOf(hold.id)
      ctx.beginPath()
      if (hold.polygon && hold.polygon.length >= 3) {
        hold.polygon.forEach((point, index) => { const [x, y] = this.toScreen(point, this.opts.polygonCoordinates === 'pixels'); if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
        ctx.closePath()
      } else {
        const [sx, sy] = this.toScreen([hold.x, hold.y])
        ctx.arc(sx, sy, hold.radius * this.scale, 0, Math.PI * 2)
      }
      if (hold.polygon?.length) {
        // Polygon interiors remain transparent so the original wall texture stays visible.
      } else {
        ctx.fillStyle = role ? ROLE_COLORS[role] : NEUTRAL
        ctx.fill()
      }
      if (role) {
        ctx.lineWidth = 5
        ctx.strokeStyle = "#ffffff"
        ctx.stroke()
        ctx.lineWidth = 2
        ctx.strokeStyle = ROLE_COLORS[role]
        ctx.stroke()
      } else {
        ctx.lineWidth = 1
        ctx.strokeStyle = hold.polygon?.length ? "rgba(255,255,255,0)" : NEUTRAL_EDGE
        ctx.stroke()
      }
    }
  }

  destroy() {
    this.canvas.remove()
  }

  getTransform(): ViewTransform { return { scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY } }
  toDataURL(): string { return this.canvas.toDataURL("image/png") }
}
