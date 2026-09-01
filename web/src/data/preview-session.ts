import type { Hold, Problem } from '../../../miniprogram/domain/types.js'
import { PreviewRepository, type CreateWallInput } from './preview-repository.js'
export type { CreateWallInput } from './preview-repository.js'
export class PreviewSession {
  private repository = new PreviewRepository()
  reset() { this.repository = new PreviewRepository() }
  listWalls() { return this.repository.listWalls() }
  listMyWalls() { return this.repository.listMyWalls() }
  getWall(id: string) { return this.repository.getWall(id) }
  listProblems(filter: Partial<Pick<Problem, 'wallId' | 'angle' | 'grade'>> = {}) { return this.repository.listProblems(filter) }
  createWall(data: CreateWallInput) { return this.repository.createWall(data) }
  updateWallHolds(id: string, holds: Hold[]) { return this.repository.updateWallHolds(id, holds) }
  publishWall(id: string, holds: Hold[]) { return this.repository.publishWall(id, holds) }
  createProblem(id: string, draft: Partial<Problem>) { return this.repository.createProblem(id, draft) }
  deleteProblem(id: string) { return this.repository.deleteProblem(id) }
  async updateProblem(id: string, input: Partial<Problem>) { const problem = (await this.repository.listProblems()).find(item => item.id === id); if (!problem) throw new Error('PROBLEM_NOT_FOUND'); Object.assign(problem, input, { id: problem.id, number: problem.number, updatedAt: Date.now() }); return problem }
  deleteWall(id: string): Promise<{ ok: true }> { return this.repository.deleteWall(id) }
}
