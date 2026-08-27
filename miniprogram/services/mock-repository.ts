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
  async listLayouts(wallId: string) { return clone(this.layouts.filter(item => item.wallId === wallId).sort((a, b) => b.updatedAt - a.updatedAt)) }
  async updateWall(id: string, patch: Partial<Wall>) { const wall = this.walls.find(item => item.id === id); if (!wall || wall.ownerId !== mockCurrentUserId) throw new Error('FORBIDDEN'); Object.assign(wall, patch, { id: wall.id, ownerId: wall.ownerId, updatedAt: Date.now() }); return clone(wall) }
}

export const createMockRepository = () => new MockRepository()
