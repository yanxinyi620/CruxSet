import { describe, expect, it } from 'vitest'
import { detectFromPixels } from '../web/src/auto-detect.js'

type Rgb = [number, number, number]

const BACKGROUND: Rgb = [200, 202, 210]

/** 在 (w×h) 画布上叠加若干绘制函数（返回颜色或 null），生成 RGBA 像素。 */
const makeImage = (w: number, h: number, draws: ((x: number, y: number) => Rgb | null)[]): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let color: Rgb | null = null
      for (const draw of draws) { const c = draw(x, y); if (c) { color = c; break } }
      const i = (y * w + x) * 4
      const [r, g, b] = color ?? BACKGROUND
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  return data
}

const circle = (cx: number, cy: number, r: number, color: Rgb) => (x: number, y: number): Rgb | null =>
  (x - cx) ** 2 + (y - cy) ** 2 <= r * r ? color : null

describe('auto hold/volume detection', () => {
  it('returns nothing for a plain wall background', () => {
    const data = makeImage(100, 100, [])
    expect(detectFromPixels(100, 100, data)).toEqual([])
  })

  it('detects a small hold and classifies it as hold', () => {
    const data = makeImage(100, 100, [circle(30, 40, 3, [220, 60, 60])])
    const holds = detectFromPixels(100, 100, data)
    expect(holds).toHaveLength(1)
    expect(holds[0].kind).toBe('hold')
    expect(holds[0].x).toBeCloseTo(0.3, 1)
    expect(holds[0].y).toBeCloseTo(0.4, 1)
    expect(holds[0].radius).toBeGreaterThan(0.015)
    expect(holds[0].radius).toBeLessThan(0.04)
  })

  it('detects a large block and classifies it as volume', () => {
    const data = makeImage(100, 100, [circle(70, 70, 9, [60, 120, 220])])
    const holds = detectFromPixels(100, 100, data)
    expect(holds).toHaveLength(1)
    expect(holds[0].kind).toBe('volume')
    expect(holds[0].radius).toBeGreaterThanOrEqual(0.04)
  })

  it('detects mixed holds and volumes with stable ids sorted top-to-bottom', () => {
    const data = makeImage(100, 100, [circle(20, 20, 3, [220, 60, 60]), circle(70, 70, 9, [60, 120, 220])])
    const holds = detectFromPixels(100, 100, data)
    expect(holds).toHaveLength(2)
    expect(holds[0].id).toBe('H001')
    expect(holds[0].kind).toBe('hold')
    expect(holds[0].y).toBeLessThan(holds[1].y)
    expect(holds[1].id).toBe('H002')
    expect(holds[1].kind).toBe('volume')
  })

  it('ignores tiny specks below the minimum area', () => {
    const data = makeImage(100, 100, [circle(50, 50, 1, [220, 60, 60])])
    expect(detectFromPixels(100, 100, data)).toEqual([])
  })
})

it('produces an edge contour (polygon) tracing the hold boundary', () => {
  const data = makeImage(100, 100, [circle(50, 50, 6, [60, 120, 220])])
  const [hold] = detectFromPixels(100, 100, data)
  expect(hold.polygon).toBeDefined()
  const points = hold.polygon!
  expect(points.length).toBeGreaterThanOrEqual(3)
  for (const [px, py] of points) {
    const distance = Math.hypot((px - 0.5) * 100, (py - 0.5) * 100)
    expect(distance).toBeGreaterThan(3)
    expect(distance).toBeLessThan(9)
  }
})
