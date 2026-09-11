import type { Problem } from './types.js'
import { filterProblems } from './routes.js'
export const PUBLIC_BROWSE_FILTER_DEFAULTS = { angle: undefined, grade: undefined } as const
export const browseProblems = (problems: Problem[], filter: Partial<Pick<Problem, 'wallId' | 'angle' | 'grade'>>, _legacyQuery?: string) => filterProblems(problems, filter)

export function routeContextFromOptions(options: Record<string, unknown>): Partial<Pick<Problem, 'angle' | 'grade'>> {
  const result: Partial<Pick<Problem, 'angle' | 'grade'>> = {}
  if (options.angle !== undefined && options.angle !== null && options.angle !== '' && Number.isFinite(Number(options.angle))) result.angle = Number(options.angle)
  if (/^V([0-9]|1[0-6])$/.test(String(options.grade))) result.grade = String(options.grade) as Problem['grade']
  return result
}
export function routeContextQuery(options: Record<string, unknown>): string {
  const context = routeContextFromOptions(options)
  return Object.entries(context).map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&')
}
