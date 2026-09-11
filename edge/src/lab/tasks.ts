import {
  BASE,
  MiB,
  bearer,
  body,
  bytes,
  candidates,
  configured,
  digest,
  equalSecret,
  experiment,
  fail,
  json,
  objectResponse,
  parameters,
  type ReadyEnv,
  type Row,
} from './common.js'

export async function startTask(
  request: Request,
  env: ReadyEnv,
  e: Row,
  owner: string,
) {
  if (!configured(env))
    fail('NOT_CONFIGURED', '云端分割尚未配置 GitHub Actions。', 503)
  const payload = await body(request),
    model = payload.model ?? 'sam2'
  if (!['sam2', 'sam2_tiled'].includes(model))
    fail('MODEL_UNAVAILABLE', '云端支持 SAM2 和 SAM2 分块。')
  const p = parameters(payload.parameters),
    id = crypto.randomUUID(),
    attempt = crypto.randomUUID(),
    now = Date.now()
  const row = await env.DB.prepare(
    `INSERT INTO lab_tasks (id,experiment_id,owner_id,attempt_id,model,parameters,status,output_prefix,created_at,updated_at,deadline)
    SELECT ?,?,?,?,?,?,'queued',?,?,?,? WHERE (SELECT COUNT(*) FROM lab_tasks WHERE owner_id=? AND deleted_at IS NULL AND status IN ('queued','running'))<2
    AND EXISTS (SELECT 1 FROM lab_experiments WHERE id=? AND deleted_at IS NULL) RETURNING id`,
  )
    .bind(
      id,
      e.id,
      owner,
      attempt,
      model,
      JSON.stringify(p),
      `lab/${e.id}/tasks/${id}/`,
      now,
      now,
      now + 30 * 60000,
      owner,
      e.id,
    )
    .first()
  if (!row) fail('TASK_LIMIT', '最多同时保留两个未完成任务。', 429)
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(env.LAB_GITHUB_REPOSITORY!))
      throw new Error('invalid repository')
    const response = await fetch(
      `https://api.github.com/repos/${env.LAB_GITHUB_REPOSITORY}/actions/workflows/${encodeURIComponent(env.LAB_GITHUB_WORKFLOW ?? 'segmentation-lab.yml')}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.LAB_GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'CruxSet-Segmentation-Lab',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: env.LAB_GITHUB_REF,
          inputs: { task_id: id, attempt_id: attempt },
        }),
        signal: AbortSignal.timeout(15000),
      },
    )
    if (!response.ok) throw new Error(`dispatch status ${response.status}`)
  } catch {
    // Never store upstream response bodies: credentials, URLs and provider details stay server-side.
    await env.DB.prepare(
      "UPDATE lab_tasks SET status='failed',error=?,message=?,updated_at=? WHERE id=? AND status='queued'",
    )
      .bind(
        JSON.stringify({
          code: 'DISPATCH_FAILED',
          message: 'GitHub 任务触发失败，请稍后重试。',
        }),
        '触发失败',
        Date.now(),
        id,
      )
      .run()
  }
  const state = await env.DB.prepare('SELECT status FROM lab_tasks WHERE id=?')
    .bind(id)
    .first<Row>()
  return json({ taskId: id, status: state?.status ?? 'failed' }, 202)
}

async function authenticatedTask(
  request: Request,
  env: ReadyEnv,
  id: string,
): Promise<Row> {
  const token = bearer(request)
  if (!token) fail('AUTH_REQUIRED', '任务凭据无效。', 401)
  const t = await env.DB.prepare(
    'SELECT t.*,e.width,e.height,e.input_key FROM lab_tasks t JOIN lab_experiments e ON e.id=t.experiment_id WHERE t.id=? AND t.deleted_at IS NULL AND e.deleted_at IS NULL AND t.token_hash=?',
  )
    .bind(id, await digest(token))
    .first<Row>()
  if (!t || t.deadline < Date.now())
    fail('AUTH_REQUIRED', '任务凭据无效或已过期。', 401)
  return t
}
export async function runner(
  request: Request,
  env: ReadyEnv,
  path: string,
): Promise<Response> {
  if (path === '/runner/claim' && request.method === 'POST') {
    if (
      !env.LAB_RUNNER_KEY ||
      !(await equalSecret(bearer(request), env.LAB_RUNNER_KEY))
    )
      fail('AUTH_REQUIRED', '执行器凭据无效。', 401)
    const b = await body(request)
    if (
      typeof b.taskId !== 'string' ||
      typeof b.attemptId !== 'string' ||
      typeof b.runId !== 'string' ||
      !/^\d+:\d+$/.test(b.runId)
    )
      fail('INVALID_INPUT', '领取参数无效。')
    const token = crypto.randomUUID() + crypto.randomUUID(),
      now = Date.now()
    const t = await env.DB.prepare(
      `UPDATE lab_tasks SET status='running',token_hash=?,run_id=?,deadline=?,updated_at=?,message='正在准备模型'
      WHERE id=? AND attempt_id=? AND status='queued' AND deleted_at IS NULL AND deadline>?
      AND EXISTS (SELECT 1 FROM lab_experiments e WHERE e.id=lab_tasks.experiment_id AND e.deleted_at IS NULL) RETURNING *`,
    )
      .bind(
        await digest(token),
        b.runId,
        now + 120 * 60000,
        now,
        b.taskId,
        b.attemptId,
        now,
      )
      .first<Row>()
    if (!t) fail('TASK_UNAVAILABLE', '任务已领取、失效或不存在。', 409)
    const e = await experiment(env, t.experiment_id)
    return json({
      token,
      task: {
        id: t.id,
        attemptId: t.attempt_id,
        experimentId: e.id,
        model: t.model,
        parameters: JSON.parse(t.parameters),
        image: {
          name: e.name,
          width: e.width,
          height: e.height,
          sha256: e.sha256,
        },
      },
      inputUrl: `${new URL(request.url).origin}${BASE}/runner/tasks/${t.id}/input`,
    })
  }
  const m = path.match(
    /^\/runner\/tasks\/([\w-]+)\/(input|progress|complete|outputs\/(candidates.json|display.webp|masks.zip))$/,
  )
  if (!m) fail('NOT_FOUND', '接口不存在。', 404)
  const t = await authenticatedTask(request, env, m[1]),
    action = m[2]
  if (action === 'complete' && request.method === 'POST') {
    const b = await body(request)
    if (!['succeeded', 'failed'].includes(b.status))
      fail('INVALID_INPUT', '完成状态无效。')
    if (t.status === b.status) return json({ status: t.status })
    if (t.status !== 'running') fail('TASK_FINISHED', '任务已结束。', 409)
    let count = 0
    if (b.status === 'succeeded') {
      for (const name of ['candidates.json', 'display.webp', 'masks.zip'])
        if (!(await env.MEDIA.head(t.output_prefix + name)))
          fail('OUTPUTS_MISSING', '结果尚未完整上传。', 409)
      const file = await env.MEDIA.get(t.output_prefix + 'candidates.json')
      const output = JSON.parse(await file!.text())
      count = candidates(output.items, t.width, t.height).length
    }
    const safeErrors: Record<string, string> = {
      invalid_input: '输入图片校验失败，请重新上传。',
      invalid_parameters: '分割参数无效，请重新配置。',
      generation_failed: '模型分割失败，请降低点密度或缩小图片后重试。',
      output_too_large: '结果文件过大，请缩小图片或调整参数。',
      remote_request_failed: '结果传输失败，请稍后重试。',
      runner_failed: '执行器运行失败，请重试并检查工作流。',
      completion_failed: '结果回传未确认，请检查任务状态。',
    }
    const code =
      typeof b.error?.code === 'string' && b.error.code in safeErrors
        ? b.error.code
        : 'generation_failed'
    const err =
      b.status === 'failed' ? { code, message: safeErrors[code] } : null
    const changed = await env.DB.prepare(
      "UPDATE lab_tasks SET status=?,candidate_count=?,progress=?,message=?,error=?,updated_at=? WHERE id=? AND status='running' AND deleted_at IS NULL AND deadline>? RETURNING id",
    )
      .bind(
        b.status,
        count,
        b.status === 'succeeded' ? 1 : t.progress,
        b.status === 'succeeded' ? '已完成' : '任务失败',
        err ? JSON.stringify(err) : null,
        Date.now(),
        t.id,
        Date.now(),
      )
      .first()
    if (!changed) fail('TASK_FINISHED', '任务已失效。', 409)
    return json({ status: b.status })
  }
  if (t.status !== 'running') fail('TASK_FINISHED', '任务已结束。', 409)
  if (action === 'input' && request.method === 'GET')
    return objectResponse(env, t.input_key)
  if (action === 'progress' && request.method === 'POST') {
    const b = await body(request)
    if (
      typeof b.progress !== 'number' ||
      !Number.isFinite(b.progress) ||
      b.progress < 0 ||
      b.progress > 1 ||
      typeof b.message !== 'string' ||
      b.message.length > 200
    )
      fail('INVALID_INPUT', '进度格式无效。')
    await env.DB.prepare(
      "UPDATE lab_tasks SET progress=MAX(progress,?),message=?,updated_at=? WHERE id=? AND status='running' AND deleted_at IS NULL",
    )
      .bind(Math.min(0.98, b.progress), b.message, Date.now(), t.id)
      .run()
    return json({ ok: true })
  }
  if (action.startsWith('outputs/') && request.method === 'PUT') {
    const name = m[3]
    let data: ArrayBuffer | ReadableStream
    if (name === 'masks.zip') {
      const length = Number(request.headers.get('Content-Length'))
      if (!request.body || !Number.isSafeInteger(length) || length < 1)
        fail('LENGTH_REQUIRED', 'Mask 上传需要准确的 Content-Length。', 411)
      if (length > 64 * MiB) fail('TOO_LARGE', 'Mask 包超过限制。', 413)
      // R2 accepts a request body with known length; transforming it loses that metadata.
      // Archives are opaque private outputs, never unpacked by the Worker.
      data = request.body
    } else data = await bytes(request, 10 * MiB)
    const view = data instanceof ArrayBuffer ? new Uint8Array(data) : null
    if (data instanceof ArrayBuffer && !data.byteLength)
      fail('INVALID_OUTPUT', '结果文件为空。')
    if (name === 'candidates.json') {
      let b: Row
      try {
        b = JSON.parse(new TextDecoder().decode(view!))
      } catch {
        fail('INVALID_OUTPUT', '候选 JSON 无效。')
      }
      candidates(b!.items, t.width, t.height)
    }
    if (
      name === 'display.webp' &&
      (new TextDecoder().decode(view!.slice(0, 4)) !== 'RIFF' ||
        new TextDecoder().decode(view!.slice(8, 12)) !== 'WEBP')
    )
      fail('INVALID_OUTPUT', '展示图必须是 WebP。')
    // Immutable outputs prevent a late PUT racing with completion from changing visible results.
    await env.MEDIA.put(t.output_prefix + name, data, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: {
        contentType:
          name === 'candidates.json'
            ? 'application/json'
            : name === 'display.webp'
              ? 'image/webp'
              : 'application/zip',
      },
    })
    const live = await env.DB.prepare(
      "SELECT id FROM lab_tasks WHERE id=? AND status IN ('running','succeeded') AND deleted_at IS NULL AND deadline>?",
    )
      .bind(t.id, Date.now())
      .first()
    if (!live) {
      await env.DB.prepare('INSERT OR IGNORE INTO lab_gc VALUES (?,?)')
        .bind(t.output_prefix, Date.now())
        .run()
      fail('TASK_FINISHED', '任务已失效。', 409)
    }
    return json({ ok: true })
  }
  return fail('NOT_FOUND', '接口不存在。', 404)
}

export async function sweep(env: ReadyEnv) {
  const now = Date.now()
  await env.DB.prepare(
    "UPDATE lab_tasks SET status='timed_out',token_hash=NULL,error=?,message='任务超时',updated_at=? WHERE deleted_at IS NULL AND status IN ('queued','running') AND deadline<=?",
  )
    .bind(
      JSON.stringify({
        code: 'TIMED_OUT',
        message: '任务等待或执行超时，可以重新运行。',
      }),
      now,
      now,
    )
    .run()
  const rows = await env.DB.prepare(
    'SELECT prefix,created_at FROM lab_gc ORDER BY created_at LIMIT 30',
  ).all<Row>()
  for (const row of rows.results ?? []) {
    try {
      const listed = await env.MEDIA.list({ prefix: row.prefix, limit: 500 })
      if (listed.objects.length)
        await env.MEDIA.delete(listed.objects.map((o) => o.key))
      // Keep tombstone cleanup for 24h: an in-flight upload can finish after deletion.
      if (!listed.truncated && now - row.created_at > 86400000)
        await env.DB.prepare('DELETE FROM lab_gc WHERE prefix=?')
          .bind(row.prefix)
          .run()
    } catch {
      /* Keep durable GC entry for the next scheduled sweep. */
    }
  }
}
