import { call } from './cloud.js'
import { browseProblems } from '../domain/browse.js'
import type { Wall, WallSummary, Problem } from '../domain/types.js'
const read = <T>(action: string, data = {}) => call<T>('wallManager', { action, data }, true)
export const listWalls = () => read<WallSummary[]>('listBrowseWalls')
export const getWall = (id: string) => read<Wall>('getWall', { id })
export const getProblem = (id: string) => read<Problem>('getProblem', { id })
export const listProblems = async (filter: Partial<Pick<Problem, 'wallId' | 'angle' | 'grade'>> = {}) =>
  browseProblems(await read<Problem[]>('listProblems', filter.wallId ? { wallId: filter.wallId } : {}), filter)
