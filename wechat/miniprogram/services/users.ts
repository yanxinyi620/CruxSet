// @ts-nocheck
import { call, initializeUser } from './cloud.js'
export const login = () => call<{ userId: string }>('login')
export const currentUserId = () => wx.getStorageSync('cruxset:userId') as string | undefined
export const currentUserIsAdmin = async (): Promise<boolean> => {
  const result = await call<{ isAdmin?: boolean }>('wallManager', { action: 'getSession' })
  return result.isAdmin === true
}
export const getProfile = () => call<{ userId: string; isAdmin: boolean; displayName: string }>('wallManager', { action: 'getSession' })
export const updateProfile = (displayName: string) => call<{ userId: string; isAdmin: boolean; displayName: string }>('wallManager', { action: 'updateProfile', data: { displayName } })
export const ensureUser = initializeUser
export type AdminUser = { id: string; displayName: string; isAdmin: boolean; createdAt: number }
export const listUsers = () => call<AdminUser[]>('wallManager', { action: 'listUsers' })
