import type { Problem } from './types.js'
import { filterProblems } from './routes.js'
export const PUBLIC_BROWSE_FILTER_DEFAULTS = { angle: undefined, grade: undefined } as const
export const browseProblems = (problems: Problem[], filter: Partial<Pick<Problem, 'wallId' | 'angle' | 'grade'>>, _legacyQuery?: string) => filterProblems(problems, filter)
