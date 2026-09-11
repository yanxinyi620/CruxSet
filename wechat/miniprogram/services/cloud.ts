// @ts-nocheck
import { cloudErrorMessage } from './errors.js'
let session: Promise<string> | undefined
let initializedUser: string | undefined
export function normalizeCloudError(error: unknown): Error {
  const normalized = new Error(cloudErrorMessage(error))
  Object.assign(normalized, { cause: error, code: error?.errCode || error?.code, rawMessage: error?.errMsg || error?.message })
  return normalized
}
function invoke<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) return reject(normalizeCloudError(new Error('CLOUD_NOT_CONFIGURED')))
    wx.cloud.callFunction({ name, data, success: result => resolve(result.result as T), fail: reject })
  })
}
export function initializeUser(): Promise<string> {
  if (initializedUser) return Promise.resolve(initializedUser)
  if (!session) session = invoke<{userId:string}>('login').then(result => {
    if (!result?.userId) throw new Error('LOGIN_REQUIRED')
    initializedUser = result.userId
    wx.setStorageSync('cruxset:userId', result.userId)
    return result.userId
  }).catch(error => { throw normalizeCloudError(error) }).finally(() => { session = undefined })
  return session
}
export async function call<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  if (name === 'login') return { userId: await initializeUser() } as T
  await initializeUser()
  try { return await invoke<T>(name, data) }
  catch (error) {
    if (/LOGIN_REQUIRED/.test(error?.errMsg || error?.message || '')) {
      initializedUser = undefined
      await initializeUser()
      return invoke<T>(name, data).catch(error => { throw normalizeCloudError(error) })
    }
    throw normalizeCloudError(error)
  }
}
