import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toPreviewUrl, type PreviewRoute } from '../web/src/routes.js'
import { wallHoldAt } from '../web/src/wall-canvas.js'

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
})
