// @ts-nocheck
import { ReadCache } from './read-cache.js'
import { cloudErrorMessage } from './errors.js'
const reads = new ReadCache()
const readActions = new Set(['listBrowseWalls', 'listMyWalls', 'listAdminWalls', 'getWall', 'listProblems', 'listMyProblems', 'getProblem', 'getSession', 'listUsers'])
const cacheKey = (user, action, data = {}) => JSON.stringify([user, action, Object.keys(data).sort().map(key => [key, data[key]])])
export const invalidateReadCache = () => reads.clear()
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
async function authenticatedCall<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  if (name === 'login') return { userId: await initializeUser() } as T
  await initializeUser()
  try { return await invoke<T>(name, data) }
  catch (error) {
    if (/LOGIN_REQUIRED/.test(error?.errMsg || error?.message || '')) {
      reads.clear()
      initializedUser = undefined
      await initializeUser()
      return invoke<T>(name, data).catch(error => { throw normalizeCloudError(error) })
    }
    throw normalizeCloudError(error)
  }
}

export async function call<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  const user = await initializeUser()
  if (name === 'wallManager' && readActions.has(data.action as string)) {
    const action = data.action as string, args = data.data || {}, generation = reads.generation
    return reads.read<T>(cacheKey(user, action, args), async () => {
      const result = await authenticatedCall<T>(name, data)
      if (generation === reads.generation && Array.isArray(result)) {
        const target = ['listBrowseWalls','listMyWalls','listAdminWalls'].includes(action) ? 'getWall' : ['listProblems','listMyProblems'].includes(action) ? 'getProblem' : ''
        if (target) result.forEach(item => reads.seed(cacheKey(user, target, {id:item.id}), item))
      }
      return result
    })
  }
  const write = ['saveProblem','updateProblem','deleteProblem'].includes(name) || name === 'wallManager' || (name === 'adminWall' && data.action !== 'listDrafts')
  if (write) reads.clear()
  try { return await authenticatedCall<T>(name, data) }
  finally { if (write) reads.clear() }
}
