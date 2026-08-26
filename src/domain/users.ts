import type { User } from './types.js'
export const createUserRecord = (openid: string, now: number, id: () => string): User => ({ id: id(), openid, createdAt: now, updatedAt: now })
