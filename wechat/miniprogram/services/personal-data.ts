import { call, peekBrowse } from './cloud.js'
import { getWall } from './browse-data.js'
import { isReadRevoked, type ReadOptions } from './read-cache.js'
import type { Problem, Wall } from '../domain/types.js'

export const listMyProblems = (options: ReadOptions = {}) => call<Problem[]>('wallManager', { action: 'listMyProblems' }, true, options)
export const peekMyProblems = () => peekBrowse<Problem[]>('listMyProblems')
export type ProblemGroup = { id: string; wallName: string; updatedAt: number; expanded: boolean; problems: Problem[] }
const groupProblems = (problems: Problem[], walls: (Wall | undefined)[], expanded: Set<string>): ProblemGroup[] =>
  walls.filter((wall): wall is Wall => wall?.visibility === 'public')
    .map(wall => ({ id: wall.id, wallName: wall.name, updatedAt: wall.updatedAt, expanded: expanded.has(wall.id),
      problems: problems.filter(problem => problem.wallId === wall.id).sort((a, b) => a.number.localeCompare(b.number)) }))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id))
const wallIds = (problems: Problem[]) => [...new Set(problems.map(problem => problem.wallId))]
export const peekMyProblemGroups = (expanded: Set<string>) => {
  const problems = peekMyProblems()
  if (!problems) return undefined
  const walls = wallIds(problems).map(id => peekBrowse<Wall>('getWall', { id }))
  return walls.some(wall => !wall) ? undefined : groupProblems(problems, walls, expanded)
}
export const listMyProblemGroups = async (expanded: Set<string>, options: ReadOptions = {}) => {
  const problems = await listMyProblems(options)
  const walls = await Promise.all(wallIds(problems).map(async id => {
    try { return await getWall(id, options) }
    catch (error) { if (isReadRevoked(error)) return undefined; throw error }
  }))
  return groupProblems(problems, walls, expanded)
}
export const personalCacheMatches = (key: string, includeWalls = false) => key === '*' ||
  ['listMyProblems', ...(includeWalls ? ['getWall'] : [])].includes(JSON.parse(key)[1])
