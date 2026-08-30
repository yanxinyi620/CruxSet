export type PreviewRoute = { name: 'browse' } | { name: 'create' } | { name: 'me' } | { name: 'wall'; wallId: string } | { name: 'wall-editor'; wallId: string } | { name: 'problem-editor'; wallId: string } | { name: 'problem-detail'; problemId: string }

export const toPreviewUrl = (route: PreviewRoute) => route.name === 'browse' ? '/' : route.name === 'create' || route.name === 'me' ? `/${route.name}` : route.name === 'problem-detail' ? `/problem/${encodeURIComponent(route.problemId)}` : `/${route.name}/${encodeURIComponent(route.wallId)}`
