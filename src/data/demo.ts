import type { Hold, Wall } from '../domain/types.js'

const holds: Hold[] = Array.from({ length: 24 }, (_, i) => ({
  id: `H${String(i + 1).padStart(3, '0')}`,
  x: 0.12 + (i % 6) * 0.15,
  y: 0.12 + Math.floor(i / 6) * 0.2,
  radius: 0.018,
  kind: i === 17 ? 'volume' : 'hold',
}))

export const demoWall: Wall = { id: 'wall_demo', name: '日坛 Spraywall', description: 'CruxSet 示例训练墙', imageFileId: '/assets/mock/ritan-spraywall-0822.jpg', imageWidth: 4096, imageHeight: 3072, geometryType: 'circle', holds, angleOptions: [20, 25, 30, 35, 40, 45], ownerId: 'usr_demo', visibility: 'public', createdAt: 0, updatedAt: 0 }
