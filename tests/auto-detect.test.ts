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

const rectangle = (cx: number, cy: number, halfWidth: number, halfHeight: number, color: Rgb) =>
  (x: number, y: number): Rgb | null => Math.abs(x - cx) <= halfWidth && Math.abs(y - cy) <= halfHeight ? color : null

const cropPixels = (data: Uint8ClampedArray, imageWidth: number, x: number, y: number, width: number, height: number) => {
  const cropped = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    const sourceStart = ((y + row) * imageWidth + x) * 4
    cropped.set(data.subarray(sourceStart, sourceStart + width * 4), row * width * 4)
  }
  return cropped
}

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

  it('maps detections from an ROI back to full-image coordinates', () => {
    const data = makeImage(100, 100, [circle(60, 50, 6, [220, 60, 60])])
    const [hold] = detectFromPixels(100, 100, data, {
      roi: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 },
      minComponentPixels: 10,
    })
    expect(hold.x).toBeCloseTo(0.6, 1)
    expect(hold.y).toBeCloseTo(0.5, 1)
    expect(hold.bbox).toEqual(expect.arrayContaining([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)]))
    expect(hold.polygon?.every(([x, y]) => x >= 0.5 && x <= 1 && y >= 0.25 && y <= 0.75)).toBe(true)
  })

  it('ignores foreground outside the ROI when given a full image', () => {
    const data = makeImage(100, 100, [
      circle(20, 20, 6, [220, 60, 60]),
      circle(60, 50, 6, [60, 120, 220]),
    ])
    const holds = detectFromPixels(100, 100, data, {
      roi: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 },
      minComponentPixels: 10,
    })
    expect(holds).toHaveLength(1)
    expect(holds[0].x).toBeCloseTo(0.6, 1)
    expect(holds[0].y).toBeCloseTo(0.5, 1)
  })

  it('uses equivalent width and height for normalized radius', () => {
    const data = makeImage(200, 100, [rectangle(100, 50, 20, 10, [220, 60, 60])])
    const [hold] = detectFromPixels(200, 100, data, { minComponentPixels: 20 })
    expect(hold.radius).toBeCloseTo(0.1, 1)
  })

  it('retains a component that meets the pixel threshold despite a small area ratio', () => {
    const data = makeImage(200, 200, [circle(100, 100, 4, [220, 60, 60])])
    expect(detectFromPixels(200, 200, data, { minAreaRatio: 0.01, minComponentPixels: 20 })).toHaveLength(1)
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
