import { apiError } from './errors.js'
import { listAllPublicWalls, listProblems, listWalls } from './browse.js'
import { argon2id } from 'hash-wasm'
import argon2Module from './argon2.wasm'
import blake2bModule from './blake2b.wasm'

const wasmRuntime = WebAssembly as unknown as { compile: (source: ArrayBuffer) => Promise<WebAssembly.Module> }
wasmRuntime.compile = async (source) => source.byteLength > 7000 ? blake2bModule : argon2Module

export interface Env { ASSETS: Fetcher; DB?: D1Database }
const cookie = 'cruxset_session'
const allowedOrigins = new Set(['https://cruxset.xinyilab.top', 'https://api.cruxset.xinyilab.top', 'https://cruxset-edge.cruxset.workers.dev'])
const cors = (request: Request, headers = new Headers()) => { const origin = request.headers.get('Origin'); if (origin && allowedOrigins.has(origin)) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); headers.set('Access-Control-Allow-Credentials', 'true'); headers.set('Access-Control-Allow-Headers', 'Content-Type'); headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS') } return headers }
const json = (request: Request, body: unknown, init: ResponseInit = {}) => { const headers = cors(request, new Headers(init.headers)); headers.set('Content-Type', 'application/json'); return new Response(JSON.stringify(body), {...init, headers}) }
const error = (request: Request, code: string, message: string, status: number) => json(request, { error: { code, message } }, { status })
async function digest(value: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('') }
async function passwordOk(encoded: string, password: string) { const p = encoded.split('$'); if (p.length < 6 || p[1] !== 'argon2id' || p[2] !== 'v=19') return false; const params = Object.fromEntries(p[3].split(',').map((x) => x.split('='))); const salt = Uint8Array.from(atob(p[4]), (c) => c.charCodeAt(0)); const actual = await argon2id({ password, salt, parallelism: Number(params.p), iterations: Number(params.t), memorySize: Number(params.m), hashLength: 32, outputType: 'encoded' }); return actual === encoded }
async function session(request: Request, db: D1Database) { const value = request.headers.get('Cookie')?.match(new RegExp(`${cookie}=([^;]+)`))?.[1]; if (!value) return null; return await db.prepare('SELECT u.id,u.display_name,a.email_normalized,a.role,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id JOIN admins a ON a.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(value), Date.now()).first() as Record<string, unknown> | null }
function displayName(row: Record<string, unknown>) { const name = String(row.display_name ?? '').trim(); return name || String(row.email_normalized ?? '').split('@', 1)[0] }
async function createProblem(request: Request, db: D1Database, user: Record<string, unknown>) {
  try {
    const body = await request.json() as { wallId?: string; angle?: number; grade?: string; footRule?: string; name?: string; description?: string; holds?: Record<string, unknown> }
    const wallId = String(body.wallId ?? '')
    const wall = await db.prepare('SELECT id, wall_number, angle_options_json, visibility, published FROM walls WHERE id=?').bind(wallId).first() as Record<string, unknown> | null
    if (!wall || wall.visibility !== 'public' || Number(wall.published) !== 1) return error(request, 'WALL_NOT_ROUTABLE', 'Wall is not published', 409)
    const angle = Number(body.angle ?? 20), grade = String(body.grade ?? 'V0'), footRule = String(body.footRule ?? 'feet_follow')
    const angles = JSON.parse(String(wall.angle_options_json)) as number[]
    if (!angles.includes(angle) || !/^V(?:[0-9]|1[0-2])$/.test(grade) || !['feet_follow', 'specified', 'all'].includes(footRule)) return error(request, 'INVALID_INPUT', 'Invalid route settings', 400)
    const source = body.holds && typeof body.holds === 'object' ? body.holds : {}
    const roles = ['start', 'foot', 'hand', 'assist', 'finish']
    const assignments: Array<{ role: string; id: string }> = []
    for (const role of roles) for (const id of Array.isArray(source[role]) ? source[role] : []) assignments.push({ role, id: String(id) })
    const uniqueIds = [...new Set(assignments.map((item) => item.id))]
    if (!assignments.some((item) => item.role === 'start') || !assignments.some((item) => item.role === 'finish') || uniqueIds.length !== assignments.length) return error(request, 'INVALID_INPUT', 'Start and finish holds are required', 400)
    const placeholders = uniqueIds.map(() => '?').join(',')
    const valid = await db.prepare(`SELECT id FROM holds WHERE wall_id=? AND id IN (${placeholders})`).bind(wallId, ...uniqueIds).all()
    if ((valid.results ?? []).length !== uniqueIds.length) return error(request, 'INVALID_INPUT', 'One or more holds are invalid', 400)
    const count = await db.prepare('SELECT COUNT(*) AS count FROM problems WHERE wall_id=?').bind(wallId).first() as { count?: number } | null
    const number = `CS-${String(Number(wall.wall_number ?? 0)).padStart(2, '0')}${String(Number(count?.count ?? 0) + 1).padStart(4, '0')}`
    const now = Date.now(), id = `problem_${crypto.randomUUID()}`
    const statements = [db.prepare('INSERT INTO problems (id,number,wall_id,name,description,angle,grade,foot_rule,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id, number, wallId, body.name ? String(body.name) : null, body.description ? String(body.description) : null, angle, grade, footRule, user.id, now, now), ...assignments.map((item) => db.prepare('INSERT INTO problem_holds (problem_id,wall_id,hold_id,role) VALUES (?,?,?,?)').bind(id, wallId, item.id, item.role))]
    await db.batch(statements)
    return json(request, { problem: { id, number, wallId, name: body.name ?? null, description: body.description ?? null, angle, grade, footRule, createdBy: user.id, createdAt: now, updatedAt: now, holds: Object.fromEntries(roles.map((role) => [role, assignments.filter((item) => item.role === role).map((item) => item.id)])) } }, { status: 201 })
  } catch (caught) { console.error('problem_create_failed', caught instanceof Error ? caught.stack : String(caught)); return error(request, 'INVALID_INPUT', 'Unable to create route', 400) }
}
const worker: ExportedHandler<Env> = { async fetch(request, env) {
  const url = new URL(request.url), pathname = url.pathname
  if (pathname.startsWith('/api/v1/')) {
    if (request.method === 'OPTIONS') return allowedOrigins.has(request.headers.get('Origin') ?? '') ? new Response(null, {status: 204, headers: cors(request)}) : apiError('FORBIDDEN', 'Origin not allowed', 403)
    if (!env.DB) return apiError('NOT_FOUND','API endpoint not found',404)
    if (pathname === '/api/v1/healthz' && request.method === 'GET') return json(request, {status:'ok'})
    if (pathname === '/api/v1/bootstrap' && request.method === 'GET') { const walls = await listAllPublicWalls(env.DB); const problems = await listProblems(new Request(url.origin + '/api/v1/problems?limit=50'), env.DB); const p = problems.ok ? (await problems.json() as {problems: unknown[]}).problems : []; const user = await session(request, env.DB); return json(request, {user: user ? {id:user.id,email:user.email_normalized,displayName:displayName(user),isAdmin:user.role === 'admin'} : null, walls, problems:p, capabilities:{readOnly:false,writes:true,authentication:true,wallAuthoring:false,imageUpload:false,aiJobs:false}}) }
    if (pathname === '/api/v1/walls' && request.method === 'GET') return listWalls(request, env.DB)
    if (pathname === '/api/v1/problems' && request.method === 'GET') return listProblems(request, env.DB)
    if (pathname === '/api/v1/problems' && request.method === 'POST') { const u = await session(request, env.DB); return u ? createProblem(request, env.DB, u) : error(request, 'AUTH_REQUIRED', 'Authentication required', 401) }
    if (pathname === '/api/v1/auth/me' && request.method === 'GET') { const u=await session(request,env.DB); return u ? json(request,{user:{id:u.id,email:u.email_normalized,displayName:displayName(u),isAdmin:u.role==='admin'}}) : apiError('AUTH_REQUIRED','Authentication required',401) }
    if (pathname === '/api/v1/auth/logout' && request.method === 'POST') { const u=await session(request,env.DB); if(u) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(u.token_hash).run(); return json(request,{ok:true},{headers:{'Set-Cookie':`${cookie}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`}}) }
    if (pathname === '/api/v1/auth/admin/login' && request.method === 'POST') { try { const body=await request.json() as {email?:string,password?:string}; const row=await env.DB.prepare('SELECT u.id,u.display_name,a.role,a.email_normalized,a.password_hash FROM admins a JOIN users u ON u.id=a.user_id WHERE a.email_normalized=?').bind(String(body.email??'').trim().toLowerCase()).first() as Record<string,unknown>|null; if(!row || !(await passwordOk(String(row.password_hash),String(body.password??'')))) return json(request,{error:{code:'AUTH_REQUIRED',message:'Authentication required'}},{status:401}); const token=crypto.randomUUID()+crypto.randomUUID(); await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await digest(token),row.id,Date.now()+28800000,Date.now()).run(); return json(request,{user:{id:row.id,email:row.email_normalized,displayName:displayName(row),isAdmin:row.role==='admin'}},{headers:{'Set-Cookie':`${cookie}=${token}; Max-Age=28800; Path=/; Secure; HttpOnly; SameSite=Lax`}}) } catch (error) { console.error('admin_login_failed', error instanceof Error ? error.stack : String(error)); return json(request,{error:{code:'LOGIN_FAILED',message:'Login service failed'}},{status:500}) } }
    if (pathname === '/api/v1/auth/register' || pathname === '/api/v1/auth/profile' || pathname === '/api/v1/auth/admin/users' || pathname === '/api/v1/media/images' || (pathname === '/api/v1/walls' && request.method !== 'GET')) return apiError('CAPABILITY_UNAVAILABLE','This cloud capability is unavailable',403)
    return apiError('NOT_FOUND','API endpoint not found',404)
  }
  return env.ASSETS.fetch(request)
} }
export default worker
