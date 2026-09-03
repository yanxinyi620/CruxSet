import { expect, it, vi } from 'vitest'
import { dispatchCanvasTap } from '../web/src/wall-canvas.js'

it('calls onTapCanvas when a short tap misses every hold', () => {
  const onTapCanvas = vi.fn()

  dispatchCanvasTap(undefined, vi.fn(), onTapCanvas)

  expect(onTapCanvas).toHaveBeenCalledOnce()
})

it('does not call onTapCanvas when a hold is selected', () => {
  const onTapCanvas = vi.fn(), onTapHold = vi.fn()

  dispatchCanvasTap('H001', onTapHold, onTapCanvas)

  expect(onTapHold).toHaveBeenCalledWith('H001')
  expect(onTapCanvas).not.toHaveBeenCalled()
})
