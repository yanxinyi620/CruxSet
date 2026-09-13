// @ts-nocheck
import { ReadCache } from './read-cache.js'
import { cloudErrorMessage } from './errors.js'
const reads = new ReadCache()
const browseReads = new ReadCache(30_000, 100, {
  staleTtl: 24 * 60 * 60 * 1000,
  maxBytes: 2 * 1024 * 1024,
  storage: {
    read: () => wx.getStorageSync('cruxset:browse-cache:v2'),
    write: rows => wx.setStorageSync('cruxset:browse-cache:v2', rows),
  },
})
export const subscribeBrowseCache = listener => browseReads.subscribe(listener)
const clearReads = (notify = false) => { reads.clear(); browseReads.clear(notify) }
const readActions = new Set(['listBrowseWalls', 'listMyWalls', 'listAdminWalls', 'getWall', 'listProblems', 'listMyProblems', 'getProblem', 'getSession', 'listUsers'])
const cacheKey = (user, action, data = {}) => JSON.stringify([user, action, Object.keys(data).sort().map(key => [key, data[key]])])
export const invalidateReadCache = () => clearReads(true)
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
    wx.cloud.callFunction({ name, data, success: result => resolve(result.result as T), fail: error => {
      console.error('[CruxSet cloud call failed]', {
        functionName: name,
        action: typeof data.action === 'string' ? data.action : '',
        code: error?.errCode ?? error?.code,
        message: error?.errMsg || error?.message || String(error),
        requestId: error?.requestId || error?.requestID || '',
      })
      reject(error)
    } })
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
      clearReads(true)
      initializedUser = undefined
      await initializeUser()
      return invoke<T>(name, data).catch(error => { throw normalizeCloudError(error) })
    }
    throw normalizeCloudError(error)
  }
}

export async function call<T>(name: string, data: Record<string, unknown> = {}, browse = false): Promise<T> {
  const user = await initializeUser()
  if (name === 'wallManager' && readActions.has(data.action as string)) {
    const cache = browse && ['listBrowseWalls','getWall','listProblems','getProblem'].includes(data.action as string) ? browseReads : reads
    const action = data.action as string, args = data.data || {}, generation = cache.generation
    return cache.read<T>(cacheKey(user, action, args), async () => {
      const result = await authenticatedCall<T>(name, data)
      if (generation === cache.generation && Array.isArray(result)) {
        const target = ['listBrowseWalls','listMyWalls','listAdminWalls'].includes(action) ? 'getWall' : ['listProblems','listMyProblems'].includes(action) ? 'getProblem' : ''
        if (target) {
          const previous = cache.peek(cacheKey(user, action, args)) || []
          const ids = new Set(result.map(item => item.id))
          previous.forEach(item => { if (!ids.has(item.id)) cache.forget(cacheKey(user, target, {id:item.id})) })
        }
        if (target && action !== 'listBrowseWalls') result.forEach(item => cache.seed(cacheKey(user, target, {id:item.id}), item))
      }
      return result
    })
  }
  const write = ['saveProblem','updateProblem','deleteProblem'].includes(name) || name === 'wallManager' || (name === 'adminWall' && data.action !== 'listDrafts')
  if (write) clearReads()
  try { return await authenticatedCall<T>(name, data) }
  finally { if (write) clearReads(true) }
}
