import { canUseLab } from '../lab-access.js'
import {
  BASE,
  MiB,
  LabError,
  body,
  bytes,
  candidates,
  configured,
  digest,
  experiment,
  fail,
  imageSize,
  json,
  objectResponse,
  type LabEnv,
  type ReadyEnv,
  type Row,
} from './common.js'
import { runner, startTask, sweep } from './tasks.js'
import { publishCalibration } from './publish.js'
export { sweep } from './tasks.js'

function taskView(t: Row) {
  return {
    id: t.id,
    model: t.model,
    status: t.status,
    parameters: JSON.parse(t.parameters),
    progress: t.progress,
    message: t.message,
    error: t.error ? JSON.parse(t.error) : null,
    candidateCount: t.candidate_count,
    updatedAt: t.updated_at / 1000,
    createdAt: t.created_at / 1000,
  }
}
function calibrationView(c: Row) {
  return {
    id: c.id,
    sourceTaskId: c.source_task_id,
    candidateCount: c.candidate_count,
    changes: JSON.parse(c.changes),
    createdAt: c.created_at / 1000,
    updatedAt: c.created_at / 1000,
    publish: c.publish ? JSON.parse(c.publish) : undefined,
  }
}
async function calibration(env: ReadyEnv, eid: string, id: string) {
  const c = await env.DB.prepare(
    'SELECT * FROM lab_calibrations WHERE id=? AND experiment_id=? AND deleted_at IS NULL',
  )
    .bind(id, eid)
    .first<Row>()
  if (!c) fail('NOT_FOUND', '校准不存在。', 404)
  return c
}
async function gc(env: ReadyEnv, prefix: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO lab_gc VALUES (?,?)')
    .bind(prefix, Date.now())
    .run()
}
export async function handleLab(
  request: Request,
  env: LabEnv,
  user: Row | null,
): Promise<Response> {
  try {
    if (!env.DB || !env.MEDIA)
      fail('NOT_CONFIGURED', '实验数据库和对象存储尚未配置。', 503)
    const ready = env as ReadyEnv,
      url = new URL(request.url),
      path = url.pathname.slice(BASE.length)
    if (path.startsWith('/runner/')) return await runner(request, ready, path)
    if (!user) fail('AUTH_REQUIRED', '请先登录。', 401)
    if (!canUseLab(user)) fail('FORBIDDEN', '尚未获得实验台权限，请联系管理员开通。', 403)
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      request.headers.get('Origin') !== url.origin
    )
      fail('FORBIDDEN', '请从当前站点提交请求。', 403)
    if (path === '/models' && request.method === 'GET')
      return json({
        items: ['sam2', 'sam2_tiled'].map((name) => ({
          name,
          available: configured(env),
          reason: configured(env) ? null : 'actions_not_configured',
          device: 'cpu',
        })),
      })
    if (path === '/health' && request.method === 'GET')
      return json({ status: 'ok', device: 'cpu', mode: 'cloud' })
    if (path === '/experiments' && request.method === 'POST') {
      const raw = await bytes(request, 20 * MiB + 64 * 1024),
        form = await new Request(request.url, {
          method: 'POST',
          headers: {
            'Content-Type': request.headers.get('Content-Type') ?? '',
          },
          body: raw,
        }).formData(),
        image = form.get('image')
      if (
        !(image instanceof File) ||
        !['image/png', 'image/jpeg'].includes(image.type)
      )
        fail('INVALID_IMAGE', '请上传 JPEG 或 PNG 图片。')
      if (image.size > 20 * MiB)
        fail('IMAGE_TOO_LARGE', '图片不能超过 20 MiB。', 413)
      const data = await image.arrayBuffer(),
        { width, height } = imageSize(data, image.type),
        id = crypto.randomUUID(),
        key = `lab/${id}/input`,
        name = image.name.split(/[\\/]/).pop()!.slice(0, 200),
        now = Date.now()
      await env.MEDIA.put(key, data, {
        httpMetadata: { contentType: image.type },
      })
      try {
        await env.DB.prepare(
          'INSERT INTO lab_experiments (id,owner_id,name,width,height,sha256,content_type,input_key,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
          .bind(
            id,
            user.id,
            name,
            width,
            height,
            await digest(data),
            image.type,
            key,
            now,
          )
          .run()
      } catch (e) {
        await env.MEDIA.delete(key)
        throw e
      }
      return json({ id, image: { name, width, height } }, 201)
    }
    if (path === '/experiments' && request.method === 'GET') {
      // Lazy expiry makes state truthful even before the first scheduled tick.
      await expire(ready)
      const es = await env.DB.prepare(
          'SELECT * FROM lab_experiments WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at DESC',
        )
          .bind(user.id)
          .all<Row>(),
        ts = await env.DB.prepare(
          'SELECT * FROM lab_tasks WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at',
        )
          .bind(user.id)
          .all<Row>()
      return json({
        items: es.results.map((e) => ({
          id: e.id,
          image: { name: e.name, width: e.width, height: e.height },
          createdAt: e.created_at / 1000,
          runs: Object.fromEntries(
            ts.results
              .filter((t) => t.experiment_id === e.id)
              .map((t) => [t.id, taskView(t)]),
          ),
        })),
      })
    }
    if (path === '/calibrations' && request.method === 'GET') {
      const result = await env.DB.prepare(
        'SELECT c.*,e.name,e.width,e.height FROM lab_calibrations c JOIN lab_experiments e ON e.id=c.experiment_id WHERE e.owner_id=? AND e.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.created_at DESC',
      )
        .bind(user.id)
        .all<Row>()
      return json({
        items: result.results.map((c) => ({
          ...calibrationView(c),
          experimentId: c.experiment_id,
          imageName: c.name,
          image: { name: c.name, width: c.width, height: c.height },
        })),
      })
    }
    const m = path.match(/^\/experiments\/([\w-]+)(.*)$/)
    if (!m) fail('NOT_FOUND', '接口不存在。', 404)
    const e = await experiment(ready, m[1], user.id),
      tail = m[2]
    if (!tail && request.method === 'DELETE') {
      const now = Date.now()
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE lab_experiments SET deleted_at=? WHERE id=?',
        ).bind(now, e.id),
        env.DB.prepare(
          'UPDATE lab_tasks SET deleted_at=?,token_hash=NULL WHERE experiment_id=?',
        ).bind(now, e.id),
        env.DB.prepare(
          'UPDATE lab_calibrations SET deleted_at=? WHERE experiment_id=?',
        ).bind(now, e.id),
        env.DB.prepare('INSERT OR IGNORE INTO lab_gc VALUES (?,?)').bind(
          `lab/${e.id}/`,
          now,
        ),
      ])
      await sweep(ready)
      return new Response(null, { status: 204 })
    }
    if (tail === '/image' && request.method === 'GET')
      return objectResponse(ready, e.input_key)
    if (tail === '/runs' && request.method === 'POST') {
      await expire(ready)
      return await startTask(request, ready, e, user.id)
    }
    if (tail === '/candidates' && request.method === 'GET') {
      const t = await env.DB.prepare(
        "SELECT * FROM lab_tasks WHERE id=? AND experiment_id=? AND status='succeeded' AND deleted_at IS NULL",
      )
        .bind(url.searchParams.get('source') ?? '', e.id)
        .first<Row>()
      if (!t) fail('NOT_FOUND', '分割结果不存在。', 404)
      return objectResponse(
        ready,
        t.output_prefix + 'candidates.json',
        'application/json',
      )
    }
    const rm = tail.match(/^\/runs\/([\w-]+)$/)
    if (rm && request.method === 'DELETE') {
      const t = await env.DB.prepare(
        'SELECT * FROM lab_tasks WHERE id=? AND experiment_id=? AND deleted_at IS NULL',
      )
        .bind(rm[1], e.id)
        .first<Row>()
      if (!t) fail('NOT_FOUND', '任务不存在。', 404)
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE lab_tasks SET deleted_at=?,token_hash=NULL WHERE id=?',
        ).bind(Date.now(), t.id),
        env.DB.prepare(
          'UPDATE lab_calibrations SET source_task_id=NULL WHERE source_task_id=?',
        ).bind(t.id),
      ])
      await gc(ready, t.output_prefix)
      await sweep(ready)
      return new Response(null, { status: 204 })
    }
    if (tail === '/calibrations' && request.method === 'GET') {
      const cs = await env.DB.prepare(
        'SELECT * FROM lab_calibrations WHERE experiment_id=? AND deleted_at IS NULL ORDER BY created_at DESC',
      )
        .bind(e.id)
        .all<Row>()
      return json({ items: cs.results.map(calibrationView) })
    }
    if (tail === '/calibrations' && request.method === 'POST') {
      const b = await body(request, 10 * MiB),
        items = candidates(b.candidates, e.width, e.height)
      // A resumed calibration can outlive its source run; its copied display image remains usable.
      const t =
        typeof b.sourceTaskId === 'string'
          ? await env.DB.prepare(
              "SELECT * FROM lab_tasks WHERE id=? AND experiment_id=? AND status='succeeded' AND deleted_at IS NULL",
            )
              .bind(b.sourceTaskId, e.id)
              .first<Row>()
          : null
      const old = !t
        ? await env.DB.prepare(
            'SELECT * FROM lab_calibrations WHERE experiment_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
          )
            .bind(e.id)
            .first<Row>()
        : null
      if (!t && !old) fail('NOT_FOUND', '成功任务或已保存校准不存在。', 404)
      const sourceDisplay = t
          ? t.output_prefix + 'display.webp'
          : old!.display_key,
        display = await env.MEDIA.get(sourceDisplay)
      if (!display) fail('NOT_FOUND', '展示图不存在。', 404)
      const id = crypto.randomUUID(),
        key = `lab/${e.id}/calibrations/${id}/`,
        now = Date.now(),
        changes =
          b.changes &&
          typeof b.changes === 'object' &&
          !Array.isArray(b.changes)
            ? b.changes
            : {}
      try {
        await env.MEDIA.put(
          key + 'candidates.json',
          JSON.stringify({ items }),
          { httpMetadata: { contentType: 'application/json' } },
        )
        await env.MEDIA.put(key + 'display.webp', display.body, {
          httpMetadata: { contentType: 'image/webp' },
        })
        const saved = await env.DB.prepare(
          `INSERT INTO lab_calibrations (id,experiment_id,source_task_id,candidates_key,display_key,candidate_count,changes,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM lab_experiments WHERE id=? AND deleted_at IS NULL) RETURNING *`,
        )
          .bind(
            id,
            e.id,
            t?.id ?? null,
            key + 'candidates.json',
            key + 'display.webp',
            items.length,
            JSON.stringify(changes),
            now,
            e.id,
          )
          .first<Row>()
        if (!saved) fail('NOT_FOUND', '实验已删除。', 404)
        return json(calibrationView(saved), 201)
      } catch (error) {
        await gc(ready, key)
        throw error
      }
    }
    const cm = tail.match(/^\/calibrations\/([\w-]+)(\/export.svg|\/publish)?$/)
    if (cm) {
      const c = await calibration(ready, e.id, cm[1])
      if (!cm[2] && request.method === 'GET')
        return objectResponse(ready, c.candidates_key, 'application/json')
      if (!cm[2] && request.method === 'DELETE') {
        await env.DB.prepare(
          'UPDATE lab_calibrations SET deleted_at=? WHERE id=?',
        )
          .bind(Date.now(), c.id)
          .run()
        await gc(ready, `lab/${e.id}/calibrations/${c.id}/`)
        await sweep(ready)
        return new Response(null, { status: 204 })
      }
      if (cm[2] === '/publish' && request.method === 'POST') {
        const b = await body(request)
        if (b.target !== undefined && b.target !== 'cloudflare')
          fail('INVALID_TARGET', '云端校准发布到当前 Cloudflare 站点。')
        return await publishCalibration(
          request,
          ready,
          e,
          c,
          user.id,
          String(b.wallName ?? `${e.name} · 校准`),
        )
      }
      if (cm[2] === '/export.svg' && request.method === 'GET') {
        const o = await env.MEDIA.get(c.candidates_key)
        if (!o) fail('NOT_FOUND', '校准文件不存在。', 404)
        const items = candidates(
            JSON.parse(await o.text()).items,
            e.width,
            e.height,
          ),
          svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${e.width}" height="${e.height}" viewBox="0 0 ${e.width} ${e.height}"><style>polygon{fill:#77c94b44;stroke:#3d8b38;stroke-width:3;vector-effect:non-scaling-stroke}</style>${items.map((x) => `<polygon id="${x.id}" points="${x.polygon.map((p: number[]) => p.join(',')).join(' ')}"/>`).join('')}</svg>`
        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-store',
            'Content-Disposition': `attachment; filename="${c.id}.svg"`,
          },
        })
      }
    }
    return fail('NOT_FOUND', '接口不存在。', 404)
  } catch (error) {
    if (error instanceof LabError)
      return json(
        {
          error: { code: error.code, message: error.message },
          code: error.code,
          message: error.message,
          retryable: error.status >= 500,
        },
        error.status,
      )
    console.error(
      'lab_request_failed',
      error instanceof Error ? error.name : 'unknown',
    )
    return json(
      {
        error: {
          code: 'LAB_ERROR',
          message: '实验服务暂时不可用，请稍后重试。',
        },
      },
      500,
    )
  }
}
async function expire(env: ReadyEnv) {
  await env.DB.prepare(
    "UPDATE lab_tasks SET status='timed_out',token_hash=NULL,error=?,message='任务超时',updated_at=? WHERE deleted_at IS NULL AND status IN ('queued','running') AND deadline<=?",
  )
    .bind(
      JSON.stringify({
        code: 'TIMED_OUT',
        message: '任务超时，可以重新运行。',
      }),
      Date.now(),
      Date.now(),
    )
    .run()
}
