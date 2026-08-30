import { createId } from '../domain/ids.js'
import { createProblem, type ProblemDraft } from '../domain/routes.js'
import type { Problem, Wall } from '../domain/types.js'
import type { ProblemRepository } from './problem-repository.js'
import { MemoryProblemRepository } from './memory-repository.js'

export const createProblemNumber = (counter: number) => `CS-${String(counter + 1).padStart(6, '0')}`
export interface SaveProblemInput { wall: Wall; draft: Omit<ProblemDraft, 'id'|'number'> }

export class MemoryProblemService {
  private readonly repository: ProblemRepository
  private counter: number
  constructor(options: { nextNumber?: number; repository?: ProblemRepository } = {}) { this.counter = options.nextNumber ?? 0; this.repository = options.repository ?? new MemoryProblemRepository() }
  async save(input: SaveProblemInput): Promise<Problem> { const number = createProblemNumber(this.counter); const problem = createProblem({ ...input.draft, id: createId('problem'), number }, input.wall); await this.repository.create(problem); this.counter += 1; return problem }
  list() { return this.repository.getAll() }
}
