// @ts-nocheck
import { call } from './cloud.js'
import type { Layout, Wall } from '../../src/domain/types.js'
export const adminLayout = (action: string, data: Partial<Wall & Layout>) => call<{ ok: boolean }>('adminLayout', { action, ...data })
export const getLayout = (id: string) => new Promise<Layout>((resolve, reject) => { if (!wx.cloud) return reject(new Error('CLOUD_NOT_CONFIGURED')); wx.cloud.database().collection('layouts').doc(id).get({ success: result => resolve(result.data as Layout), fail: reject }) })
