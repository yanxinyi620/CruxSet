// @ts-nocheck
import { call } from './cloud.js'
export const login = () => call<{ userId: string }>('login')
export const currentUserId = () => wx.getStorageSync('cruxset:userId') as string | undefined
export const currentUserIsAdmin = async (): Promise<boolean> => {
  const result = await call<{ isAdmin?: boolean }>('wallManager', { action: 'getSession' })
  return result.isAdmin === true
}
export const getProfile = () => call<{ userId: string; isAdmin: boolean; displayName: string }>('wallManager', { action: 'getSession' })
export const updateProfile = (displayName: string) => call<{ userId: string; isAdmin: boolean; displayName: string }>('wallManager', { action: 'updateProfile', data: { displayName } })
export async function ensureUser(): Promise<string> { const cached = currentUserId(); if (cached) return cached; const result = await login(); wx.setStorageSync('cruxset:userId', result.userId); return result.userId }
