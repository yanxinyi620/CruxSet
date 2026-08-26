// @ts-nocheck
import type { Wall } from '../../src/domain/types.js'
export const listWalls = () => new Promise<Wall[]>((resolve, reject) => { if (!wx.cloud) return reject(new Error('CLOUD_NOT_CONFIGURED')); wx.cloud.database().collection('walls').orderBy('name', 'asc').get({ success: result => resolve(result.data as Wall[]), fail: reject }) })
export const getWall = (id: string) => new Promise<Wall>((resolve, reject) => { if (!wx.cloud) return reject(new Error('CLOUD_NOT_CONFIGURED')); wx.cloud.database().collection('walls').doc(id).get({ success: result => resolve(result.data as Wall), fail: reject }) })
