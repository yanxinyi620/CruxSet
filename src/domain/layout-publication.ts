export type PublicationState = { published?: boolean }

export const isLayoutPublished = (layout: PublicationState) => layout.published === true

export const canEditLayout = (layout: PublicationState) => !isLayoutPublished(layout)
