import { call } from './cloud.js'
import { browseProblems } from '../domain/browse.js'
import type { Wall, WallSummary, Problem } from '../domain/types.js'
import type { ReadOptions } from './read-cache.js'
const read = <T>(action: string, data = {}, options: ReadOptions = {}) => call<T>('wallManager', { action, data }, true, options)
export const listWalls = (options: ReadOptions = {}) => read<WallSummary[]>('listBrowseWalls', {}, options)
export const getWall = (id: string, options: ReadOptions = {}) => read<Wall>('getWall', { id }, options)
export const getProblem = (id: string, options: ReadOptions = {}) => read<Problem>('getProblem', { id }, options)
export const listProblems = async (filter: Partial<Pick<Problem, 'wallId' | 'angle' | 'grade'>> = {}, options: ReadOptions = {}) =>
  browseProblems(await read<Problem[]>('listProblems', filter.wallId ? { wallId: filter.wallId } : {}, options), filter)
