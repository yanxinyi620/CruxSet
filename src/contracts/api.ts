import type { Layout, Problem, User, Wall } from '../domain/types.js'

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'LAYOUT_LOCKED'
  | 'LAYOUT_NOT_ROUTABLE'
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'

export interface ApiError {
  code: ApiErrorCode
  message: string
}

export type ApiResult<T> = T | { error: ApiError }

export interface CurrentUser extends Pick<User, 'id' | 'displayName' | 'avatarUrl'> {
  isAdmin: boolean
}

export type WallSummary = Pick<Wall, 'id' | 'name' | 'description' | 'angleOptions' | 'ownerId' | 'visibility' | 'updatedAt'>
export type LayoutSummary = Pick<Layout, 'id' | 'wallId' | 'name' | 'version' | 'published' | 'holds' | 'updatedAt'>
export type ProblemSummary = Pick<Problem, 'id' | 'number' | 'wallId' | 'layoutId' | 'name' | 'angle' | 'grade' | 'createdBy' | 'updatedAt'>
