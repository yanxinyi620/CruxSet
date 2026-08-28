import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { describe, expect, it, vi } from 'vitest'
import { AUTO_DETECT_DEFAULTS, DETECT_ROI_FALLBACK_MESSAGE, detectFromPixels } from '../web/src/auto-detect.js'
import { RITAN_SPRAYWALL_FIXTURE, RITAN_SPRAYWALL_FIXTURE_METADATA } from './fixtures/ritan-spraywall-rgba.js'

vi.mock('../web/src/preview-store.js', () => ({ PreviewStore: class { subscribe() {} } }))
vi.mock('../web/src/api.js', () => ({ LocalApiClient: class { currentUser() { return Promise.resolve(null) } } }))
const fakeRoot = { innerHTML: '', querySelector: () => ({ style: {}, classList: { toggle() {} }, set onclick(_: unknown) {} }), querySelectorAll: () => [] }
vi.stubGlobal('document', { querySelector: () => fakeRoot })
const { normalizeDetectRoi, resetDetectRoi, shouldReplaceDetectedHolds, createAutoDetectController, detectRoiValidationMessage } = await import('../web/src/main.js')

type Rgb = [number, number, number]

const BACKGROUND: Rgb = [200, 202, 210]

describe('draft detection ROI helpers', () => {
  it('normalizes ROI values to the image bounds', () => {
    expect(normalizeDetectRoi({ x: -0.2, y: 0.4, width: 2, height: Number.NaN })).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
  it('falls back to the full image and exposes a validation message for invalid ROI', () => {
    expect(normalizeDetectRoi({ x: 0.8, y: 0.8, width: 0.5, height: 0.5 })).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(detectRoiValidationMessage({ x: 0.8, y: 0.8, width: 0.5, height: 0.5 })).toBe('识别区域无效，已回退整图')
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
  it('does not replace or notify after the draft context is cancelled', async () => {
    let resolve!: (value: any[]) => void
    let active = true
    const replace = vi.fn()
    const notify = vi.fn()
    const controller = createAutoDetectController(
      () => new Promise<any[]>(r => { resolve = r }),
      replace,
      () => active,
      notify,
    )
    const run = controller.run()
    active = false
    controller.cancel()
    resolve([{ id: 'H003', x: 0, y: 0, radius: 0.02, kind: 'hold' }])
    await expect(run).resolves.toBe(false)
    expect(replace).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
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

  it('keeps morphology enabled by default and can disable or repeat the opening', () => {
    expect(AUTO_DETECT_DEFAULTS.morphology).toEqual({ enabled: true, iterations: 1 })
    const data = makeImage(80, 80, [rectangle(40, 40, 5, 5, [220, 60, 60])])
    expect(detectFromPixels(80, 80, data, { morphology: { enabled: false } })).toHaveLength(1)
    expect(detectFromPixels(80, 80, data, { morphology: { enabled: true, iterations: 2 } })).toHaveLength(1)
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
      expect(detectFromPixels(100, 100, data, { roi })).toEqual(detectFromPixels(100, 100, data))
    }
  })

  it('observes the invalid ROI fallback through the public message constant', () => {
    const data = makeImage(100, 100, [circle(50, 50, 8, [220, 60, 60])])
    expect(detectFromPixels(100, 100, data, { roi: { x: Number.NaN, y: 0, width: 1, height: 1 } })).toHaveLength(1)
    expect(DETECT_ROI_FALLBACK_MESSAGE).toBe('识别区域无效，已回退整图')
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

it('regresses against real Ritan spraywall pixels without detections outside the wall ROI', () => {
  const { width, height, data } = RITAN_SPRAYWALL_FIXTURE
  const roi = { x: 0.1, y: 0.15, width: 0.8, height: 0.72 }
  const holds = detectFromPixels(width, height, data, { roi })

  expect(holds.length).toBeGreaterThanOrEqual(10)
  for (const hold of holds) {
    expect(hold.x).toBeGreaterThanOrEqual(roi.x)
    expect(hold.x).toBeLessThan(roi.x + roi.width)
    expect(hold.y).toBeGreaterThanOrEqual(roi.y)
    expect(hold.y).toBeLessThan(roi.y + roi.height)
    expect(hold.radius).toBeGreaterThan(0)
    expect(hold.radius).toBeLessThan(1)
    expect(hold.bbox).toBeDefined()
    expect(hold.bbox![0]).toBeGreaterThanOrEqual(roi.x)
    expect(hold.bbox![1]).toBeGreaterThanOrEqual(roi.y)
    expect(hold.bbox![2]).toBeLessThanOrEqual(roi.x + roi.width)
    expect(hold.bbox![3]).toBeLessThanOrEqual(roi.y + roi.height)
    for (const [x, y] of hold.polygon ?? []) {
      expect(x).toBeGreaterThanOrEqual(roi.x)
      expect(x).toBeLessThanOrEqual(roi.x + roi.width)
      expect(y).toBeGreaterThanOrEqual(roi.y)
      expect(y).toBeLessThanOrEqual(roi.y + roi.height)
    }
  }
})

it('pins the real JPEG source and sampling metadata for the RGBA fixture', () => {
  const source = readFileSync(RITAN_SPRAYWALL_FIXTURE_METADATA.sourcePath)
  expect(createHash('sha256').update(source).digest('hex')).toBe(RITAN_SPRAYWALL_FIXTURE_METADATA.sourceSha256)
  expect(RITAN_SPRAYWALL_FIXTURE_METADATA.sampleSize).toEqual({ width: RITAN_SPRAYWALL_FIXTURE.width, height: RITAN_SPRAYWALL_FIXTURE.height })
  expect(RITAN_SPRAYWALL_FIXTURE.data).toHaveLength(RITAN_SPRAYWALL_FIXTURE.width * RITAN_SPRAYWALL_FIXTURE.height * 4)
})

it('runs detection on the repository JPEG after fixed ROI extraction and scaling', () => {
  const decoded = jpeg.decode(readFileSync(RITAN_SPRAYWALL_FIXTURE_METADATA.sourcePath), { useTArray: true })
  const roi = { x: 0.05, y: 0.12, width: 0.9, height: 0.72 }
  const sourceX = Math.floor(decoded.width * roi.x)
  const sourceY = Math.floor(decoded.height * roi.y)
  const sourceWidth = Math.floor(decoded.width * roi.width)
  const sourceHeight = Math.floor(decoded.height * roi.height)
  const scale = Math.min(1, 160 / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(decoded.width - 1, sourceX + Math.floor(x / scale))
    const sy = Math.min(decoded.height - 1, sourceY + Math.floor(y / scale))
    const source = (sy * decoded.width + sx) * 4
    const target = (y * width + x) * 4
    pixels.set(decoded.data.subarray(source, source + 4), target)
  }
  const holds = detectFromPixels(width, height, pixels, { roi, roiAlreadyApplied: true })
  expect(holds.length).toBeGreaterThan(0)
  expect(holds.every(hold => hold.x >= roi.x && hold.x < roi.x + roi.width && hold.y >= roi.y && hold.y < roi.y + roi.height)).toBe(true)
})
