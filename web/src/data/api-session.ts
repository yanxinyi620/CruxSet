import type { Hold, Problem, Wall } from '../../../miniprogram/domain/types.js'
import { LocalApiClient } from '../api.js'
import { PreviewSession, type CreateWallInput } from './preview-session.js'
export class ApiSession extends PreviewSession {
  private walls: Wall[] = []; private problems: Problem[] = []
  constructor(private api: LocalApiClient) { super() }
  async refresh() { const data = await this.api.loadBrowseData(); this.walls = data.walls as Wall[]; this.problems = data.problems as Problem[] }
  override async listWalls() { return this.walls.filter(wall => wall.visibility === 'public') }
  override async listMyWalls() { return this.walls }
  override async getWall(id: string) { const wall = this.walls.find(item => item.id === id); if (!wall) throw new Error('WALL_NOT_FOUND'); return wall }
  override async listProblems(filter: Partial<Pick<Problem, 'wallId' | 'angle' | 'grade'>> = {}) { return this.problems.filter(problem => Object.entries(filter).every(([key, value]) => value === undefined || problem[key as keyof Problem] === value)) }
  override async createWall(data: CreateWallInput) { if (!data.image) throw new Error('WALL_IMAGE_REQUIRED'); const wall = await this.api.createWall({ name: data.name, image: data.image, imageWidth: data.imageWidth, imageHeight: data.imageHeight }); await this.refresh(); return wall }
  override async updateWallHolds(id: string, holds: Hold[]) { await this.api.saveWallHolds(id, holds); await this.refresh(); return this.getWall(id) }
  override async publishWall(id: string) { await this.api.publishWall(id); await this.refresh(); return this.getWall(id) }
  override async createProblem(wallId: string, draft: Partial<Problem>) { const result = await this.api.createProblem({ wallId, angle: draft.angle ?? 20, grade: draft.grade ?? 'V0', footRule: draft.footRule ?? 'feet_follow', name: draft.name || undefined, description: draft.description || undefined, holds: (draft.holds ?? {}) as Record<string, string[]> }); await this.refresh(); return result.problem as Problem }
  override async deleteProblem(id: string) { await this.api.deleteProblem(id); await this.refresh(); return { ok: true } }
  override async deleteWall(id: string) { await this.api.deleteWall(id); await this.refresh(); return { ok: true } }
}
