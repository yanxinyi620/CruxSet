import { apiError } from './errors.js'

type Row = Record<string, unknown>
const publicHeaders = { 'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300' }

export function decodeCursor(value: string | null): { createdAt: number; id: string } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(atob(value)) as { createdAt?: number; id?: string }
    const createdAt = parsed.createdAt
    if (!Number.isInteger(createdAt) || typeof parsed.id !== 'string' || !parsed.id) return null
    return { createdAt: createdAt as number, id: parsed.id }
  } catch {
    return null
  }
}

export function encodeCursor(createdAt: number, id: string): string {
  return btoa(JSON.stringify({ createdAt, id }))
}

function pageSize(url: URL): number {
  const value = Number(url.searchParams.get('limit') ?? 20)
  return Number.isInteger(value) ? Math.max(1, Math.min(50, value)) : 20
}

export async function listWalls(request: Request, db?: D1Database): Promise<Response> {
  if (!db) return apiError('SERVICE_UNAVAILABLE', 'Browse database is not configured', 503)
  const url = new URL(request.url)
  const limit = pageSize(url)
  const cursor = decodeCursor(url.searchParams.get('cursor'))
  if (url.searchParams.has('cursor') && !cursor) return apiError('INVALID_CURSOR', 'Invalid pagination cursor', 400)
  const statement = cursor
    ? db.prepare(`SELECT id, wall_number, name, description, image_path, image_width, image_height, geometry_type, angle_options_json, created_at, updated_at FROM walls WHERE visibility = 'public' AND published = 1 AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`).bind(cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
    : db.prepare(`SELECT id, wall_number, name, description, image_path, image_width, image_height, geometry_type, angle_options_json, owner_id, visibility, published, created_at, updated_at FROM walls WHERE visibility = 'public' AND published = 1 ORDER BY created_at DESC, id DESC LIMIT ?`).bind(limit + 1)
  const result = await statement.all<Row>()
  const rows = result.results ?? []
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id, wallNumber: row.wall_number, name: row.name, description: row.description, ownerId: row.owner_id, visibility: row.visibility, published: Boolean(row.published),
    imagePath: row.image_path, imageWidth: row.image_width, imageHeight: row.image_height,
    geometryType: row.geometry_type, angleOptions: JSON.parse(String(row.angle_options_json)),
    createdAt: row.created_at, updatedAt: row.updated_at,
    holds: [] as Array<{ id: unknown; x: unknown; y: unknown; radius: unknown; kind: unknown; polygon?: unknown }>,
  }))
  if (items.length) {
    const ids = items.map((item) => String(item.id))
    const placeholders = ids.map(() => '?').join(', ')
    const holdResult = await db.prepare(`SELECT wall_id, id, x, y, radius, kind, polygon_json FROM holds WHERE wall_id IN (${placeholders}) ORDER BY wall_id, id`).bind(...ids).all<Row>()
    const byId = new Map(items.map((item) => [String(item.id), item]))
    for (const hold of holdResult.results ?? []) {
      byId.get(String(hold.wall_id))?.holds.push({ id: hold.id, x: hold.x, y: hold.y, radius: hold.radius, kind: hold.kind, polygon: hold.polygon_json ? JSON.parse(String(hold.polygon_json)) : undefined })
    }
  }
  const last = items.at(-1)
  return Response.json({ walls: items, nextCursor: hasMore && last ? encodeCursor(Number(last.createdAt), String(last.id)) : null }, { headers: publicHeaders })
}

export async function listAllPublicWalls(db: D1Database): Promise<unknown[]> {
  const result = await db.prepare(`SELECT id, wall_number, name, description, image_path, image_width, image_height, geometry_type, angle_options_json, owner_id, visibility, published, created_at, updated_at FROM walls WHERE visibility = 'public' AND published = 1 ORDER BY created_at DESC, id DESC`).all<Row>()
  const items = (result.results ?? []).map((row) => ({ id: row.id, wallNumber: row.wall_number, name: row.name, description: row.description, imageFileId: row.image_path, displayImageFileId: row.image_path, imageWidth: row.image_width, imageHeight: row.image_height, geometryType: row.geometry_type, angleOptions: JSON.parse(String(row.angle_options_json)), ownerId: row.owner_id, visibility: row.visibility, published: Boolean(row.published), createdAt: row.created_at, updatedAt: row.updated_at, holds: [] as Array<Record<string, unknown>> }))
  if (items.length) {
    const ids = items.map((item) => String(item.id)); const placeholders = ids.map(() => '?').join(', ')
    const holds = await db.prepare(`SELECT wall_id,id,x,y,radius,kind,polygon_json FROM holds WHERE wall_id IN (${placeholders}) ORDER BY wall_id,id`).bind(...ids).all<Row>()
    const byId = new Map(items.map((item) => [String(item.id), item]))
    for (const hold of holds.results ?? []) byId.get(String(hold.wall_id))?.holds.push({ id: hold.id, x: hold.x, y: hold.y, radius: hold.radius, kind: hold.kind, polygon: hold.polygon_json ? JSON.parse(String(hold.polygon_json)) : undefined })
  }
  return items
}

export async function listAllWallsForAdmin(db: D1Database): Promise<unknown[]> {
  const result = await db.prepare(`SELECT id, wall_number, name, description, image_path, image_width, image_height, geometry_type, angle_options_json, owner_id, visibility, published, created_at, updated_at FROM walls ORDER BY created_at DESC, id DESC`).all<Row>()
  const items = (result.results ?? []).map((row) => ({ id: row.id, wallNumber: row.wall_number, name: row.name, description: row.description, imageFileId: row.image_path, displayImageFileId: row.image_path, imageWidth: row.image_width, imageHeight: row.image_height, geometryType: row.geometry_type, angleOptions: JSON.parse(String(row.angle_options_json)), ownerId: row.owner_id, visibility: row.visibility, published: Boolean(row.published), createdAt: row.created_at, updatedAt: row.updated_at, holds: [] as Array<Record<string, unknown>> }))
  if (items.length) { const ids=items.map((x)=>String(x.id)); const qs=ids.map(()=>'?').join(','); const holds=await db.prepare(`SELECT wall_id,id,x,y,radius,kind,polygon_json FROM holds WHERE wall_id IN (${qs}) ORDER BY wall_id,id`).bind(...ids).all<Row>(); const byId=new Map(items.map((x)=>[String(x.id),x])); for(const h of holds.results??[]) byId.get(String(h.wall_id))?.holds.push({id:h.id,x:h.x,y:h.y,radius:h.radius,kind:h.kind,polygon:h.polygon_json?JSON.parse(String(h.polygon_json)):undefined}) }
  return items
}

export async function listProblems(request: Request, db?: D1Database): Promise<Response> {
  if (!db) return apiError('SERVICE_UNAVAILABLE', 'Browse database is not configured', 503)
  const url = new URL(request.url)
  const wallId = url.searchParams.get('wallId')
  const limit = pageSize(url)
  const cursor = decodeCursor(url.searchParams.get('cursor'))
  if (url.searchParams.has('cursor') && !cursor) return apiError('INVALID_CURSOR', 'Invalid pagination cursor', 400)
  const values: unknown[] = []
  let where = '1 = 1'
  if (wallId) { where += ' AND p.wall_id = ?'; values.push(wallId) }
  if (cursor) { where += ' AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))'; values.push(cursor.createdAt, cursor.createdAt, cursor.id) }
  values.push(limit + 1)
  const result = await db.prepare(`SELECT p.id, p.number, p.wall_id, p.name, p.description, p.angle, p.grade, p.foot_rule, p.created_by, p.created_at, p.updated_at FROM problems p JOIN walls w ON w.id = p.wall_id AND w.visibility = 'public' AND w.published = 1 WHERE ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).bind(...values).all<Row>()
  const rows: Array<Row & { holds: Record<string, string[]> }> = (result.results ?? []).map((row) => ({ ...row, holds: {} as Record<string, string[]> }))
  const hasMore = rows.length > limit
  const ids = rows.slice(0, limit).map((row) => String(row.id))
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(', ')
    const holdResult = await db.prepare(`SELECT problem_id, hold_id, role FROM problem_holds WHERE problem_id IN (${placeholders})`).bind(...ids).all<Row>()
    const byId = new Map(rows.map((row) => [String(row.id), row]))
    for (const hold of holdResult.results ?? []) {
      const item = byId.get(String(hold.problem_id))
      if (item && hold.role != null && hold.hold_id != null) (item.holds[String(hold.role)] ??= []).push(String(hold.hold_id))
    }
  }
  const items = rows.slice(0, limit).map((row) => ({ id: row.id, number: row.number, wallId: row.wall_id, name: row.name, description: row.description, angle: row.angle, grade: row.grade, footRule: row.foot_rule, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, holds: row.holds }))
  const last = items.at(-1)
  return Response.json({ problems: items, nextCursor: hasMore && last ? encodeCursor(Number(last.createdAt), String(last.id)) : null }, { headers: publicHeaders })
}
