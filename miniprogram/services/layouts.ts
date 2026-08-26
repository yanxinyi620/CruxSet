// @ts-nocheck
import { call } from './cloud.js'
import type { Layout, Wall } from '../../src/domain/types.js'
import { normalizeCloudError } from './cloud.js'
export const adminLayout = (action: string, data: Partial<Wall & Layout>) => call<{ ok: boolean }>('adminLayout', { action, data })
export const getLayout = (id: string, version?: number) => new Promise<Layout>((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); const collection = wx.cloud.database().collection('layouts'); const request = version === undefined ? collection.where({ id }).orderBy('version', 'desc').limit(1).get : collection.where({ id, version }).limit(1).get; request({ success: result => result.data?.length ? resolve(result.data[0] as Layout) : reject(normalizeCloudError(new Error('LAYOUT_NOT_FOUND'))), fail: error => reject(normalizeCloudError(error)) }) })
export const getCachedLayout = async (id: string, version: number) => { const key = `layout:${id}:${version}`; const cached = wx.getStorageSync(key) as Layout | undefined; if (cached) return cached; const layout = await getLayout(id, version); wx.setStorageSync(`layout:${layout.id}:${layout.version}`, layout); return layout }
export const uploadWallImage = (filePath: string, cloudPath: string) => new Promise<{ fileID: string }>((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); wx.cloud.uploadFile({ cloudPath, filePath, success: resolve, fail: error => reject(normalizeCloudError(error)) }) })
