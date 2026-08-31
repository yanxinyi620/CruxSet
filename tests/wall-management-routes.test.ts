import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toPreviewUrl, type PreviewRoute } from '../web/src/routes.js'
import { imageUrlFor, projectHoldPoint, wallHoldAt } from '../web/src/wall-canvas.js'

describe('wall-only web routes', () => {
  it.each<[PreviewRoute, string]>([
    [{ name: 'browse' }, '/'],
    [{ name: 'create' }, '/create'],
    [{ name: 'me' }, '/me'],
    [{ name: 'wall', wallId: 'wall 1' }, '/wall/wall%201'],
    [{ name: 'wall-editor', wallId: 'wall 1' }, '/wall-editor/wall%201'],
    [{ name: 'problem-editor', wallId: 'wall 1' }, '/problem-editor/wall%201'],
    [{ name: 'problem-detail', problemId: 'problem 1' }, '/problem/problem%201'],
  ])('maps %o to %s without a layout identifier', (route, url) => {
    expect(toPreviewUrl(route)).toBe(url)
  })

  it('contains no legacy layout domain wording in web UI sources', () => {
    const files = [
      'web/src/main.ts', 'web/src/routes.ts', 'web/src/candidate-editor.ts',
      'web/src/draft-canvas.ts', 'web/src/wall-canvas.ts', 'web/src/styles/editor.css',
    ]
    const source = files.map(file => readFileSync(file, 'utf8')).join('\n')
    expect(source).not.toMatch(/Layout|布局版本|当前布局/)
  })

  it('keeps polygon holds hittable away from their center point', () => {
    const polygon = { id: 'V1', x: .5, y: .5, radius: .01, kind: 'volume' as const, polygon: [[.1,.1],[.4,.1],[.4,.4],[.1,.4]] as [number,number][] }
    expect(wallHoldAt([.2,.2], [polygon], .02)?.id).toBe('V1')
  })

  it('resolves stored media identifiers and projects segmentation pixels onto the canvas', () => {
    expect(imageUrlFor('media_wall.png')).toBe('/api/v1/media/media_wall.png')
    expect(imageUrlFor('/api/v1/media/media_wall.png')).toBe('/api/v1/media/media_wall.png')
    expect(projectHoldPoint([600, 300], 360, 1200, true)).toEqual([180, 90])
  })

  it('renders a read-only wall preview before creating a route', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('id="wall-preview"')
    expect(source).toContain("polygonCoordinates: selected.geometryType === 'polygon' ? 'pixels' : 'normalized'")
  })

  it('only offers route creation for walls with enough holds', () => {
    expect(readFileSync('web/src/main.ts', 'utf8')).toContain('publicWalls.filter((w) => w.holds.length >= 2)')
  })

  it('starts route creation from the create tab instead of a wall detail', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('data-panel="new-route"')
    expect(source).toContain('panel === "new-route"')
  })
})
