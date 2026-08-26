// @ts-nocheck
import { call } from './cloud.js'
import type { Layout, Wall } from '../../src/domain/types.js'
import { normalizeCloudError } from './cloud.js'
export const adminLayout = (action: string, data: Partial<Wall & Layout>) => call<{ ok: boolean }>('adminLayout', { action, data })
export const getLayout = (id: string) => new Promise<Layout>((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); wx.cloud.database().collection('layouts').doc(id).get({ success: result => resolve(result.data as Layout), fail: error => reject(normalizeCloudError(error)) }) })
export const getCachedLayout = async (id: string, version: number) => { const key = `layout:${id}:${version}`; const cached = wx.getStorageSync(key) as Layout | undefined; if (cached) return cached; const layout = await getLayout(id); wx.setStorageSync(`layout:${layout.id}:${layout.version}`, layout); return layout }
export const uploadWallImage = (filePath: string, cloudPath: string) => new Promise<{ fileID: string }>((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); wx.cloud.uploadFile({ cloudPath, filePath, success: resolve, fail: error => reject(normalizeCloudError(error)) }) })
