import type { PreviewRoute } from './routes.js'

export function resolveDetailTarget(id: string, problems: ReadonlyArray<{id: string; wallId: string}>): PreviewRoute | null {
  const problem = problems.find(problem => problem.id === id)
  return problem ? {name:'route-browser', wallId:problem.wallId} : null
}

export function detailReturnTarget(query: URLSearchParams, wallId: string): {route: PreviewRoute; query: Record<string, string>} {
  return query.get('from') === 'my-problems'
    ? {route:{name:'me'},query:{panel:'my-problems',expanded:query.get('returnWall') || wallId}}
    : {route:{name:'route-browser',wallId},query:{}}
}
