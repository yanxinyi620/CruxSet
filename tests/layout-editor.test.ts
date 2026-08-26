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
