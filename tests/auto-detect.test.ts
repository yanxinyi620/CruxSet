import { describe, expect, it, vi } from 'vitest'
import { AUTO_DETECT_DEFAULTS, detectFromPixels } from '../web/src/auto-detect.js'

vi.mock('../web/src/preview-store.js', () => ({ PreviewStore: class { subscribe() {} } }))
vi.mock('../web/src/api.js', () => ({ LocalApiClient: class { currentUser() { return Promise.resolve(null) } } }))
const fakeRoot = { innerHTML: '', querySelector: () => ({ style: {}, classList: { toggle() {} }, set onclick(_: unknown) {} }), querySelectorAll: () => [] }
vi.stubGlobal('document', { querySelector: () => fakeRoot })
const { normalizeDetectRoi, resetDetectRoi, shouldReplaceDetectedHolds, createAutoDetectController } = await import('../web/src/main.js')

type Rgb = [number, number, number]

const BACKGROUND: Rgb = [200, 202, 210]

describe('draft detection ROI helpers', () => {
  it('normalizes ROI values to the image bounds', () => {
    expect(normalizeDetectRoi({ x: -0.2, y: 0.4, width: 2, height: Number.NaN })).toEqual({ x: 0, y: 0.4, width: 1, height: 0 })
  })
  it('resets ROI to the full image without sharing state', () => {
    const roi = resetDetectRoi()
    roi.x = 0.5
    expect(resetDetectRoi()).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
  it('only replaces existing annotations when detection has results', () => {
    expect(shouldReplaceDetectedHolds([])).toBe(false)
    expect(shouldReplaceDetectedHolds(undefined)).toBe(false)
    expect(shouldReplaceDetectedHolds([{ id: 'H001', x: 0, y: 0, radius: 0.02, kind: 'hold' }])).toBe(true)
  })
  it('replaces annotations only after a successful non-empty detection', async () => {
    const replaced: string[] = []
    const controller = createAutoDetectController(async () => [{ id: 'H002', x: 0, y: 0, radius: 0.02, kind: 'hold' }], holds => replaced.push(holds[0].id))
    await expect(controller.run()).resolves.toBe(true)
    expect(replaced).toEqual(['H002'])
  })
  it('keeps annotations when detection returns no results', async () => {
    const replace = vi.fn()
    const controller = createAutoDetectController(async () => [], replace)
    await expect(controller.run()).resolves.toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
  it('keeps annotations when detection throws', async () => {
    const replace = vi.fn()
    const controller = createAutoDetectController(async () => { throw new Error('camera failed') }, replace)
    await expect(controller.run()).resolves.toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
  it('rejects a repeated call while detection is processing', async () => {
    let resolve!: (value: never[]) => void
    const detect = vi.fn(() => new Promise<never[]>(r => { resolve = r }))
    const controller = createAutoDetectController(detect, vi.fn())
    const first = controller.run()
    await expect(controller.run()).resolves.toBe(false)
    expect(detect).toHaveBeenCalledTimes(1)
    resolve([])
    await expect(first).resolves.toBe(false)
  })
})

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
  it('uses the higher analysis resolution and pixel-based default filters', () => {
    expect(AUTO_DETECT_DEFAULTS.maxDim).toBe(1280)
    expect(AUTO_DETECT_DEFAULTS.minComponentPixels).toBeGreaterThan(0)
    expect(AUTO_DETECT_DEFAULTS.minSidePixels).toBeGreaterThan(0)
  })

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

  it('filters components below the default pixel minimum even when they pass the area ratio', () => {
    const data = makeImage(100, 100, [circle(50, 50, 2, [220, 60, 60])])
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
    expect(hold.bbox?.[0]).toBeCloseTo(0.54, 1)
    expect(hold.bbox?.[1]).toBeCloseTo(0.44, 1)
    expect(hold.bbox?.[2]).toBeCloseTo(0.67, 1)
    expect(hold.bbox?.[3]).toBeCloseTo(0.57, 1)
    expect(hold.radius).toBeCloseTo(0.06, 1)
    expect(hold.polygon?.some(([x, y]) => x < 0.6 && y < 0.5)).toBe(true)
    expect(hold.polygon?.some(([x, y]) => x > 0.6 && y > 0.5)).toBe(true)
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
    expect(detectFromPixels(200, 200, data, { minAreaRatio: 0.0001, minComponentPixels: 20 })).toHaveLength(1)
  })

  it('returns no detections for an invalid or zero-sized ROI', () => {
    const data = makeImage(100, 100, [circle(50, 50, 8, [220, 60, 60])])
    for (const roi of [
      { x: Number.NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 0, height: 1 },
      { x: 0.5, y: 0.5, width: 0.6, height: 0.5 },
    ]) {
      expect(detectFromPixels(100, 100, data, { roi })).toEqual([])
    }
  })

  it('uses the same area and side filters for full and cropped ROI input', () => {
    const data = makeImage(100, 100, [circle(60, 50, 4, [220, 60, 60])])
    const options = { roi: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 }, minAreaRatio: 0.01, minSideFraction: 0.1 }
    const fullImageResult = detectFromPixels(100, 100, data, options)
    const croppedResult = detectFromPixels(50, 50, cropPixels(data, 100, 50, 25, 50, 50), {
      ...options,
      roiAlreadyApplied: true,
    })
    expect(fullImageResult).toHaveLength(1)
    expect(croppedResult).toHaveLength(1)
    expect(croppedResult[0].kind).toBe(fullImageResult[0].kind)
  })

  it('can drop components touching the ROI boundary', () => {
    const data = makeImage(100, 100, [rectangle(50, 40, 8, 8, [220, 60, 60])])
    expect(detectFromPixels(100, 100, data, {
      roi: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 },
      minAreaRatio: 0,
      minComponentPixels: 10,
      dropBoundaryComponents: true,
    })).toEqual([])
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
