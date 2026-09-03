import { expect, it } from 'vitest'
import { WallHoldEditor } from '../web/src/wall-hold-editor.js'

it('restores cleared and replaced holds through undo and redo', () => {
  const editor = new WallHoldEditor([{ id: 'H001', x: .1, y: .2, radius: .02, kind: 'hold' }])
  editor.replace([])
  editor.undo()
  expect(editor.value()).toHaveLength(1)
  expect(editor.canRedo()).toBe(true)
  editor.redo()
  expect(editor.value()).toEqual([])
})
