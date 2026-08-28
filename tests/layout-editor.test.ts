import { expect, it } from 'vitest'
import { LayoutEditor } from '../src/domain/layout-editor.js'

it('continuously adds numbered holds and supports undo', () => {
  const editor = new LayoutEditor([])
  expect(editor.add({ x: .2, y: .3 }).id).toBe('H001')
  expect(editor.add({ x: .4, y: .5, kind: 'volume' }).id).toBe('H002')
  expect(editor.value()).toHaveLength(2)
  editor.undo()
  expect(editor.value().map(h => h.id)).toEqual(['H001'])
})

it('moves and resizes an existing hold with normalized coordinates', () => {
  const editor = new LayoutEditor([{ id: 'H001', x: .2, y: .3, radius: .02, kind: 'hold' }])
  editor.move('H001', 1.2, -.2); editor.resize('H001', .5)
  expect(editor.value()[0]).toMatchObject({ x: 1, y: 0, radius: .5 })
})

it('does not reuse a hold id after deletion', () => {
  const editor = new LayoutEditor([])
  editor.add({ x: .1, y: .1 }); editor.add({ x: .2, y: .2 }); editor.remove('H001')
  expect(editor.add({ x: .3, y: .3 }).id).toBe('H003')
})

it('supports batched drag moves and radius preview with a single undo step', () => {
  const editor = new LayoutEditor([{ id: 'H001', x: .2, y: .3, radius: .02, kind: 'hold' }])
  editor.beginChange()
  editor.setPosition('H001', .3, .4)
  editor.setPosition('H001', .4, .5)
  editor.setRadius('H001', .06)
  expect(editor.value()[0]).toMatchObject({ x: .4, y: .5, radius: .06 })
  editor.undo()
  expect(editor.value()[0]).toMatchObject({ x: .2, y: .3, radius: .02 })
})

it('clamps radius to a positive minimum when previewing', () => {
  const editor = new LayoutEditor([{ id: 'H001', x: .2, y: .3, radius: .02, kind: 'hold' }])
  editor.setRadius('H001', .0001)
  expect(editor.value()[0].radius).toBe(.001)
})

it('handles 600 holds in one editor pass', () => {
  const editor = new LayoutEditor([])
  for (let i = 1; i <= 600; i++) editor.add({ x: (i % 20) / 20, y: (i / 20) / 30, kind: i % 2 ? 'hold' : 'volume' })
  const holds = editor.value()
  expect(holds).toHaveLength(600)
  expect(holds[0].id).toBe('H001')
  expect(holds[599].id).toBe('H600')
  expect(holds[1].kind).toBe('volume')
})
