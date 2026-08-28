import type { Hold, Point } from '../../miniprogram/domain/types.js'

/**
 * 墙图岩点/体积自动识别（启发式，非 ML）。
 *
 * 思路（参考 Sprai 式「拍照自动打点」的交互）：
 * 1. 前景判据：像素「高饱和度」（彩色岩点）或「低明度」（黑色岩点）；
 * 2. 对前景做十字形态学开运算（先腐蚀再膨胀），去除纹理噪点；
 * 3. 4-连通域分析，过滤小噪点、过大背景块与细长噪声；
 * 4. 每个连通域取边界像素，按质心角度取最外沿点形成轮廓（polygon，归一化）；
 *    半径超过阈值自动归类为「体积」，否则为「岩点」。
 *
 * 纯函数部分（detectFromPixels）不依赖 DOM，便于单元测试；识别结果可用既有
 * 移动/删除/半径工具继续手动修正（编辑后 polygon 会被清除、退回圆形渲染）。
 */

export interface AutoDetectOptions {
  /** 形态学开运算配置；默认执行一次。 */
  morphology?: { enabled?: boolean; iterations?: number }
  /** 检测区域，使用整张图片的归一化坐标。 */
  roi?: Roi
  /** DOM 入口已将像素裁剪到 ROI，仅用于避免重复裁剪。 */
  roiAlreadyApplied?: boolean
  /** 分析用最大边像素，避免大图过慢。 */
  maxDim?: number
  /** 饱和度超过该值判为前景（彩色岩点）。 */
  saturationThreshold?: number
  /** 明度低于该值判为前景（黑色岩点）。 */
  darkValueThreshold?: number
  /** 组件面积 / 全图面积 低于该值视为噪点丢弃。 */
  minAreaRatio?: number
  /** 组件面积 / 全图面积 高于该值视为背景块丢弃。 */
  maxAreaRatio?: number
  /** 组件填充率低于该值视为细长噪声丢弃。 */
  minFillRatio?: number
  /** 组件最小边 / 全图短边 低于该值丢弃。 */
  minSideFraction?: number
  /** 组件的最小像素面积；设置后与比例阈值取更宽松者。 */
  minComponentPixels?: number
  /** 组件包围盒短边的最小像素数。 */
  minSidePixels?: number
  /** 是否丢弃接触检测区域边界的组件。 */
  dropBoundaryComponents?: boolean
  /** 归一化半径 ≥ 该值归类为体积。 */
  volumeRadiusRatio?: number
  /** 轮廓角度桶数（决定轮廓点数量上限）。 */
  outlineBuckets?: number
}

export interface Roi { x: number; y: number; width: number; height: number }
export const DETECT_ROI_FALLBACK_MESSAGE = '识别区域无效，已回退整图'

type AutoDetectDefaults = Required<Pick<AutoDetectOptions,
  'saturationThreshold' | 'darkValueThreshold' | 'minAreaRatio' | 'maxAreaRatio' |
  'minFillRatio' | 'minSideFraction' | 'volumeRadiusRatio' | 'outlineBuckets'>> & {
  maxDim: number
  minComponentPixels: number
  minSidePixels: number
  morphology: { enabled: boolean; iterations: number }
}

export const AUTO_DETECT_DEFAULTS: AutoDetectDefaults = {
  maxDim: 1280,
  saturationThreshold: 0.5,
  darkValueThreshold: 0.2,
  minAreaRatio: 0.0009,
  maxAreaRatio: 0.08,
  minFillRatio: 0.42,
  minSideFraction: 0.005,
  volumeRadiusRatio: 0.04,
  outlineBuckets: 36,
  minComponentPixels: 20,
  minSidePixels: 3,
  morphology: { enabled: true, iterations: 1 },
}

/** 十字形态学腐蚀：中心与上下左右均为前景才保留。 */
const erodeCross = (src: Uint8Array<ArrayBufferLike>, width: number, height: number): Uint8Array<ArrayBufferLike> => {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!src[i]) continue
      if ((y > 0 ? src[i - width] : 0) && (y < height - 1 ? src[i + width] : 0) && (x > 0 ? src[i - 1] : 0) && (x < width - 1 ? src[i + 1] : 0)) out[i] = 1
    }
  }
  return out
}

/** 十字形态学膨胀：中心或任一上下左右为前景即保留。 */
const dilateCross = (src: Uint8Array<ArrayBufferLike>, width: number, height: number): Uint8Array<ArrayBufferLike> => {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (src[i] || (y > 0 ? src[i - width] : 0) || (y < height - 1 ? src[i + width] : 0) || (x > 0 ? src[i - 1] : 0) || (x < width - 1 ? src[i + 1] : 0)) out[i] = 1
    }
  }
  return out
}

interface Component {
  area: number; sx: number; sy: number; minX: number; maxX: number; minY: number; maxY: number
  boundary: number[]
}

/** 由组件边界像素生成归一化轮廓：按质心角度分桶，每桶取最外沿点。 */
const outlineOf = (c: Component, width: number, height: number, buckets: number): Point[] | undefined => {
  if (!c.boundary.length) return undefined
  const bx = c.sx / c.area
  const by = c.sy / c.area
  const best = new Array<[number, number]>(buckets)
  let filled = 0
  const step = (Math.PI * 2) / buckets
  for (const idx of c.boundary) {
    const px = idx % width
    const py = (idx / width) | 0
    const dx = px - bx
    const dy = py - by
    const d2 = dx * dx + dy * dy
    let bucket = Math.floor((Math.atan2(dy, dx) + Math.PI) / step)
    if (bucket >= buckets) bucket = buckets - 1
    const current = best[bucket]
    if (!current) { best[bucket] = [dx, dy]; filled++ }
    else if (d2 > current[0] * current[0] + current[1] * current[1]) best[bucket] = [dx, dy]
  }
  if (!filled) return undefined
  const points: Point[] = []
  for (let i = 0; i < buckets; i++) {
    const p = best[i]
    if (p) points.push([(bx + p[0]) / width, (by + p[1]) / height])
  }
  return points.length >= 3 ? points : undefined
}

const xInRoi = (coordinate: number, size: number, start: number, span: number): boolean => {
  const normalized = coordinate / size
  return normalized >= start && normalized < start + span
}

const isValidRoi = (roi: Roi): boolean =>
  Number.isFinite(roi.x) && Number.isFinite(roi.y) && Number.isFinite(roi.width) && Number.isFinite(roi.height) &&
  roi.x >= 0 && roi.y >= 0 && roi.width > 0 && roi.height > 0 && roi.x + roi.width <= 1 && roi.y + roi.height <= 1
const fullImageRoi = (roi: Roi): Roi => isValidRoi(roi) ? roi : { x: 0, y: 0, width: 1, height: 1 }

/** 对像素数据（RGBA）执行自动识别，返回归一化坐标 + 可选边缘轮廓的岩点/体积列表。 */
export function detectFromPixels(width: number, height: number, data: Uint8ClampedArray, opts: AutoDetectOptions = {}): Hold[] {
  const o = { ...AUTO_DETECT_DEFAULTS, ...opts }
  if (width <= 0 || height <= 0) return []
  const roi = fullImageRoi(opts.roi ?? { x: 0, y: 0, width: 1, height: 1 })
  const roiX = Math.max(0, Math.min(1, roi.x))
  const roiY = Math.max(0, Math.min(1, roi.y))
  const roiW = Math.max(0, Math.min(1 - roiX, roi.width))
  const roiH = Math.max(0, Math.min(1 - roiY, roi.height))
  const total = width * height
  const analysisWidth = o.roiAlreadyApplied ? width : width * roiW
  const analysisHeight = o.roiAlreadyApplied ? height : height * roiH
  const analysisArea = analysisWidth * analysisHeight
  const roiLeft = o.roiAlreadyApplied ? 0 : Math.floor(roiX * width)
  const roiTop = o.roiAlreadyApplied ? 0 : Math.floor(roiY * height)
  const roiRight = o.roiAlreadyApplied ? width - 1 : Math.ceil((roiX + roiW) * width) - 1
  const roiBottom = o.roiAlreadyApplied ? height - 1 : Math.ceil((roiY + roiH) * height) - 1

  // 1) 前景掩码：高饱和（彩色岩点）或低明度（黑色岩点）
  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    const sat = mx > 0 ? (mx - mn) / mx : 0
    const val = mx / 255
    const inRoi = o.roiAlreadyApplied || (
      xInRoi(i % width, width, roiX, roiW) &&
      xInRoi((i / width) | 0, height, roiY, roiH)
    )
    if (inRoi && (sat > o.saturationThreshold || val < o.darkValueThreshold)) mask[i] = 1
  }

  // 2) 形态学开运算，去除纹理噪点
  const morphology = { ...AUTO_DETECT_DEFAULTS.morphology, ...opts.morphology }
  const iterations = Math.max(0, Math.floor(morphology.iterations))
  let fg: Uint8Array<ArrayBufferLike> = mask
  if (morphology.enabled) {
    for (let i = 0; i < iterations; i++) fg = dilateCross(erodeCross(fg, width, height), width, height)
  }
  if (!o.roiAlreadyApplied) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < roiLeft || x > roiRight || y < roiTop || y > roiBottom) fg[y * width + x] = 0
      }
    }
  }

  // 3) 4-连通域标注 + 统计（同时记录边界像素）
  const label = new Int32Array(total).fill(-1)
  const components: Component[] = []
  let labelId = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!fg[idx] || label[idx] !== -1) continue
      let area = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y
      const boundary: number[] = []
      const queue = [idx]
      label[idx] = labelId
      for (let q = 0; q < queue.length; q++) {
        const p = queue[q]
        const px = p % width
        const py = (p / width) | 0
        area++
        sx += px
        sy += py
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        if (px === 0 || py === 0 || px === width - 1 || py === height - 1 || !fg[p - width] || !fg[p + width] || !fg[p - 1] || !fg[p + 1]) boundary.push(p)
        if (px > 0) { const ni = p - 1; if (fg[ni] && label[ni] === -1) { label[ni] = labelId; queue.push(ni) } }
        if (px < width - 1) { const ni = p + 1; if (fg[ni] && label[ni] === -1) { label[ni] = labelId; queue.push(ni) } }
        if (py > 0) { const ni = p - width; if (fg[ni] && label[ni] === -1) { label[ni] = labelId; queue.push(ni) } }
        if (py < height - 1) { const ni = p + width; if (fg[ni] && label[ni] === -1) { label[ni] = labelId; queue.push(ni) } }
      }
      components.push({ area, sx, sy, minX, maxX, minY, maxY, boundary })
      labelId++
    }
  }

  // 4) 过滤并生成岩点/体积（含边缘轮廓）
  const result: Hold[] = []
  for (const c of components) {
    if (opts.dropBoundaryComponents &&
      (c.minX <= roiLeft || c.minY <= roiTop || c.maxX >= roiRight || c.maxY >= roiBottom)) continue
    const areaRatio = c.area / analysisArea
    const minArea = Math.max(
      o.minAreaRatio * analysisArea,
      opts.minComponentPixels ?? o.minComponentPixels,
    )
    if (c.area < minArea || areaRatio > o.maxAreaRatio) continue
    const bw = c.maxX - c.minX + 1
    const bh = c.maxY - c.minY + 1
    const minSide = opts.minSidePixels ?? Math.max(o.minSidePixels, o.minSideFraction * Math.min(analysisWidth, analysisHeight))
    if (Math.min(bw, bh) < minSide) continue
    if (c.area / (bw * bh) < o.minFillRatio) continue
    const cx = c.sx / c.area
    const cy = c.sy / c.area
    const x = o.roiAlreadyApplied ? roiX + (cx / width) * roiW : cx / width
    const y = o.roiAlreadyApplied ? roiY + (cy / height) * roiH : cy / height
    const radius = o.roiAlreadyApplied
      ? Math.max((bw / width) * roiW, (bh / height) * roiH) / 2
      : Math.max(bw / width, bh / height) / 2
    const kind = radius >= o.volumeRadiusRatio ? 'volume' : 'hold'
    const localPolygon = outlineOf(c, width, height, o.outlineBuckets)
    const polygon = localPolygon?.map(([px, py]) => o.roiAlreadyApplied
      ? [roiX + px * roiW, roiY + py * roiH] as Point
      : [px, py] as Point)
    const bbox: readonly [number, number, number, number] = [
      o.roiAlreadyApplied ? roiX + (c.minX / width) * roiW : Math.max(roiX, c.minX / width),
      o.roiAlreadyApplied ? roiY + (c.minY / height) * roiH : Math.max(roiY, c.minY / height),
      o.roiAlreadyApplied ? roiX + ((c.maxX + 1) / width) * roiW : Math.min(roiX + roiW, (c.maxX + 1) / width),
      o.roiAlreadyApplied ? roiY + ((c.maxY + 1) / height) * roiH : Math.min(roiY + roiH, (c.maxY + 1) / height),
    ]
    const hold: Hold = { id: '', x, y, radius, kind, bbox }
    if (polygon) hold.polygon = polygon
    result.push(hold)
  }
  result.sort((a, b) => a.y - b.y || a.x - b.x)
  result.forEach((hold, index) => { hold.id = `H${String(index + 1).padStart(3, '0')}` })
  return result
}

/** DOM 包装：把 <img> 绘制到离屏画布后交给 detectFromPixels。 */
export function autoDetectHolds(image: HTMLImageElement, opts: AutoDetectOptions = {}): Hold[] {
  const maxDim = opts.maxDim ?? AUTO_DETECT_DEFAULTS.maxDim
  const roi = fullImageRoi(opts.roi ?? { x: 0, y: 0, width: 1, height: 1 })
  const roiX = Math.max(0, Math.min(1, roi.x))
  const roiY = Math.max(0, Math.min(1, roi.y))
  const roiW = Math.max(0, Math.min(1 - roiX, roi.width))
  const roiH = Math.max(0, Math.min(1 - roiY, roi.height))
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * roiW))
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * roiH))
  const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, Math.round(image.naturalWidth * roiX), Math.round(image.naturalHeight * roiY), sourceWidth, sourceHeight, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  return detectFromPixels(width, height, data, { ...opts, roi: { x: roiX, y: roiY, width: roiW, height: roiH }, roiAlreadyApplied: true })
}
