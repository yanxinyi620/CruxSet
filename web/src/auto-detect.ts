import type { Hold } from '../../wechat/miniprogram/domain/types.js'
import { detectFromPixels, fullImageRoi, AUTO_DETECT_DEFAULTS } from '../../wechat/miniprogram/domain/auto-detect.js'
import type { AutoDetectOptions } from '../../wechat/miniprogram/domain/auto-detect.js'
export * from '../../wechat/miniprogram/domain/auto-detect.js'

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
