// @ts-nocheck
import { call } from './cloud.js'
import type { Layout, Wall } from '../domain/types.js'
import { normalizeCloudError } from './cloud.js'
import { wallManager } from './walls.js'
import { isMockMode } from '../config/runtime.js'
import { mockRepository } from './mock-repository.js'
export const adminLayout = (action: string, data: Partial<Wall & Layout>) => { if (!isMockMode()) return wallManager(action, data as Record<string, unknown>); if (action === 'createWall') return mockRepository.createWall(data); if (action === 'updateWall') return mockRepository.updateWall(data.id!, data); if (action === 'createLayout') return mockRepository.createLayout(data.wallId!, data as any); if (action === 'updateLayout') return mockRepository.updateLayout(data.wallId!, data.id!, data.holds || []); if (action === 'publishLayout') return mockRepository.publishLayout(data.wallId!, data.id!, data.holds || []); return Promise.reject(new Error('INVALID_ACTION')) }
export const getLayout = (id: string, version?: number) => isMockMode()?mockRepository.getLayout(id,version):wallManager('getLayout', version===undefined?{id}:{id,version}) as Promise<Layout>
export const listLayouts = (wallId: string) => isMockMode()?mockRepository.listLayouts(wallId):wallManager('listLayouts', { wallId }) as Promise<Layout[]>
export const deleteLayout = (wallId: string, layoutId: string) => isMockMode()?mockRepository.deleteLayout(wallId, layoutId):wallManager('deleteLayout', { wallId, layoutId }) as Promise<{ ok: true }>
export const getCachedLayout = async (id: string, version: number) => { const key = `layout:${id}:${version}`; const cached = wx.getStorageSync(key) as Layout | undefined; if (cached) return cached; const layout = await getLayout(id, version); wx.setStorageSync(`layout:${layout.id}:${layout.version}`, layout); return layout }
export const uploadWallImage = (filePath: string, cloudPath: string) => isMockMode()?mockRepository.uploadWallImage(filePath):new Promise<{ fileID: string }>((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); wx.cloud.uploadFile({ cloudPath, filePath, success: resolve, fail: error => reject(normalizeCloudError(error)) }) })
export const getLayoutImageUrl = (fileID: string) => isMockMode()?mockRepository.getLayoutImageUrl(fileID):call<{ url: string }>('getLayoutImageUrl', { fileID }).then(result => result.url)
