import type { Problem } from '../domain/types.js'
import type { ProblemRepository } from './problem-repository.js'
export class MemoryProblemRepository implements ProblemRepository {
  private readonly items = new Map<string, Problem>()
  async create(problem: Problem) { if (this.items.has(problem.number)) throw new Error('duplicate route number'); this.items.set(problem.number, problem); return problem }
  async getAll() { return [...this.items.values()].sort((a,b) => a.number.localeCompare(b.number)) }
  async getByNumber(number: string) { return this.items.get(number) }
}
