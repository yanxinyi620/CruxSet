export type PreviewRoute = { name: 'browse' } | { name: 'create' } | { name: 'me' } | { name: 'wall'; wallId: string } | { name: 'route-browser'; wallId: string } | { name: 'wall-editor'; wallId: string } | { name: 'problem-editor'; wallId: string; problemId?: string } | { name: 'problem-detail'; problemId: string }

export const toPreviewUrl = (route: PreviewRoute, query: Record<string, string | number | undefined> = {}) => {
  const path = route.name === 'browse' ? '/' : route.name === 'create' || route.name === 'me' ? `/${route.name}` : route.name === 'problem-detail' ? `/problem/${encodeURIComponent(route.problemId)}` : route.name === 'route-browser' ? `/wall/${encodeURIComponent(route.wallId)}/routes` : route.name === 'problem-editor' && route.problemId ? `/problem-editor/${encodeURIComponent(route.wallId)}/${encodeURIComponent(route.problemId)}` : `/${route.name}/${encodeURIComponent(route.wallId)}`
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
  const encoded = params.toString()
  return encoded ? `${path}?${encoded}` : path
}

export const previewQuery = (search: string) => new URLSearchParams(search)

export const fromPreviewUrl = (pathname: string): PreviewRoute => {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return { name: 'browse' }
  if (path === '/create') return { name: 'create' }
  if (path === '/me') return { name: 'me' }
  const detail = path.match(/^\/problem\/([^/]+)$/)
  if (detail) return { name: 'problem-detail', problemId: decodeURIComponent(detail[1]) }
  const routes = path.match(/^\/wall\/([^/]+)\/routes$/)
  if (routes) return { name: 'route-browser', wallId: decodeURIComponent(routes[1]) }
  const editor = path.match(/^\/problem-editor\/([^/]+)\/([^/]+)$/)
  if (editor) return { name: 'problem-editor', wallId: decodeURIComponent(editor[1]), problemId: decodeURIComponent(editor[2]) }
  const wall = path.match(/^\/(wall|wall-editor|problem-editor)\/([^/]+)$/)
  if (wall) return { name: wall[1] as 'wall' | 'wall-editor' | 'problem-editor', wallId: decodeURIComponent(wall[2]) }
  return { name: 'browse' }
}
