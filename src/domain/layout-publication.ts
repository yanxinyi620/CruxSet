export type PublicationState = { published?: boolean }

export const isLayoutPublished = (layout: PublicationState) => layout.published === true

export const canEditLayout = (layout: PublicationState) => !isLayoutPublished(layout)

export const latestLayouts = <T extends { id: string; version: number }>(layouts: T[]) =>
  Object.values(layouts.reduce<Record<string, T>>((latest, layout) => {
    if (!latest[layout.id] || latest[layout.id].version < layout.version) latest[layout.id] = layout
    return latest
  }, {}))

export const layoutEditorRoute = (wallId: string, layoutId: string) =>
  `/pages/admin/layout-editor/index?wallId=${wallId}&layoutId=${layoutId}`

export const newLayoutRoute = (wallId: string) =>
  `/pages/admin/layout-create/index?wallId=${wallId}`
