// @ts-nocheck
import type { Wall } from '../../src/domain/types.js'
import { normalizeCloudError } from './cloud.js'
export const listWalls = () => new Promise<Wall[]>((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); wx.cloud.database().collection('walls').orderBy('name', 'asc').get({ success: result => resolve(result.data as Wall[]), fail: error => reject(normalizeCloudError(error)) }) })
export const getWall = (id: string) => new Promise<Wall>((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); wx.cloud.database().collection('walls').doc(id).get({ success: result => resolve(result.data as Wall), fail: error => reject(normalizeCloudError(error)) }) })
