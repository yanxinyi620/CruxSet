// @ts-nocheck
import { savedImage, saveImage, forgetSavedImage } from './saved-images.js'
import { getWallImageUrl } from './walls.js'
const entries = new Map<string, { expires: number; path: Promise<string> }>()
const keyFor = (file: string) => `${wx.getStorageSync('cruxset:userId') || ''}:${file}`
export function invalidateWallImage(file: string) { const key=keyFor(file);entries.delete(key);forgetSavedImage(key) }
export function wallImagePath(file: string): Promise<string> {
  if (!file.startsWith('cloud://') && !/^https?:/.test(file)) return Promise.resolve(file)
  const key = keyFor(file), cached = entries.get(key)
  if (cached && cached.expires > Date.now()) return cached.path
  if(file.startsWith('cloud://')) { const saved=savedImage(key);if(saved)return Promise.resolve(saved) }
  const path = (file.startsWith('cloud://') ? getWallImageUrl(file) : Promise.resolve(file)).then(url => new Promise<string>((resolve, reject) => {
    wx.downloadFile({url, success: result => result.statusCode === 200 ? resolve(result.tempFilePath) : reject(new Error('IMAGE_DOWNLOAD_FAILED')), fail: reject})
  })).then(tempPath => file.startsWith('cloud://') ? saveImage(key,tempPath,()=>entries.get(key)===entry) : tempPath)
  const entry = {expires:Date.now() + 10 * 60 * 1000, path}
  entries.delete(key); entries.set(key, entry)
  while (entries.size > 12) entries.delete(entries.keys().next().value)
  path.catch(() => { if (entries.get(key) === entry) entries.delete(key) })
  return path
}
