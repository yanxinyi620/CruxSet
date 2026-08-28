import { describe, expect, it } from 'vitest'
import { PreviewSession } from '../web/src/data/preview-session.js'
import { listRoutableLayouts } from '../web/src/data/preview-repository.js'

describe('listRoutableLayouts', () => {
  it('excludes unpublished zero-hold drafts', async () => {
    const session = new PreviewSession()
    const result = await listRoutableLayouts(session, await session.listMyWalls())
    expect(result.some(item => item.layout.name === '2026-08 本地草稿')).toBe(false)
  })
})
