import type { Hold, Layout, Problem, Wall } from '../../../miniprogram/domain/types.js'
import { LocalApiClient } from '../api.js'
import { PreviewSession, type CreateLayoutInput } from './preview-session.js'

/**
 * Web 会话：读与写全部走本地 FastAPI（SQLite），不再回落内存 Mock。
 * 每次写操作后刷新本地缓存，保证后续读取反映真实数据。
 */
export class ApiSession extends PreviewSession {
  private walls: Wall[] = []
  private layouts: Layout[] = []
  private problems: Problem[] = []

  constructor(private api: LocalApiClient) { super() }

  async refresh() {
    const data = await this.api.loadBrowseData()
    this.walls = data.walls as Wall[]
    this.layouts = data.layouts as Layout[]
    this.problems = data.problems as Problem[]
  }

  override async listWalls() { return this.walls.filter(wall => wall.visibility === 'public') }
  override async listMyWalls() { return this.walls }
  override async getWall(id: string) { const wall = this.walls.find(item => item.id === id); if (!wall) throw new Error('WALL_NOT_FOUND'); return wall }
  override async listLayouts(wallId: string) { return this.layouts.filter(layout => layout.wallId === wallId) }
  override async getLayout(id: string) { const layout = this.layouts.find(item => item.id === id); if (!layout) throw new Error('LAYOUT_NOT_FOUND'); return layout }
  override async listProblems(filter: Partial<Pick<Problem, 'wallId'|'layoutId'|'angle'|'grade'>> = {}) { return this.problems.filter(problem => Object.entries(filter).every(([key, value]) => value === undefined || problem[key as keyof Problem] === value)) }

  override async createLayout(wallId: string, data: CreateLayoutInput) {
    const result = await this.api.createLayout(wallId, data)
    await this.refresh()
    return result.layout as Layout
  }

  override async createProblem(wallId: string, layoutId: string, draft: Partial<Problem>) {
    const result = await this.api.createProblem({
      wallId, layoutId,
      angle: draft.angle ?? 20,
      grade: draft.grade ?? 'V0',
      footRule: draft.footRule ?? 'feet_follow',
      name: draft.name || undefined,
      description: draft.description || undefined,
      holds: (draft.holds ?? {}) as Record<string, string[]>,
    })
    await this.refresh()
    return result.problem
  }

  override async updateLayout(wallId: string, layoutId: string, holds: Hold[]) {
    await this.api.saveLayoutHolds(layoutId, holds)
    await this.refresh()
    return this.getLayout(layoutId)
  }

  override async publishLayout(wallId: string, layoutId: string, holds: Hold[]) {
    await this.api.publishLayout(layoutId, holds)
    await this.refresh()
    return this.getLayout(layoutId)
  }

  override async deleteProblem(id: string) {
    await this.api.deleteProblem(id)
    await this.refresh()
    return { ok: true }
  }

  override async deleteLayout(wallId: string, layoutId: string) {
    await this.api.deleteLayout(layoutId)
    await this.refresh()
    return { ok: true }
  }

  override async deleteWall(wallId: string) {
    await this.api.deleteWall(wallId)
    await this.refresh()
    return { ok: true }
  }
}