import { expect, it } from 'vitest'
import { GestureController } from '../src/domain/gesture.js'

it('recognizes a short tap but not a drag', () => {
  const controller = new GestureController({ scale: 1, offsetX: 0, offsetY: 0 })
  controller.start([{ x: 10, y: 20 }], 100)
  expect(controller.move([{ x: 11, y: 21 }], 200).kind).toBe('tap')
  controller.end()
  controller.start([{ x: 10, y: 20 }], 100)
  expect(controller.move([{ x: 30, y: 20 }], 200).kind).toBe('pan')
})

it('zooms around the midpoint of two touches', () => {
  const controller = new GestureController({ scale: 1, offsetX: 0, offsetY: 0 })
  controller.start([{ x: 10, y: 10 }, { x: 30, y: 10 }], 0)
  const result = controller.move([{ x: 0, y: 10 }, { x: 40, y: 10 }], 100)
  expect(result.kind).toBe('zoom')
  expect(result.transform.scale).toBe(2)
})

it('preserves a fit-width scale below one while zooming', () => {
  const controller = new GestureController({ scale: 0.5, offsetX: 0, offsetY: 0 }, 0.5, 2.5)
  controller.start([{ x: 10, y: 10 }, { x: 30, y: 10 }], 0)
  expect(controller.move([{ x: 5, y: 10 }, { x: 35, y: 10 }], 100).transform.scale).toBe(0.75)
})
