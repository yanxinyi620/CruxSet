import { expect, it } from 'vitest'
import { ProblemEditor } from '../src/domain/editor.js'

it('moves a hold between roles and undoes the change', () => {
  const editor = new ProblemEditor({ start: [], foot: [], hand: ['H1'], assist: [], finish: [] })
  editor.toggle('H1', 'foot')
  expect(editor.value().holds).toEqual({ start: [], foot: ['H1'], hand: [], assist: [], finish: [] })
  editor.undo()
  expect(editor.value().holds.hand).toEqual(['H1'])
})

it('serializes and restores a draft without sharing mutable arrays', () => {
  const editor = new ProblemEditor({ start: ['H1'], foot: [], hand: [], assist: [], finish: ['H2'] })
  const restored = ProblemEditor.restore(editor.serialize())
  restored.toggle('H3', 'hand')
  expect(editor.value().holds.hand).toEqual([])
  expect(restored.value().holds.hand).toEqual(['H3'])
})
