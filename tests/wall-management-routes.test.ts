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
    [{ name: 'route-browser', wallId: 'wall 1' }, '/wall/wall%201/routes'],
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
  expect(source).toContain('polygonCoordinates: "normalized"')
  })

  it('only offers route creation for walls with enough holds', () => {
    expect(readFileSync('web/src/main.ts', 'utf8')).toContain('publicWalls.filter((w) => w.holds.length >= 2)')
  })

  it('starts route creation from the create tab instead of a wall detail', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('data-panel="new-route"')
  expect(source).toContain('panel === "new-route"')
  expect(source).toContain('panel = b.dataset.panel as typeof panel')
  expect(source).toContain('syncUiUrl()')
  })

  it('keeps route browsing behind an explicit wall-detail entry', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('data-open-route-browser')
    expect(source).toContain('data-route-angle')
    expect(source).toContain('data-route-grade')
    expect(source).toContain('data-route-previous')
    expect(source).toContain('data-route-next')
  })

  it('offers a profile page with email-derived name and logout', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('data-panel="profile"')
    expect(source).toContain('data-logout')
    expect(source).toContain('profileEmail.split("@", 1)[0]')
  })

  it('keeps route detail metadata and notes above a stable pager', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('h(selectedRoute.number)} ${h(selectedRoute.name || "")}')
    expect(source).toContain('footLabels[selectedRoute.footRule]')
    expect(source).toContain('class="route-note"')
  })

  it('opens fullscreen from the route canvas without a visible text prompt', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('onTapCanvas: openRouteFullscreen')
    expect(source).not.toContain('点击查看全屏')
    expect(source).toContain('id="route-fullscreen-preview"')
    expect(source).toContain('data-close-route-fullscreen')
    expect(source).toContain('viewportHeight: window.innerHeight')
  })

  it('closes open dialogs when the backdrop is clicked', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('event.target === dialog')
    expect(source).toContain('dialog.close()')
  })

  it('disables browser autofill suggestions in the route save dialog', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('autocomplete="off" autocapitalize="off"')
    expect(source).toContain('autocomplete="new-password"')
  })

  it('opens the save dialog before sizing its full-wall route preview', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    const openDialog = source.indexOf('saveDialog.showModal()')
    const createPreview = source.indexOf('new WallCanvasView(preview,')
    expect(openDialog).toBeGreaterThan(-1)
    expect(createPreview).toBeGreaterThan(openDialog)
  })

  it('clears the prior save preview before creating a new canvas', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    const clearPreview = source.indexOf('preview.replaceChildren()')
    const createPreview = source.indexOf('new WallCanvasView(preview,')
    expect(clearPreview).toBeGreaterThan(-1)
    expect(createPreview).toBeGreaterThan(clearPreview)
  })

  it('keeps the uploaded wall name editable without focusing the keyboard', () => {
    const source = readFileSync('web/src/main.ts', 'utf8')
    expect(source).toContain('<span class="wall-name-heading">墙面名称<small>（可修改）</small></span>')
    expect(source).toContain('wallNameDialog.tabIndex = -1')
    expect(source).toContain('wallNameDialog.focus()')
  })

  it('renders route canvases at the device pixel ratio while keeping logical coordinates', () => {
    const source = readFileSync('web/src/wall-canvas.ts', 'utf8')
    expect(source).toContain('window.devicePixelRatio')
    expect(source).toContain('this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)')
    expect(source).toContain('this.viewportWidth')
  })

  it('dims the original wall image only while creating a route', () => {
    const canvasSource = readFileSync('web/src/wall-canvas.ts', 'utf8')
    const mainSource = readFileSync('web/src/main.ts', 'utf8')
    expect(canvasSource).toContain('dimImage?: boolean')
    expect(canvasSource).toContain('if (this.opts.dimImage)')
    expect(mainSource).toMatch(/viewportHeight: 420,\s+dimImage: true/)
  })
})
