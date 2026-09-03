import { expect, it } from 'vitest'
import { canvasBitmapSize } from '../web/src/draft-canvas.js'

it('uses the device pixel ratio for a sharp annotation canvas', () => {
  expect(canvasBitmapSize(360, 240, 3)).toEqual({ width: 1080, height: 720 })
})
