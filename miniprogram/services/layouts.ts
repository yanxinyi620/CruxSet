// @ts-nocheck
import { call } from './cloud.js'
import type { Layout, Wall } from '../domain/types.js'
import { normalizeCloudError } from './cloud.js'
import { wallManager } from './walls.js'
export const adminLayout = (action: string, data: Partial<Wall & Layout>) => wallManager(action, data as Record<string, unknown>)
export const getLayout = (id: string, version?: number) => wallManager('getLayout', version===undefined?{id}:{id,version}) as Promise<Layout>
export const getCachedLayout = async (id: string, version: number) => { const key = `layout:${id}:${version}`; const cached = wx.getStorageSync(key) as Layout | undefined; if (cached) return cached; const layout = await getLayout(id, version); wx.setStorageSync(`layout:${layout.id}:${layout.version}`, layout); return layout }
export const uploadWallImage = (filePath: string, cloudPath: string) => new Promise<{ fileID: string }>((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); wx.cloud.uploadFile({ cloudPath, filePath, success: resolve, fail: error => reject(normalizeCloudError(error)) }) })
export const getLayoutImageUrl = (fileID: string) => call<{ url: string }>('getLayoutImageUrl', { fileID }).then(result => result.url)
