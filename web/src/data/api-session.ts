import type { Hold, Problem, Wall } from '../../../wechat/miniprogram/domain/types.js'
import { LocalApiClient, type BootstrapData } from '../api.js'
export type CreateWallInput = Pick<Wall, 'name' | 'imageWidth' | 'imageHeight'> & Partial<Pick<Wall, 'description' | 'imageFileId' | 'displayImageFileId' | 'geometryType' | 'angleOptions'>> & { image?: File }

const normalizeWall = (wall: unknown): Wall => {
  const value = wall as Partial<Wall>
  return { ...value, holds: Array.isArray(value.holds) ? value.holds : [] } as Wall
}

export class ApiSession {
  private walls: Wall[] = []; private problems: Problem[] = []; private currentUserId: string | null = null
  constructor(private api: LocalApiClient) {}
  private replaceWall(wall: Wall) { this.walls = [...this.walls.filter(item => item.id !== wall.id), structuredClone(normalizeWall(wall))] }
  private replaceProblem(problem: Problem) { this.problems = [...this.problems.filter(item => item.id !== problem.id), structuredClone(problem)] }
  private removeProblem(id: string) { this.problems = this.problems.filter(problem => problem.id !== id) }
  private removeWall(id: string) { this.walls = this.walls.filter(wall => wall.id !== id); this.problems = this.problems.filter(problem => problem.wallId !== id) }
  async refresh(snapshot?: BootstrapData) { const data = snapshot ?? await this.api.loadBootstrap(); this.walls = structuredClone(data.walls.map(normalizeWall)); this.problems = structuredClone(data.problems) as Problem[]; this.currentUserId = data.user?.id ?? null; if (data.user?.isAdmin) this.walls = structuredClone((await this.api.loadAdminWalls()).map(normalizeWall)) }
  async listWalls() { return structuredClone(this.walls.filter(wall => wall.visibility === 'public')) }
  async listMyWalls() { return structuredClone(this.walls.filter(wall => wall.ownerId === this.currentUserId)) }
  async getWall(id: string) { const wall = this.walls.find(item => item.id === id); if (!wall) throw new Error('WALL_NOT_FOUND'); return structuredClone(wall) }
  async listProblems(filter: Partial<Pick<Problem, 'wallId' | 'angle' | 'grade'>> = {}) { return structuredClone(this.problems.filter(problem => Object.entries(filter).every(([key, value]) => value === undefined || problem[key as keyof Problem] === value))) }
  async createWall(data: CreateWallInput) { if (!data.image) throw new Error('WALL_IMAGE_REQUIRED'); const wall = await this.api.createWall({ name: data.name, image: data.image, imageWidth: data.imageWidth, imageHeight: data.imageHeight }); this.replaceWall(wall); return wall }
  async updateWallHolds(id: string, holds: Hold[]) { const result = await this.api.saveWallHolds(id, holds); this.replaceWall(result.wall); return this.getWall(id) }
  async publishWall(id: string, holds: Hold[]) { const saved = await this.api.saveWallHolds(id, holds); this.replaceWall(saved.wall); try { const published = await this.api.publishWall(id); this.replaceWall(published.wall) } catch (error) { throw error } return this.getWall(id) }
  async createProblem(wallId: string, draft: Partial<Problem>) { const result = await this.api.createProblem({ wallId, angle: draft.angle ?? 20, grade: draft.grade ?? 'V0', footRule: draft.footRule ?? 'feet_follow', name: draft.name || undefined, description: draft.description || undefined, holds: (draft.holds ?? {}) as Record<string, string[]> }); const problem = result.problem as Problem; this.replaceProblem(problem); return problem }
  async deleteProblem(id: string) { await this.api.deleteProblem(id); this.removeProblem(id); return { ok: true } }
  async updateProblem(id: string, input: Partial<Problem>) { const result = await this.api.updateProblem(id, { angle: input.angle ?? 20, grade: input.grade ?? 'V0', footRule: input.footRule ?? 'feet_follow', name: input.name, description: input.description, holds: input.holds as Record<string, string[]> | undefined }); this.replaceProblem(result.problem as unknown as Problem); return result.problem as unknown as Problem }
  async deleteWall(id: string): Promise<{ ok: true }> { await this.api.deleteWall(id); this.removeWall(id); return { ok: true as const } }
}
