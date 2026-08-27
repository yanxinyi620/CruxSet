// @ts-nocheck
import { call } from './cloud.js'
import { isMockMode } from '../config/runtime.js'
import { mockCurrentUserId } from './mock-repository.js'
export const login = () => isMockMode()?Promise.resolve({userId:mockCurrentUserId}):call<{ userId: string }>('login')
export const currentUserId = () => wx.getStorageSync('cruxset:userId') as string | undefined
export async function ensureUser(): Promise<string> { const cached = currentUserId(); if (cached) return cached; const result = await login(); wx.setStorageSync('cruxset:userId', result.userId); return result.userId }
