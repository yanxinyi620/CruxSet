import { describe, expect, it } from 'vitest'
import { PreviewStore } from '../dev-preview/src/preview-store.js'

describe('PreviewStore', () => {
  it('requires two explicit confirmations before a wall is deleted', async () => {
    const store = new PreviewStore()
    const wall = await store.createWall({ name: '待删除墙面' })
    store.requestWallDeletion(wall.id)
    expect(store.state.dialog?.step).toBe(1)
    await store.confirmDialog()
    expect(store.state.dialog?.step).toBe(2)
    await store.confirmDialog()
    await expect(store.session.getWall(wall.id)).rejects.toThrow('WALL_NOT_FOUND')
  })
})
