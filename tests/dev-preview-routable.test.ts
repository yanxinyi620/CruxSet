import { describe, expect, it } from 'vitest'
import { PreviewSession } from '../web/src/data/preview-session.js'

describe('routable walls', () => {
  it('lists public walls directly and excludes private drafts', async () => {
    const session = new PreviewSession()
    const result = await session.listWalls()
    expect(result.every(wall => wall.visibility === 'public')).toBe(true)
    expect(result.every(wall => wall.holds.length >= 2)).toBe(true)
  })
})
