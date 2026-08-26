// @ts-nocheck
import { call } from './cloud.js'
import type { Problem } from '../../src/domain/types.js'
export const saveProblem = (wallId: string, layoutId: string, draft: Partial<Problem>) => call<{ id: string; number: string }>('saveProblem', { wallId, layoutId, draft })
export const deleteProblem = (id: string) => call<{ ok: boolean }>('deleteProblem', { id })
export const listProblems = (filter: Partial<Pick<Problem, 'wallId'|'layoutId'|'angle'|'grade'>> = {}) => new Promise<Problem[]>((resolve, reject) => { if (!wx.cloud) return reject(new Error('CLOUD_NOT_CONFIGURED')); wx.cloud.database().collection('problems').where(filter).orderBy('number', 'asc').get({ success: result => resolve(result.data as Problem[]), fail: reject }) })
