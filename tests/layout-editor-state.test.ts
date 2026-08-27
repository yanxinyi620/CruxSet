import { expect, it } from 'vitest'
import { layoutEditorState } from '../src/domain/layout-publication.js'

it('makes published layouts explicitly read-only', () => {
  expect(layoutEditorState({ published: true })).toEqual({ editable: false, message: '该 Layout 已发布并锁定' })
  expect(layoutEditorState({ published: false })).toEqual({ editable: true, message: '' })
})
