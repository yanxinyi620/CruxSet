import {
  body,
  candidates,
  fail,
  json,
  objectResponse,
  type ReadyEnv,
  type Row,
} from './common.js'
import { normalizedHolds, publishCloudbase } from './cloudbase.js'
export function requestView(r: Row) {
  return {
    id: r.id,
    applicantId: r.applicant_id,
    wallName: r.wall_name,
    target: r.target,
    status: r.status,
    createdAt: r.created_at / 1000,
    reason: r.reason ?? '',
    error: r.error ?? '',
    retryable:
      r.status === 'failed' ||
      (r.status === 'publishing' && Number(r.lease_until) <= Date.now()),
    reviewerId: r.reviewer_id ?? null,
    reviewedAt: r.reviewed_at ? r.reviewed_at / 1000 : null,
    result: r.result ? JSON.parse(r.result) : null,
  }
}
export async function createPublishRequest(
  env: ReadyEnv,
  e: Row,
  c: Row,
  user: Row,
  b: Row,
) {
  if (b.target !== 'cloudbase') fail('INVALID_TARGET', '该目标不支持发布申请。')
  const name = String(b.wallName ?? `${e.name} · 校准`).trim()
  if (!name || name.length > 120)
    fail('INVALID_INPUT', '墙面名称须为 1–120 字。')
  const prior = await env.DB.prepare(
    "SELECT * FROM lab_publish_requests WHERE calibration_id=? AND target=? AND status<>'rejected'",
  )
    .bind(c.id, b.target)
    .first<Row>()
  if (prior) return prior
  const source = await env.MEDIA.get(c.candidates_key),
    image = await env.MEDIA.get(c.display_key)
  if (!source || !image) fail('NOT_FOUND', '校准文件不存在。', 404)
  const holds = candidates(
    JSON.parse(await source.text()).items,
    e.width,
    e.height,
  )
  if (!holds.length) fail('INVALID_CANDIDATES', '请至少保存一个岩点。')
  // Preflight the receiver contract before retaining a non-editable review snapshot.
  normalizedHolds(holds, e.width, e.height)
  const id = crypto.randomUUID(),
    key = `lab-publish-requests/${id}/`
  try {
    await env.MEDIA.put(
      key + 'snapshot.json',
      JSON.stringify({
        publishRequestId: `cloudflare:${id}`,
        sourceExperimentId: e.id,
        sourceCalibrationId: c.id,
        wallName: name,
        imageWidth: e.width,
        imageHeight: e.height,
        holds,
      }),
      { httpMetadata: { contentType: 'application/json' } },
    )
    await env.MEDIA.put(key + 'display.webp', image.body, {
      httpMetadata: { contentType: 'image/webp' },
    })
    const row = await env.DB.prepare(
      "INSERT OR IGNORE INTO lab_publish_requests (id,applicant_id,experiment_id,calibration_id,wall_name,target,status,snapshot_key,created_at) VALUES (?,?,?,?,?,?,'pending',?,?) RETURNING *",
    )
      .bind(id, user.id, e.id, c.id, name, b.target, key, Date.now())
      .first<Row>()
    if (row) return row
    await env.MEDIA.delete([key + 'snapshot.json', key + 'display.webp'])
    return (await env.DB.prepare(
      "SELECT * FROM lab_publish_requests WHERE calibration_id=? AND target=? AND status<>'rejected'",
    )
      .bind(c.id, b.target)
      .first<Row>())!
  } catch (error) {
    await env.MEDIA.delete([key + 'snapshot.json', key + 'display.webp'])
    throw error
  }
}
export async function approvePublishRequest(
  env: ReadyEnv,
  id: string,
  reviewerId: string,
) {
  const token = crypto.randomUUID(),
    now = Date.now()
  const row = await env.DB.prepare(
    "UPDATE lab_publish_requests SET status='publishing',lease_token=?,lease_until=?,error=NULL,reviewer_id=?,reviewed_at=? WHERE id=? AND (status IN ('pending','failed') OR (status='publishing' AND lease_until<=?)) RETURNING *",
  )
    .bind(token, now + 600000, reviewerId, now, id, now)
    .first<Row>()
  if (!row) {
    const existing = await env.DB.prepare(
      'SELECT * FROM lab_publish_requests WHERE id=?',
    )
      .bind(id)
      .first<Row>()
    if (existing?.status === 'published') return existing
    fail('CONFLICT', '该申请正在处理或已被拒绝。', 409)
  }
  try {
    const snapshot = await env.MEDIA.get(row.snapshot_key + 'snapshot.json'),
      image = await env.MEDIA.get(row.snapshot_key + 'display.webp')
    if (!snapshot || !image) throw new Error('申请快照不存在。')
    const result = await publishCloudbase(
      env,
      JSON.parse(await snapshot.text()),
      await new Response(image.body).arrayBuffer(),
    )
    await env.DB.prepare(
      "UPDATE lab_publish_requests SET status='published',result=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
    )
      .bind(JSON.stringify(result), id, token)
      .run()
  } catch (error) {
    await env.DB.prepare(
      "UPDATE lab_publish_requests SET status='failed',error=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
    )
      .bind(
        error instanceof Error && ['LabError', 'Error'].includes(error.name)
          ? error.message.slice(0, 300)
          : 'CloudBase 发布失败，请管理员重试。',
        id,
        token,
      )
      .run()
  }
  return (await env.DB.prepare('SELECT * FROM lab_publish_requests WHERE id=?')
    .bind(id)
    .first<Row>())!
}
export async function publishRequestRoutes(
  request: Request,
  env: ReadyEnv,
  user: Row,
  path: string,
): Promise<Response | null> {
  const admin = user.role === 'admin'
  if (path === '/publish-requests' && request.method === 'GET') {
    const rows = await (
      admin
        ? env.DB.prepare(
            'SELECT * FROM lab_publish_requests ORDER BY created_at DESC',
          )
        : env.DB.prepare(
            'SELECT * FROM lab_publish_requests WHERE applicant_id=? ORDER BY created_at DESC',
          ).bind(user.id)
    ).all<Row>()
    return json({ items: rows.results.map(requestView), isAdmin: admin })
  }
  const m = path.match(
    /^\/publish-requests\/([\w-]+)\/(preview|image|approve|reject)$/,
  )
  if (!m) return null
  const r = await env.DB.prepare(
    'SELECT * FROM lab_publish_requests WHERE id=?',
  )
    .bind(m[1])
    .first<Row>()
  if (!r || (!admin && r.applicant_id !== user.id))
    fail('NOT_FOUND', '发布申请不存在。', 404)
  if (request.method === 'GET' && m[2] === 'image')
    return objectResponse(env, r.snapshot_key + 'display.webp', 'image/webp')
  if (request.method === 'GET' && m[2] === 'preview') {
    const object = await env.MEDIA.get(r.snapshot_key + 'snapshot.json')
    if (!object) fail('NOT_FOUND', '申请快照不存在。', 404)
    const s = JSON.parse(await object.text()),
      items = candidates(s.holds, s.imageWidth, s.imageHeight)
    const escaped = (v: string) =>
      v.replace(
        /[&<>"']/g,
        (c) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[c]!,
      )
    return new Response(
      `<!doctype html><html lang="zh"><meta charset="utf-8"><title>${escaped(s.wallName)}</title><style>body{margin:0;background:#111;color:#fff;font:16px sans-serif}h1{font-size:18px;padding:12px}svg{display:block;width:100%;height:auto}polygon{fill:#77c94b44;stroke:#77c94b;stroke-width:2;vector-effect:non-scaling-stroke}</style><h1>${escaped(s.wallName)}</h1><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.imageWidth} ${s.imageHeight}"><image href="image" width="${s.imageWidth}" height="${s.imageHeight}" preserveAspectRatio="none"/>${items.map((h) => `<polygon points="${h.polygon.map((p: number[]) => p.join(',')).join(' ')}"/>`).join('')}</svg></html>`,
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy':
            "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
        },
      },
    )
  }
  if (request.method === 'POST' && (m[2] === 'approve' || m[2] === 'reject')) {
    if (!admin) fail('FORBIDDEN', '需要管理员权限。', 403)
    if (m[2] === 'approve')
      return json(requestView(await approvePublishRequest(env, r.id, user.id)))
    const b = await body(request),
      reason = String(b.reason ?? '').trim()
    if (reason.length > 300) fail('INVALID_INPUT', '拒绝原因不能超过 300 字。')
    const updated = await env.DB.prepare(
      "UPDATE lab_publish_requests SET status='rejected',reason=?,reviewer_id=?,reviewed_at=? WHERE id=? AND status='pending' RETURNING *",
    )
      .bind(reason, user.id, Date.now(), r.id)
      .first<Row>()
    if (!updated) fail('CONFLICT', '该申请正在处理或已结束。', 409)
    return json(requestView(updated))
  }
  return null
}
