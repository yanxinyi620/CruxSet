import type { Hold, Problem, Wall } from '../../../miniprogram/domain/types.js'
import { LocalApiClient } from '../api.js'
import { PreviewSession, type CreateWallInput } from './preview-session.js'
export class ApiSession extends PreviewSession {
  private walls: Wall[] = []; private problems: Problem[] = []; private currentUserId: string | null = null
  constructor(private api: LocalApiClient) { super() }
  async refresh() { const [data, user] = await Promise.all([this.api.loadBrowseData(), this.api.currentUser()]); this.walls = structuredClone(data.walls) as Wall[]; this.problems = structuredClone(data.problems) as Problem[]; this.currentUserId = user?.id ?? null }
  override async listWalls() { return structuredClone(this.walls.filter(wall => wall.visibility === 'public')) }
  override async listMyWalls() { return structuredClone(this.walls.filter(wall => wall.ownerId === this.currentUserId)) }
  override async getWall(id: string) { const wall = this.walls.find(item => item.id === id); if (!wall) throw new Error('WALL_NOT_FOUND'); return structuredClone(wall) }
  override async listProblems(filter: Partial<Pick<Problem, 'wallId' | 'angle' | 'grade'>> = {}) { return structuredClone(this.problems.filter(problem => Object.entries(filter).every(([key, value]) => value === undefined || problem[key as keyof Problem] === value))) }
  override async createWall(data: CreateWallInput) { if (!data.image) throw new Error('WALL_IMAGE_REQUIRED'); const wall = await this.api.createWall({ name: data.name, image: data.image, imageWidth: data.imageWidth, imageHeight: data.imageHeight }); await this.refresh(); return wall }
  override async updateWallHolds(id: string, holds: Hold[]) { await this.api.saveWallHolds(id, holds); await this.refresh(); return this.getWall(id) }
  override async publishWall(id: string, holds: Hold[]) { await this.api.saveWallHolds(id, holds); try { await this.api.publishWall(id) } catch (error) { await this.refresh(); throw error } await this.refresh(); return this.getWall(id) }
  override async createProblem(wallId: string, draft: Partial<Problem>) { const result = await this.api.createProblem({ wallId, angle: draft.angle ?? 20, grade: draft.grade ?? 'V0', footRule: draft.footRule ?? 'feet_follow', name: draft.name || undefined, description: draft.description || undefined, holds: (draft.holds ?? {}) as Record<string, string[]> }); await this.refresh(); return result.problem as Problem }
  override async deleteProblem(id: string) { await this.api.deleteProblem(id); await this.refresh(); return { ok: true } }
  override async deleteWall(id: string): Promise<{ ok: true }> { await this.api.deleteWall(id); await this.refresh(); return { ok: true as const } }
}
