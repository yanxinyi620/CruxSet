// @ts-nocheck
import { call } from './cloud.js'
export const login = () => call<{ userId: string }>('login')
export const currentUserId = () => wx.getStorageSync('cruxset:userId') as string | undefined
export async function ensureUser(): Promise<string> { const cached = currentUserId(); if (cached) return cached; const result = await login(); wx.setStorageSync('cruxset:userId', result.userId); return result.userId }
