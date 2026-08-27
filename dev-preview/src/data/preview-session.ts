import { createMockRepository } from '../../../miniprogram/services/mock-repository.js'
import type { Hold, Layout, Problem, Wall } from '../../../miniprogram/domain/types.js'

export type CreateLayoutInput = Pick<Layout, 'name' | 'imageFileId' | 'imageWidth' | 'imageHeight'> & Partial<Pick<Layout, 'geometryType'>>

export class PreviewSession {
  private repository = createMockRepository()

  reset() { this.repository = createMockRepository() }
  listWalls() { return this.repository.listWalls() }
  listMyWalls() { return this.repository.listMyWalls() }
  getWall(id: string) { return this.repository.getWall(id) }
  listLayouts(wallId: string) { return this.repository.listLayouts(wallId) }
  getLayout(id: string) { return this.repository.getLayout(id) }
  listProblems(filter: Partial<Pick<Problem, 'wallId' | 'layoutId' | 'angle' | 'grade'>> = {}) { return this.repository.listProblems(filter) }
  createWall(data: Partial<Wall>) { return this.repository.createWall(data) }
  createLayout(wallId: string, data: CreateLayoutInput) { return this.repository.createLayout(wallId, data) }
  updateLayout(wallId: string, layoutId: string, holds: Hold[]) { return this.repository.updateLayout(wallId, layoutId, holds) }
  publishLayout(wallId: string, layoutId: string, holds: Hold[]) { return this.repository.publishLayout(wallId, layoutId, holds) }
  createProblem(wallId: string, layoutId: string, draft: Partial<Problem>) { return this.repository.createProblem(wallId, layoutId, draft) }
  deleteProblem(id: string) { return this.repository.deleteProblem(id) }
  deleteLayout(wallId: string, layoutId: string) { return this.repository.deleteLayout(wallId, layoutId) }
  deleteWall(wallId: string) { return this.repository.deleteWall(wallId) }
}
