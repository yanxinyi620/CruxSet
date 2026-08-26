// @ts-nocheck
export function call<T>(name: string, data: Record<string, unknown> = {}): Promise<T> { return new Promise((resolve, reject) => { if (!wx.cloud) return reject(new Error('CLOUD_NOT_CONFIGURED')); wx.cloud.callFunction({ name, data, success: result => resolve(result.result as T), fail: reject }) }) }
