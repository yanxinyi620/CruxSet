import { expect, it } from 'vitest'
import { layoutEditorRoute, newLayoutRoute } from '../src/domain/layout-publication.js'

it('creates stable routes for a draft and a new layout', () => {
  expect(layoutEditorRoute('wall_1', 'layout_1')).toBe('/pages/admin/layout-editor/index?wallId=wall_1&layoutId=layout_1')
  expect(newLayoutRoute('wall_1')).toBe('/pages/admin/layout-create/index?wallId=wall_1')
})
