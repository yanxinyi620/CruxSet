import { demoDraftLayout, demoLayout, demoWall } from '../data/demo.js'
import { demoProblems } from '../data/demo-problems.js'
import type { Layout, Problem, Wall } from '../domain/types.js'

export const mockCurrentUserId = 'usr_mock_owner'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export class MockRepository {
  private walls: Wall[]
  private layouts: Layout[]
  private problems: Problem[]

  constructor() {
    this.walls = clone([demoWall])
    this.layouts = clone([demoLayout, demoDraftLayout])
    this.problems = clone(demoProblems)
  }

  async listWalls() { return clone(this.walls.filter(wall => wall.visibility === 'public')) }
  async listMyWalls() { return clone(this.walls.filter(wall => wall.ownerId === mockCurrentUserId)) }
  async getWall(id: string) { const wall = this.walls.find(item => item.id === id); if (!wall) throw new Error('WALL_NOT_FOUND'); return clone(wall) }
  async getLayout(id: string, version?: number) { const layouts = this.layouts.filter(item => item.id === id && (version === undefined || item.version === version)); const layout = layouts.sort((a, b) => b.version - a.version)[0]; if (!layout) throw new Error('LAYOUT_NOT_FOUND'); return clone(layout) }
  async listLayouts(wallId: string) { const latest = new Map<string, Layout>(); this.layouts.filter(item => item.wallId === wallId).forEach(layout => { const current = latest.get(layout.id); if (!current || current.version < layout.version) latest.set(layout.id, layout) }); return clone([...latest.values()].sort((a, b) => b.updatedAt - a.updatedAt)) }
  async updateWall(id: string, patch: Partial<Wall>) { const wall = this.walls.find(item => item.id === id); if (!wall || wall.ownerId !== mockCurrentUserId) throw new Error('FORBIDDEN'); Object.assign(wall, patch, { id: wall.id, ownerId: wall.ownerId, updatedAt: Date.now() }); return clone(wall) }
  async createWall(data: Partial<Wall>) { const now = Date.now(), id = `wall_mock_${now}`; const wall: Wall = { id, name: data.name || '未命名墙面', description: data.description || '', activeLayoutId: '', angleOptions: data.angleOptions || [20, 25, 30, 35, 40, 45], ownerId: mockCurrentUserId, visibility: data.visibility === 'public' ? 'public' : 'private', createdAt: now, updatedAt: now }; this.walls.push(wall); return { id } }
  async createLayout(wallId: string, data: Pick<Layout, 'name' | 'imageFileId' | 'imageWidth' | 'imageHeight'> & Partial<Pick<Layout, 'geometryType'>>) { const wall = await this.getWall(wallId); if (wall.ownerId !== mockCurrentUserId) throw new Error('FORBIDDEN'); const now = Date.now(), id = `layout_mock_${now}_${this.layouts.length}`; const layout: Layout = { id, wallId, name: data.name, imageFileId: data.imageFileId, imageWidth: data.imageWidth, imageHeight: data.imageHeight, geometryType: data.geometryType || 'circle', version: 1, published: false, holds: [], createdAt: now, updatedAt: now }; this.layouts.push(layout); return clone(layout) }
  private async writeLayout(wallId: string, layoutId: string, holds: Layout['holds'], publish: boolean) { const wall = await this.getWall(wallId); if (wall.ownerId !== mockCurrentUserId) throw new Error('FORBIDDEN'); const current = await this.getLayout(layoutId); if (current.wallId !== wallId) throw new Error('INVALID_LAYOUT_DATA'); if (current.published) throw new Error('LAYOUT_LOCKED'); const next: Layout = { ...current, holds: clone(holds), version: current.version + 1, published: publish, updatedAt: Date.now() }; this.layouts.push(next); if (publish) { const target = this.walls.find(item => item.id === wallId)!; target.activeLayoutId = layoutId; target.updatedAt = next.updatedAt } return clone(next) }
  async updateLayout(wallId: string, layoutId: string, holds: Layout['holds']) { return this.writeLayout(wallId, layoutId, holds, false) }
  async publishLayout(wallId: string, layoutId: string, holds: Layout['holds']) { return this.writeLayout(wallId, layoutId, holds, true) }
  async listProblems(filter: Partial<Pick<Problem, 'wallId' | 'layoutId' | 'angle' | 'grade'>> = {}) { return clone(this.problems.filter(problem => Object.entries(filter).every(([key, value]) => value === undefined || problem[key as keyof Problem] === value)).sort((a, b) => a.number.localeCompare(b.number))) }
  async listMyProblems() { return clone(this.problems.filter(problem => problem.createdBy === mockCurrentUserId).sort((a, b) => b.createdAt - a.createdAt)) }
  async getProblem(id: string) { const problem = this.problems.find(item => item.id === id); if (!problem) throw new Error('PROBLEM_NOT_FOUND'); return clone(problem) }
  async createProblem(wallId: string, layoutId: string, draft: Partial<Problem>) { const wall = await this.getWall(wallId), layout = await this.getLayout(layoutId); if (layout.wallId !== wall.id) throw new Error('INVALID_LAYOUT_DATA'); if (!layout.published || wall.activeLayoutId !== layout.id || layout.holds.length < 2) throw new Error('LAYOUT_NOT_ROUTABLE'); const now = Date.now(), sequence = this.problems.length + 121, problem: Problem = { id: `problem_mock_${now}`, number: `CS-${String(sequence).padStart(6, '0')}`, wallId, layoutId, layoutVersion: layout.version, name: draft.name, description: draft.description, angle: draft.angle || wall.angleOptions[0], grade: draft.grade || 'V0', footRule: draft.footRule || 'feet_follow', holds: { start: draft.holds?.start || [], foot: draft.holds?.foot || [], hand: draft.holds?.hand || [], assist: draft.holds?.assist || [], finish: draft.holds?.finish || [] }, createdBy: mockCurrentUserId, createdAt: now, updatedAt: now }; this.problems.push(problem); return { id: problem.id, number: problem.number } }
  async deleteProblem(id: string) { const index = this.problems.findIndex(item => item.id === id); if (index < 0) throw new Error('PROBLEM_NOT_FOUND'); if (this.problems[index].createdBy !== mockCurrentUserId) throw new Error('FORBIDDEN'); this.problems.splice(index, 1); return { ok: true } }
  async deleteLayout(wallId: string, layoutId: string) { const wall = await this.getWall(wallId); if (wall.ownerId !== mockCurrentUserId) throw new Error('FORBIDDEN'); const layout = await this.getLayout(layoutId); if (layout.wallId !== wallId) throw new Error('INVALID_LAYOUT_DATA'); this.layouts = this.layouts.filter(item => item.id !== layoutId); this.problems = this.problems.filter(item => item.layoutId !== layoutId); if (wall.activeLayoutId === layoutId) Object.assign(this.walls.find(item => item.id === wallId)!, { activeLayoutId: '', updatedAt: Date.now() }); return { ok: true } }
  async deleteWall(wallId: string) { const wall = await this.getWall(wallId); if (wall.ownerId !== mockCurrentUserId) throw new Error('FORBIDDEN'); this.walls = this.walls.filter(item => item.id !== wallId); this.layouts = this.layouts.filter(item => item.wallId !== wallId); this.problems = this.problems.filter(item => item.wallId !== wallId); return { ok: true } }
  async uploadWallImage(filePath: string) { return { fileID: filePath } }
  async getLayoutImageUrl(fileID: string) { return fileID }
}

export const createMockRepository = () => new MockRepository()
const activeRepository = createMockRepository()
export const repositoryForMode = (mode: 'mock' | 'cloudbase') => mode === 'mock' ? activeRepository : undefined
export const mockRepository = activeRepository
