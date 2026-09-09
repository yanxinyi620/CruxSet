import { apiError } from './errors.js'
import { listAllPublicWalls, listProblems, listWalls } from './browse.js'

export interface Env { ASSETS: Fetcher; DB?: D1Database; MEDIA?: R2Bucket }
const cookie = 'cruxset_session'
const allowedOrigins = new Set(['https://cruxset.xinyilab.top', 'https://api.cruxset.xinyilab.top', 'https://cruxset-edge.cruxset.workers.dev'])
const cors = (request: Request, headers = new Headers()) => { const origin = request.headers.get('Origin'); if (origin && allowedOrigins.has(origin)) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); headers.set('Access-Control-Allow-Credentials', 'true'); headers.set('Access-Control-Allow-Headers', 'Content-Type'); headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS') } return headers }
const json = (request: Request, body: unknown, init: ResponseInit = {}) => { const headers = cors(request, new Headers(init.headers)); headers.set('Content-Type', 'application/json'); return new Response(JSON.stringify(body), {...init, headers}) }
const error = (request: Request, code: string, message: string, status: number) => json(request, { error: { code, message } }, { status })
const mediaId = () => `media_${crypto.randomUUID()}`
async function uploadMedia(request: Request, env: Env, user: Record<string, unknown>) {
  if (user.role !== 'admin' || !env.MEDIA) return error(request, 'CAPABILITY_UNAVAILABLE', 'Image storage is unavailable', 503)
  const form = await request.formData(), file = form.get('file')
  if (!(file instanceof File)) return error(request, 'INVALID_INPUT', 'Image file is required', 422)
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return error(request, 'INVALID_INPUT', 'Only JPEG, PNG, and WebP images are supported', 415)
  if (file.size > 10 * 1024 * 1024) return error(request, 'IMAGE_TOO_LARGE', 'Image is too large', 413)
  const id = `${mediaId()}${file.type === 'image/jpeg' ? '.jpg' : file.type === 'image/png' ? '.png' : '.webp'}`
  await env.MEDIA.put(id, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } })
  return json(request, { media: { id, url: `/api/v1/media/${id}`, contentType: file.type, size: file.size } }, { status: 201 })
}
async function readMedia(request: Request, env: Env, id: string) { if (!env.MEDIA) return error(request,'SERVICE_UNAVAILABLE','Image storage is unavailable',503); const object = await env.MEDIA.get(id); return object ? new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': object.httpMetadata?.cacheControl ?? 'public, max-age=300' } }) : error(request,'NOT_FOUND','Media not found',404) }
async function deleteMedia(request: Request, env: Env, id: string, user: Record<string, unknown>) { if (user.role !== 'admin' || !env.MEDIA) return error(request,'FORBIDDEN','Administrator access required',403); await env.MEDIA.delete(id); return json(request,{ok:true}) }
async function createWall(request: Request, db: D1Database, user: Record<string, unknown>) { const body = await request.json() as Record<string, unknown>; const id=`wall_${crypto.randomUUID()}`, now=Date.now(); const image=String(body.imageFileId??''); if (!image) return error(request,'INVALID_INPUT','Image is required',422); const max=await db.prepare('SELECT COALESCE(MAX(wall_number),0) AS n FROM walls').first() as {n?:number}; await db.prepare('INSERT INTO walls (id,wall_number,name,description,image_path,image_width,image_height,geometry_type,angle_options_json,owner_id,visibility,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,Number(max?.n??0)+1,String(body.name??''),String(body.description??''),image,Number(body.imageWidth??0),Number(body.imageHeight??0),'circle',JSON.stringify(body.angleOptions??[20,25,30,35,40,45]),user.id,'private',0,now,now).run(); return json(request,{wall:{id,wallNumber:Number(max?.n??0)+1,name:String(body.name??''),description:String(body.description??''),imageFileId:image,imageWidth:Number(body.imageWidth??0),imageHeight:Number(body.imageHeight??0),geometryType:'circle',angleOptions:body.angleOptions??[20,25,30,35,40,45],ownerId:user.id,visibility:'private',published:false,holds:[],createdAt:now,updatedAt:now}},{status:201}) }
async function wallPayload(db: D1Database, wallId: string) { const row=await db.prepare('SELECT id,wall_number,name,description,image_path,image_width,image_height,geometry_type,angle_options_json,owner_id,visibility,published,created_at,updated_at FROM walls WHERE id=?').bind(wallId).first() as Record<string,unknown>; const hs=await db.prepare('SELECT id,x,y,radius,kind,polygon_json FROM holds WHERE wall_id=? ORDER BY id').bind(wallId).all(); return { id:row.id, wallNumber:row.wall_number, name:row.name, description:row.description, imageFileId:row.image_path, imageWidth:row.image_width, imageHeight:row.image_height, geometryType:row.geometry_type, angleOptions:JSON.parse(String(row.angle_options_json)), ownerId:row.owner_id, visibility:row.visibility, published:Boolean(row.published), createdAt:row.created_at, updatedAt:row.updated_at, holds:(hs.results??[]).map((h:any)=>({id:h.id,x:h.x,y:h.y,radius:h.radius,kind:h.kind,polygon:h.polygon_json?JSON.parse(String(h.polygon_json)):undefined})) } }
async function saveHolds(request: Request, db: D1Database, user: Record<string, unknown>, wallId: string) { const wall=await db.prepare('SELECT published FROM walls WHERE id=? AND owner_id=?').bind(wallId,user.id).first() as Record<string,unknown>|null; if (!wall) return error(request,'NOT_FOUND','Wall not found',404); if (Number(wall.published)) return error(request,'WALL_LOCKED','Published wall geometry is locked',409); const body=await request.json() as {holds?:Array<Record<string,unknown>>}; const holds=body.holds??[]; await db.batch([db.prepare('DELETE FROM holds WHERE wall_id=?').bind(wallId), ...holds.map((h,i)=>db.prepare('INSERT INTO holds (wall_id,id,x,y,radius,kind,polygon_json) VALUES (?,?,?,?,?,?,?)').bind(wallId,String(h.id??`hold_${i+1}`),Number(h.x),Number(h.y),Number(h.radius),String(h.kind??'hold'),h.polygon?JSON.stringify(h.polygon):null))]); return json(request,{wall:await wallPayload(db,wallId)}) }
async function publishWall(request: Request, db: D1Database, user: Record<string, unknown>, wallId: string) { const wall=await db.prepare('SELECT published FROM walls WHERE id=? AND owner_id=?').bind(wallId,user.id).first() as Record<string,unknown>|null; if (!wall) return error(request,'NOT_FOUND','Wall not found',404); const count=await db.prepare('SELECT COUNT(*) AS n FROM holds WHERE wall_id=?').bind(wallId).first() as {n?:number}; if (Number(count?.n??0)<2) return error(request,'WALL_NOT_ROUTABLE','Published wall requires at least two holds',409); await db.prepare("UPDATE walls SET published=1,visibility='public',updated_at=? WHERE id=?").bind(Date.now(),wallId).run(); return json(request,{wall:await wallPayload(db,wallId)}) }
async function deleteWall(request: Request, db: D1Database, env: Env, user: Record<string, unknown>, wallId: string) { const wall=await db.prepare('SELECT image_path FROM walls WHERE id=? AND owner_id=?').bind(wallId,user.id).first() as Record<string,unknown>|null; if (!wall) return error(request,'NOT_FOUND','Wall not found',404); await db.batch([db.prepare('DELETE FROM problem_holds WHERE wall_id=?').bind(wallId),db.prepare('DELETE FROM problems WHERE wall_id=?').bind(wallId),db.prepare('DELETE FROM holds WHERE wall_id=?').bind(wallId),db.prepare('DELETE FROM walls WHERE id=?').bind(wallId)]); if (env.MEDIA && wall.image_path) await env.MEDIA.delete(String(wall.image_path).split('/').pop()!); return json(request,{ok:true}) }
async function digest(value: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('') }
const PBKDF2_ITERATIONS = 100000, PBKDF2_SALT_BYTES = 16, PBKDF2_KEY_BYTES = 32
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
async function derive(password: string, salt: Uint8Array, iterations: number) { const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']); const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'},key,PBKDF2_KEY_BYTES*8); return new Uint8Array(bits) }
async function hashPassword(password: string) { const salt=crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES)); return `pbkdf2-sha256$v1$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await derive(password,salt,PBKDF2_ITERATIONS))}` }
async function passwordOk(encoded: string, password: string) { const p=encoded.split('$'); if(p.length!==5 || p[0]!=='pbkdf2-sha256' || p[1]!=='v1') return false; const iterations=Number(p[2]); if(!Number.isInteger(iterations)||iterations<100000) return false; const salt=Uint8Array.from(atob(p[3]),c=>c.charCodeAt(0)), expected=Uint8Array.from(atob(p[4]),c=>c.charCodeAt(0)), actual=await derive(password,salt,iterations); let diff=actual.length^expected.length; for(let i=0;i<actual.length;i++) diff|=actual[i]^(expected[i]??0); return diff===0 }
async function session(request: Request, db: D1Database) { const value = request.headers.get('Cookie')?.match(new RegExp(`${cookie}=([^;]+)`))?.[1]; if (!value) return null; return await db.prepare('SELECT u.id,u.display_name,a.email_normalized,a.role,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id JOIN admins a ON a.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(value), Date.now()).first() as Record<string, unknown> | null }
function displayName(row: Record<string, unknown>) { const name = String(row.display_name ?? '').trim(); return name || String(row.email_normalized ?? '').split('@', 1)[0] }
async function createProblem(request: Request, db: D1Database, user: Record<string, unknown>) {
  try {
    const body = await request.json() as { wallId?: string; angle?: number; grade?: string; footRule?: string; name?: string; description?: string; holds?: Record<string, unknown> }
    const wallId = String(body.wallId ?? '')
    const wall = await db.prepare('SELECT id, wall_number, angle_options_json, visibility, published FROM walls WHERE id=?').bind(wallId).first() as Record<string, unknown> | null
    if (!wall || wall.visibility !== 'public' || Number(wall.published) !== 1) return error(request, 'WALL_NOT_ROUTABLE', 'Wall is not published', 409)
    const angle = Number(body.angle ?? 20), grade = String(body.grade ?? 'V0'), footRule = String(body.footRule ?? 'feet_follow')
    if (angle < 0 || angle > 70 || angle % 5 !== 0 || !/^V(?:[0-9]|1[0-6])$/.test(grade) || !['feet_follow', 'specified', 'all'].includes(footRule)) return error(request, 'INVALID_INPUT', 'Invalid route settings', 400)
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
async function updateProblem(request: Request, db: D1Database, user: Record<string, unknown>, problemId: string) {
  try {
    const existing = await db.prepare('SELECT id,number,wall_id,created_by FROM problems WHERE id=?').bind(problemId).first() as Record<string, unknown> | null
    if (!existing || (existing.created_by !== user.id && user.role !== 'admin')) return error(request, 'NOT_FOUND', 'Route not found', 404)
    const body = await request.json() as { angle?: number; grade?: string; footRule?: string; name?: string; description?: string; holds?: Record<string, unknown> }
    const angle = Number(body.angle ?? 20), grade = String(body.grade ?? 'V0'), footRule = String(body.footRule ?? 'feet_follow')
    if (angle < 0 || angle > 70 || angle % 5 !== 0 || !/^V(?:[0-9]|1[0-6])$/.test(grade) || !['feet_follow', 'specified', 'all'].includes(footRule)) return error(request, 'INVALID_INPUT', 'Invalid route settings', 400)
    const source = body.holds && typeof body.holds === 'object' ? body.holds : {}
    const roles = ['start', 'foot', 'hand', 'assist', 'finish'], assignments: Array<{ role: string; id: string }> = []
    for (const role of roles) for (const id of Array.isArray(source[role]) ? source[role] : []) assignments.push({ role, id: String(id) })
    const uniqueIds = [...new Set(assignments.map((item) => item.id))]
    if (!assignments.some((item) => item.role === 'start') || !assignments.some((item) => item.role === 'finish') || uniqueIds.length !== assignments.length) return error(request, 'INVALID_INPUT', 'Start and finish holds are required', 400)
    const placeholders = uniqueIds.map(() => '?').join(',')
    const valid = await db.prepare(`SELECT id FROM holds WHERE wall_id=? AND id IN (${placeholders})`).bind(existing.wall_id, ...uniqueIds).all()
    if ((valid.results ?? []).length !== uniqueIds.length) return error(request, 'INVALID_INPUT', 'One or more holds are invalid', 400)
    const now = Date.now()
    await db.batch([
      db.prepare('UPDATE problems SET name=?,description=?,angle=?,grade=?,foot_rule=?,updated_at=? WHERE id=?').bind(body.name ? String(body.name) : null, body.description ? String(body.description) : null, angle, grade, footRule, now, problemId),
      db.prepare('DELETE FROM problem_holds WHERE problem_id=?').bind(problemId),
      ...assignments.map((item) => db.prepare('INSERT INTO problem_holds (problem_id,wall_id,hold_id,role) VALUES (?,?,?,?)').bind(problemId, existing.wall_id, item.id, item.role)),
    ])
    return json(request, { problem: { id: problemId, number: existing.number, wallId: existing.wall_id, name: body.name ?? null, description: body.description ?? null, angle, grade, footRule, createdBy: existing.created_by, updatedAt: now, holds: Object.fromEntries(roles.map((role) => [role, assignments.filter((item) => item.role === role).map((item) => item.id)])) } })
  } catch (caught) { console.error('problem_update_failed', caught instanceof Error ? caught.stack : String(caught)); return error(request, 'INVALID_INPUT', 'Unable to update route', 400) }
}
async function register(request: Request, db: D1Database, env: Env) {
  const body = await request.json() as { email?: string; password?: string; confirmPassword?: string }
  const password = String(body.password ?? ''), confirm = String(body.confirmPassword ?? '')
  if (password !== confirm) return error(request, 'INVALID_INPUT', 'Passwords do not match', 422)
  if (password.length < 8) return error(request, 'INVALID_INPUT', 'Password must contain at least 8 characters', 422)
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error(request, 'INVALID_INPUT', 'Invalid email', 422)
  const existing = await db.prepare('SELECT user_id FROM admins WHERE email_normalized=?').bind(email).first()
  if (existing) return error(request, 'CONFLICT', 'Email already registered', 409)
  const id = `usr_web_${crypto.randomUUID()}`, now = Date.now(), passwordHash = await hashPassword(password), token = crypto.randomUUID() + crypto.randomUUID()
  await db.batch([
    db.prepare('INSERT INTO users (id,display_name,created_at,updated_at) VALUES (?,?,?,?)').bind(id, '', now, now),
    db.prepare('INSERT INTO admins (user_id,role,created_at,updated_at,email_normalized,password_hash) VALUES (?,?,?,?,?,?)').bind(id, 'user', now, now, email, passwordHash),
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(await digest(token), id, now + 28800000, now),
  ])
  return json(request, { user: { id, email, displayName: email.split('@')[0], isAdmin: false } }, { status: 201, headers: { 'Set-Cookie': `${cookie}=${token}; Max-Age=28800; Path=/; Secure; HttpOnly; SameSite=Lax` } })
}
const worker: ExportedHandler<Env> = { async fetch(request, env) {
  const url = new URL(request.url), pathname = url.pathname
  if (pathname.startsWith('/api/v1/')) {
    if (request.method === 'OPTIONS') return allowedOrigins.has(request.headers.get('Origin') ?? '') ? new Response(null, {status: 204, headers: cors(request)}) : apiError('FORBIDDEN', 'Origin not allowed', 403)
    if (!env.DB) return apiError('NOT_FOUND','API endpoint not found',404)
    if (pathname === '/api/v1/healthz' && request.method === 'GET') return json(request, {status:'ok'})
    if (pathname === '/api/v1/bootstrap' && request.method === 'GET') { const walls = await listAllPublicWalls(env.DB); const problems = await listProblems(new Request(url.origin + '/api/v1/problems?limit=50'), env.DB); const p = problems.ok ? (await problems.json() as {problems: unknown[]}).problems : []; const user = await session(request, env.DB); return json(request, {user: user ? {id:user.id,email:user.email_normalized,displayName:displayName(user),isAdmin:user.role === 'admin'} : null, walls, problems:p, capabilities:{readOnly:false,writes:true,authentication:true,wallAuthoring:Boolean(user?.role==='admin'),imageUpload:Boolean(user?.role==='admin' && env.MEDIA),aiJobs:false}}) }
    if (pathname === '/api/v1/walls' && request.method === 'GET') return listWalls(request, env.DB)
    if (pathname === '/api/v1/problems' && request.method === 'GET') return listProblems(request, env.DB)
    if (pathname === '/api/v1/problems' && request.method === 'POST') { const u = await session(request, env.DB); return u ? createProblem(request, env.DB, u) : error(request, 'AUTH_REQUIRED', 'Authentication required', 401) }
    const problemMatch = pathname.match(/^\/api\/v1\/problems\/([^/]+)$/)
    if (problemMatch && request.method === 'PATCH') { const u = await session(request, env.DB); return u ? updateProblem(request, env.DB, u, decodeURIComponent(problemMatch[1])) : error(request, 'AUTH_REQUIRED', 'Authentication required', 401) }
    if (problemMatch && request.method === 'DELETE') {
      const u = await session(request, env.DB)
      if (!u) return error(request, 'AUTH_REQUIRED', 'Authentication required', 401)
      const id = decodeURIComponent(problemMatch[1]), existing = await env.DB.prepare('SELECT created_by FROM problems WHERE id=?').bind(id).first() as Record<string, unknown> | null
      if (!existing || (existing.created_by !== u.id && u.role !== 'admin')) return error(request, 'NOT_FOUND', 'Route not found', 404)
      await env.DB.batch([env.DB.prepare('DELETE FROM problem_holds WHERE problem_id=?').bind(id), env.DB.prepare('DELETE FROM problems WHERE id=?').bind(id)])
      return json(request, { ok: true })
    }
    if (pathname === '/api/v1/auth/me' && request.method === 'GET') { const u=await session(request,env.DB); return u ? json(request,{user:{id:u.id,email:u.email_normalized,displayName:displayName(u),isAdmin:u.role==='admin'}}) : apiError('AUTH_REQUIRED','Authentication required',401) }
    if (pathname === '/api/v1/auth/register' && request.method === 'POST') return register(request, env.DB, env)
    if (pathname === '/api/v1/auth/profile' && request.method === 'PATCH') { const u = await session(request, env.DB); if (!u) return error(request, 'AUTH_REQUIRED', 'Authentication required', 401); const body = await request.json() as { displayName?: string }; const name = String(body.displayName ?? '').trim(); if (name.length > 40) return error(request, 'INVALID_INPUT', 'User name is too long', 422); await env.DB.prepare('UPDATE users SET display_name=?,updated_at=? WHERE id=?').bind(name, Date.now(), u.id).run(); return json(request, { user: { id: u.id, email: u.email_normalized, displayName: name || String(u.email_normalized).split('@')[0], isAdmin: u.role === 'admin' } }) }
    if (pathname === '/api/v1/auth/admin/users' && request.method === 'GET') { const u = await session(request, env.DB); if (!u || u.role !== 'admin') return error(request, 'FORBIDDEN', 'Administrator access required', 403); const result = await env.DB.prepare('SELECT u.id,u.display_name,a.email_normalized,a.role,u.created_at,a.created_at AS admin_created_at FROM admins a JOIN users u ON u.id=a.user_id ORDER BY COALESCE(u.created_at,a.created_at) DESC,a.email_normalized ASC').all(); return json(request, { users: (result.results ?? []).map((row) => ({ id: row.id, email: row.email_normalized, displayName: String(row.display_name ?? ''), role: row.role, createdAt: Number(row.created_at ?? row.admin_created_at ?? 0) })) }) }
    if (pathname === '/api/v1/auth/logout' && request.method === 'POST') { const u=await session(request,env.DB); if(u) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(u.token_hash).run(); return json(request,{ok:true},{headers:{'Set-Cookie':`${cookie}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`}}) }
    if (pathname === '/api/v1/auth/admin/login' && request.method === 'POST') { try { const body=await request.json() as {email?:string,password?:string}; const row=await env.DB.prepare('SELECT u.id,u.display_name,a.role,a.email_normalized,a.password_hash FROM admins a JOIN users u ON u.id=a.user_id WHERE a.email_normalized=?').bind(String(body.email??'').trim().toLowerCase()).first() as Record<string,unknown>|null; if(!row || !(await passwordOk(String(row.password_hash),String(body.password??'')))) return json(request,{error:{code:'AUTH_REQUIRED',message:'Authentication required'}},{status:401}); const token=crypto.randomUUID()+crypto.randomUUID(); await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await digest(token),row.id,Date.now()+28800000,Date.now()).run(); return json(request,{user:{id:row.id,email:row.email_normalized,displayName:displayName(row),isAdmin:row.role==='admin'}},{headers:{'Set-Cookie':`${cookie}=${token}; Max-Age=28800; Path=/; Secure; HttpOnly; SameSite=Lax`}}) } catch (error) { console.error('admin_login_failed', error instanceof Error ? error.stack : String(error)); return json(request,{error:{code:'LOGIN_FAILED',message:'Login service failed'}},{status:500}) } }
    const mediaMatch = pathname.match(/^\/api\/v1\/media\/([^/]+)$/)
    if (pathname === '/api/v1/media/images' && request.method === 'POST') { const u=await session(request,env.DB); return u ? uploadMedia(request,env,u) : error(request,'AUTH_REQUIRED','Authentication required',401) }
    if (mediaMatch && request.method === 'GET') return readMedia(request,env,decodeURIComponent(mediaMatch[1]))
    if (mediaMatch && request.method === 'DELETE') { const u=await session(request,env.DB); return u ? deleteMedia(request,env,decodeURIComponent(mediaMatch[1]),u) : error(request,'AUTH_REQUIRED','Authentication required',401) }
    if (pathname === '/api/v1/walls' && request.method === 'POST') { const u=await session(request,env.DB); return u?.role==='admin' ? createWall(request,env.DB,u) : error(request,'FORBIDDEN','Administrator access required',403) }
    const holdsMatch = pathname.match(/^\/api\/v1\/walls\/([^/]+)\/holds$/)
    if (holdsMatch && request.method === 'PUT') { const u=await session(request,env.DB); return u?.role==='admin' ? saveHolds(request,env.DB,u,decodeURIComponent(holdsMatch[1])) : error(request,'FORBIDDEN','Administrator access required',403) }
    const publishMatch = pathname.match(/^\/api\/v1\/walls\/([^/]+)\/publish$/)
    if (publishMatch && request.method === 'POST') { const u=await session(request,env.DB); return u?.role==='admin' ? publishWall(request,env.DB,u,decodeURIComponent(publishMatch[1])) : error(request,'FORBIDDEN','Administrator access required',403) }
    const deleteWallMatch = pathname.match(/^\/api\/v1\/walls\/([^/]+)$/)
    if (deleteWallMatch && request.method === 'DELETE') { const u=await session(request,env.DB); return u?.role==='admin' ? deleteWall(request,env.DB,env,u,decodeURIComponent(deleteWallMatch[1])) : error(request,'FORBIDDEN','Administrator access required',403) }
    return apiError('NOT_FOUND','API endpoint not found',404)
  }
  return env.ASSETS.fetch(request)
} }
export default worker
