import { expect, it } from 'vitest'
import { draftPointToScreen } from '../web/src/draft-canvas.js'

it('projects normalized vertical coordinates using the displayed image height', () => {
  expect(draftPointToScreen([.5, .5], 512, .70703125)).toEqual([256, 181])
})
