import type { Layout, Problem, Wall } from '../../../miniprogram/domain/types.js'
import { LocalApiClient } from '../api.js'
import { PreviewSession } from './preview-session.js'

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
}
