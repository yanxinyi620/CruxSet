import type { Problem } from './types.js'
import { filterProblems, searchProblems } from './routes.js'

export function browseProblems(problems: Problem[], filter: Partial<Pick<Problem, 'wallId'|'angle'|'grade'>>, query = ''): Problem[] { return searchProblems(filterProblems(problems, filter), query) }
export function adjacentProblem(problems: Problem[], currentNumber: string, direction: -1 | 1): Problem | undefined { const index = problems.findIndex(problem => problem.number === currentNumber); return index < 0 ? undefined : problems[index + direction] }
