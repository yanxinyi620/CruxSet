// @ts-nocheck
import { cloudErrorMessage } from './errors.js'
export function normalizeCloudError(error: unknown): Error { const normalized = new Error(cloudErrorMessage(error)); Object.assign(normalized, { cause: error, code: typeof error === 'object' && error && 'errCode' in error ? error.errCode : undefined }); return normalized }
export function call<T>(name: string, data: Record<string, unknown> = {}): Promise<T> { return new Promise((resolve, reject) => { if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED'))); wx.cloud.callFunction({ name, data, success: result => resolve(result.result as T), fail: error => reject(normalizeCloudError(error)) }) }) }
