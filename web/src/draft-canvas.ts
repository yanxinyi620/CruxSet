import type { Hold, Point } from "../../miniprogram/domain/types.js"
import { clampTransform, screenToImage, zoomAroundAnchor } from "../../miniprogram/domain/transform.js"

export type DraftMode = 'add' | 'move' | 'delete'

export interface DraftCanvasOptions {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  holds: Hold[]
  mode: DraftMode
  selectedId: string | null
  onAddHold: (point: Point) => void
  onMoveStart: (holdId: string) => void
  onMoveHold: (holdId: string, point: Point) => void
  onMoveCandidate?: (candidateId: string, point: Point) => void
  onDeleteHold: (holdId: string) => void
  onSelectHold: (holdId: string | null) => void
  candidates?: Hold[]
  selectedCandidateId?: string | null
  onSelectCandidate?: (candidateId: string | null) => void
  onConfirmCandidate?: (candidateId: string) => void
  onDeleteCandidate?: (candidateId: string) => void
}

export const candidateStyle = (_selected: boolean) => ({ color: '#f59e0b', alpha: 0.55, dashed: true })

export const candidateHitTest = (point: Point, holds: Hold[], candidates: Hold[], tolerance = 0.05): Hold | null => {
  const hit = (items: Hold[]) => {
    let best: Hold | null = null
    let bestDistance = tolerance
    for (const hold of items) {
      const distance = Math.hypot(hold.x - point[0], hold.y - point[1])
      if (distance <= bestDistance) { bestDistance = distance; best = hold }
    }
    return best
  }
  return hit(candidates) ?? hit(holds)
}

export const moveCandidatePoint = (candidate: Hold, image: Point, dragOffset: Point, onMove: (point: Point) => void) => {
  onMove([clamp01(image[0] - dragOffset[0]), clamp01(image[1] - dragOffset[1])])
}

export const drawCandidateOverlay = (
  ctx: CanvasRenderingContext2D,
  candidate: Hold,
  toScreen: (point: Point) => Point,
  selected: boolean,
  scale: number,
) => {
  const trace = () => {
    ctx.beginPath()
    if (candidate.polygon && candidate.polygon.length >= 3) {
      candidate.polygon.forEach((p, i) => { const [sx, sy] = toScreen(p); if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy) })
      ctx.closePath()
    } else {
      const [sx, sy] = toScreen([candidate.x, candidate.y])
      ctx.arc(sx, sy, Math.max(2, candidate.radius * scale), 0, Math.PI * 2)
    }
  }
  const style = candidateStyle(selected)
  ctx.save()
  ctx.globalAlpha = style.alpha
  ctx.fillStyle = style.color
  trace()
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = style.alpha
  ctx.setLineDash([8, 5])
  trace()
  ctx.strokeStyle = style.color
  ctx.lineWidth = selected ? 4 : 3
  ctx.stroke()
  ctx.restore()
}

const NEON_HOLD = "#00e5ff"
const NEON_VOLUME = "#ff3bd4"
const NEON_SELECTED = "#ffffff"
const SNAP_PX = 20
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const clamp01 = (value: number) => clamp(value, 0, 1)

/** 草稿 Layout 岩点标注画布：添加、移动、删除、平移、滚轮/双指缩放。 */
export class DraftCanvasView {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private image?: HTMLImageElement
  private imageError = false
  private scale = 1
  private offsetX = 0
  private offsetY = 0
  private readonly aspect: number
  private readonly minScale: number
  private readonly maxScale: number
  private down = false
  private moved = false
  private downTime = 0
  private lastX = 0
  private lastY = 0
  private draggingId: string | null = null
  private dragOffsetX = 0
  private dragOffsetY = 0
  private pointers = new Map<number, { x: number; y: number }>()
  private pinch: { dist: number; scale: number } | null = null
  private pinchHappened = false

  constructor(private container: HTMLElement, private opts: DraftCanvasOptions) {
    this.canvas = document.createElement("canvas")
    this.canvas.className = "wall-canvas"
    this.container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext("2d")!

    this.aspect = opts.imageHeight / opts.imageWidth
    const width = Math.max(container.clientWidth || 360, 200)
    this.scale = this.minScale = width
    this.maxScale = width * 5
    this.canvas.width = Math.round(width)
    this.canvas.height = Math.round(width * this.aspect)
    this.canvas.style.width = width + "px"
    this.canvas.style.height = width * this.aspect + "px"
    this.canvas.style.touchAction = "none"
    this.offsetY = 0

    this.bindEvents()
    const img = new Image()
    img.onload = () => { this.image = img; this.redraw() }
    img.onerror = () => { this.imageError = true; this.redraw() }
    img.src = opts.imageUrl
  }

  private toImage(e: Pick<MouseEvent, 'clientX' | 'clientY'>): Point {
    const rect = this.canvas.getBoundingClientRect()
    return screenToImage([e.clientX - rect.left, e.clientY - rect.top], { scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY })
  }

  private hitTest(point: Point): Hold | null {
    const tolerance = SNAP_PX / this.scale
    return candidateHitTest(point, this.opts.holds, this.opts.candidates ?? [], tolerance)
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
      const image = this.toImage(e)
      const hit = this.hitTest(image)
      this.draggingId = null
      if (hit && this.opts.mode === 'move') {
        this.draggingId = hit.id
        this.dragOffsetX = image[0] - hit.x
        this.dragOffsetY = image[1] - hit.y
        this.opts.onMoveStart(hit.id)
      }
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
      if (this.draggingId) {
        const image = this.toImage(e)
        const isCandidate = (this.opts.candidates ?? []).some(candidate => candidate.id === this.draggingId)
        if (isCandidate) this.opts.onMoveCandidate?.(this.draggingId, [clamp01(image[0] - this.dragOffsetX), clamp01(image[1] - this.dragOffsetY)])
        else this.opts.onMoveHold(this.draggingId, [clamp01(image[0] - this.dragOffsetX), clamp01(image[1] - this.dragOffsetY)])
        return
      }
      this.offsetX += dx
      this.offsetY += dy
      this.applyTransform(clampTransform({ scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY }, this.canvas.width, this.canvas.height, 1, this.aspect))
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
          this.draggingId = null
        }
        return
      }
      if (this.pointers.size === 0) {
        const wasPinch = this.pinchHappened
        const wasDown = this.down
        this.down = false
        this.draggingId = null
        this.pinchHappened = false
        if (!wasDown || wasPinch) return
        if (this.moved) return
        if (Date.now() - this.downTime > 300) return
        const image = this.toImage(e)
        const hit = this.hitTest(image)
        if (hit) {
          const isCandidate = (this.opts.candidates ?? []).some(candidate => candidate.id === hit.id)
          if (isCandidate && this.opts.mode === 'delete') this.opts.onDeleteCandidate?.(hit.id)
          else if (isCandidate) this.opts.onSelectCandidate?.(hit.id)
          else if (this.opts.mode === 'delete') this.opts.onDeleteHold(hit.id)
          else this.opts.onSelectHold(hit.id)
          return
        }
        if (this.opts.mode === 'add') this.opts.onAddHold([clamp01(image[0]), clamp01(image[1])])
      }
    }
    this.canvas.addEventListener("pointerup", up)
    this.canvas.addEventListener("pointercancel", up)
    this.canvas.addEventListener("dblclick", (e) => {
      const hit = this.hitTest(this.toImage(e))
      if (hit && (this.opts.candidates ?? []).some(candidate => candidate.id === hit.id)) this.opts.onConfirmCandidate?.(hit.id)
    })
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

  private applyTransform(next: { scale: number; offsetX: number; offsetY: number }) {
    this.scale = next.scale
    this.offsetX = next.offsetX
    this.offsetY = next.offsetY
  }

  setState(holds: Hold[], mode: DraftMode, selectedId: string | null, candidates: Hold[] = this.opts.candidates ?? [], selectedCandidateId = this.opts.selectedCandidateId ?? null) {
    this.opts.holds = holds
    this.opts.mode = mode
    this.opts.selectedId = selectedId
    this.opts.candidates = candidates
    this.opts.selectedCandidateId = selectedCandidateId
    this.redraw()
  }

  toScreen(point: Point): Point {
    return [point[0] * this.scale + this.offsetX, point[1] * this.scale + this.offsetY]
  }

  redraw() {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#f2f2fa"
    ctx.fillRect(0, 0, w, h)

    if (this.image) {
      ctx.drawImage(this.image, this.offsetX, this.offsetY, this.scale, this.scale * this.aspect)
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
      const selected = hold.id === this.opts.selectedId
      const color = selected ? NEON_SELECTED : hold.kind === 'volume' ? NEON_VOLUME : NEON_HOLD
      const trace = () => {
        ctx.beginPath()
        if (hold.polygon && hold.polygon.length >= 3) {
          hold.polygon.forEach((p, i) => {
            const [sx, sy] = this.toScreen(p)
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
          })
          ctx.closePath()
        } else {
          const [sx, sy] = this.toScreen([hold.x, hold.y])
          ctx.arc(sx, sy, Math.max(2, hold.radius * this.scale), 0, Math.PI * 2)
        }
      }
      ctx.save()
      ctx.globalAlpha = 0.1
      trace()
      ctx.fillStyle = color
      ctx.fill()
      ctx.restore()
      trace()
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = selected ? 5 : 4
      ctx.shadowColor = color
      ctx.shadowBlur = selected ? 14 : 9
      ctx.stroke()
      ctx.restore()
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = selected ? 2 : 1.5
      ctx.stroke()
      ctx.restore()
    }
    for (const candidate of this.opts.candidates ?? []) {
      drawCandidateOverlay(ctx, candidate, point => this.toScreen(point), candidate.id === this.opts.selectedCandidateId, this.scale)
    }
  }

  destroy() {
    this.canvas.remove()
  }
}
