type Account = Record<string, unknown>

export const canUseLab = (user: Account | null) => Boolean(user && (user.role === 'admin' || user.lab_enabled === 1))

export const adminUserView = (row: Account) => ({
  id: row.id,
  email: row.email_normalized,
  displayName: String(row.display_name ?? ''),
  role: row.role,
  labEnabled: row.lab_enabled === 1,
  createdAt: Number(row.created_at ?? row.admin_created_at ?? 0),
})

export async function updateLabAccess(request: Request, db: D1Database, actor: Account | null, userId: string): Promise<Response> {
  const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}})
  const fail = (code: string, message: string, status: number) => reply({error: {code, message}}, status)
  if (!actor) return fail('AUTH_REQUIRED', '请先登录。', 401)
  if (actor.role !== 'admin') return fail('FORBIDDEN', '需要管理员权限。', 403)
  if (request.headers.get('Origin') !== new URL(request.url).origin) return fail('FORBIDDEN', '请从当前站点提交请求。', 403)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('enabled' in body) || typeof body.enabled !== 'boolean' || Object.keys(body).some(key => key !== 'enabled')) {
    return fail('INVALID_INPUT', '请提供实验台授权开关。', 422)
  }
  const target = await db.prepare('SELECT u.id,u.display_name,u.created_at,a.email_normalized,a.role,a.lab_enabled FROM admins a JOIN users u ON u.id=a.user_id WHERE a.user_id=?').bind(userId).first<Account>()
  if (!target) return fail('NOT_FOUND', '用户不存在。', 404)
  if (target.role === 'admin') return fail('CONFLICT', '管理员默认拥有实验台权限。', 409)
  await db.prepare("UPDATE admins SET lab_enabled=?,updated_at=? WHERE user_id=? AND role='user'").bind(body.enabled ? 1 : 0, Date.now(), userId).run()
  return reply({user: adminUserView({...target, lab_enabled: body.enabled ? 1 : 0})})
}
