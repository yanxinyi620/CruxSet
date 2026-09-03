import type { Hold, Wall } from '../domain/types.js'
const holds: Hold[] = Array.from({ length: 24 }, (_, i) => ({ id: `H${String(i + 1).padStart(3, '0')}`, x: .12 + (i % 6) * .15, y: .12 + Math.floor(i / 6) * .2, radius: .018, kind: i === 17 ? 'volume' : 'hold' }))
export const demoWall: Wall = { id: 'wall_demo', name: '日坛 Spraywall', description: 'CruxSet 固定测试墙面', imageFileId: '/assets/mock/ritan-spraywall-0822.jpg', imageWidth: 4096, imageHeight: 3072, geometryType: 'circle', holds, angleOptions: [20,25,30,35,40,45], ownerId: 'usr_mock_owner', visibility: 'public', createdAt: 0, updatedAt: 0 }
const polygonHolds: Hold[] = holds.slice(0, 12).map((hold, index) => {
  const size = 0.025
  return { ...hold, id: `P${String(index + 1).padStart(3, '0')}`, polygon: [[hold.x - size, hold.y], [hold.x, hold.y - size], [hold.x + size, hold.y], [hold.x, hold.y + size]], bbox: [hold.x - size, hold.y - size, hold.x + size, hold.y + size] }
})
export const demoPolygonWall: Wall = { ...demoWall, id: 'wall_demo_polygon', name: 'Polygon 训练墙（示例）', description: '用于浏览 Polygon 岩点的本地示例墙面', geometryType: 'polygon', holds: polygonHolds }
export const demoDraftWall: Wall = { ...demoWall, id: 'wall_demo_draft', name: '日坛 Spraywall 标注草稿', holds: [], visibility: 'private', createdAt: 1, updatedAt: 1 }
