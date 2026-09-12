// @ts-nocheck
import { getWallImageUrl } from './walls.js'
const entries = new Map<string, { expires: number; path: Promise<string> }>()
const keyFor = (file: string) => `${wx.getStorageSync('cruxset:userId') || ''}:${file}`
export function invalidateWallImage(file: string) { entries.delete(keyFor(file)) }
export function wallImagePath(file: string): Promise<string> {
  if (!file.startsWith('cloud://') && !/^https?:/.test(file)) return Promise.resolve(file)
  const key = keyFor(file), cached = entries.get(key)
  if (cached && cached.expires > Date.now()) return cached.path
  const path = (file.startsWith('cloud://') ? getWallImageUrl(file) : Promise.resolve(file)).then(url => new Promise<string>((resolve, reject) => {
    wx.downloadFile({url, success: result => result.statusCode === 200 ? resolve(result.tempFilePath) : reject(new Error('IMAGE_DOWNLOAD_FAILED')), fail: reject})
  }))
  const entry = {expires:Date.now() + 10 * 60 * 1000, path}
  entries.delete(key); entries.set(key, entry)
  while (entries.size > 12) entries.delete(entries.keys().next().value)
  path.catch(() => { if (entries.get(key) === entry) entries.delete(key) })
  return path
}
