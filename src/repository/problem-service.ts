import { createId } from '../domain/ids.js'
import { createProblem, type ProblemDraft } from '../domain/routes.js'
import type { Problem, Wall } from '../domain/types.js'
import type { ProblemRepository } from './problem-repository.js'
import { MemoryProblemRepository } from './memory-repository.js'

export const createProblemNumber = (wallNumberOrCounter: number, routeSequence?: number) => {
  if (routeSequence === undefined) return `CS-${String(wallNumberOrCounter + 1).padStart(6, '0')}`
  return `CS-${String(wallNumberOrCounter).padStart(2, '0')}${String(routeSequence).padStart(4, '0')}`
}
export interface SaveProblemInput { wall: Wall; draft: Omit<ProblemDraft, 'id'|'number'> }

export class MemoryProblemService {
  private readonly repository: ProblemRepository
  private counter: number
  constructor(options: { nextNumber?: number; repository?: ProblemRepository } = {}) { this.counter = options.nextNumber ?? 0; this.repository = options.repository ?? new MemoryProblemRepository() }
  async save(input: SaveProblemInput): Promise<Problem> { const existing = await this.repository.getAll(); const routeSequence = Math.max(0, ...existing.filter(problem => problem.wallId === input.wall.id).map(problem => Number(problem.number.slice(-4)) || 0)) + 1; const wallNumber = Number((input.wall as Wall & { number?: string }).number) || 1; const number = createProblemNumber(wallNumber, routeSequence); const problem = createProblem({ ...input.draft, id: createId('problem'), number }, input.wall); await this.repository.create(problem); this.counter += 1; return problem }
  list() { return this.repository.getAll() }
}
