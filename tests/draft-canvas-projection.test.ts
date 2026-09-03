import { expect, it } from 'vitest'
import { draftPointToScreen, resolveDraftTransform } from '../web/src/draft-canvas.js'

it('projects normalized vertical coordinates using the displayed image height', () => {
  expect(draftPointToScreen([.5, .5], 512, .70703125)).toEqual([256, 181])
})

it('reuses the current view transform after an annotation state update', () => {
  expect(resolveDraftTransform(
    { scale: 360, offsetX: 0, offsetY: 0 },
    { scale: 720, offsetX: -180, offsetY: -90 },
  )).toEqual({ scale: 720, offsetX: -180, offsetY: -90 })
})
