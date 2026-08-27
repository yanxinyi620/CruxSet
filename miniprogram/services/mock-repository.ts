import { demoLayout, demoWall } from '../data/demo.js'
import { demoProblems } from '../data/demo-problems.js'
import type { Layout, Problem, Wall } from '../domain/types.js'

export const mockCurrentUserId = 'usr_mock_owner'
const localImage = '/assets/mock/ritan-spraywall-0822.jpg'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export class MockRepository {
  private walls: Wall[]
  private layouts: Layout[]
  private problems: Problem[]

  constructor() {
    const mockWall: Wall = { id: 'wall_mock_ritan', name: '日坛 Spraywall · 本地标注草稿', description: '本地 Mock 固定测试墙面', activeLayoutId: '', angleOptions: [20, 25, 30, 35, 40, 45], ownerId: mockCurrentUserId, visibility: 'private', createdAt: 1, updatedAt: 1 }
    const mockLayout: Layout = { id: 'layout_mock_ritan_draft', wallId: mockWall.id, name: '2026-08 本地草稿', imageFileId: localImage, imageWidth: 4096, imageHeight: 3072, geometryType: 'circle', version: 1, published: false, holds: [], createdAt: 1, updatedAt: 1 }
    this.walls = clone([demoWall, mockWall])
    this.layouts = clone([demoLayout, mockLayout])
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
  async uploadWallImage(filePath: string) { return { fileID: filePath } }
  async getLayoutImageUrl(fileID: string) { return fileID }
}

export const createMockRepository = () => new MockRepository()
