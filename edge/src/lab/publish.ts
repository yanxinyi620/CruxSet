import { candidates, fail, json, type ReadyEnv, type Row } from './common.js'

export async function publishCalibration(
  request: Request,
  env: ReadyEnv,
  e: Row,
  c: Row,
  owner: string,
  wallName: string,
) {
  if (c.publish) return json(JSON.parse(c.publish))
  const name = wallName.trim()
  if (!name || name.length > 120)
    fail('INVALID_INPUT', '墙面名称须为 1–120 字。')
  const source = await env.MEDIA.get(c.candidates_key),
    image = await env.MEDIA.get(c.display_key)
  if (!source || !image) fail('NOT_FOUND', '校准文件或展示图不存在。', 404)
  const items = candidates(
    JSON.parse(await source.text()).items,
    e.width,
    e.height,
  )
  if (!items.length) fail('INVALID_CANDIDATES', '请至少保存一个岩点。')
  // Deterministic IDs and a D1 transaction make concurrent publication of a snapshot idempotent.
  const id = `wall_lab_${c.id}`,
    media = `media_lab_${c.id}.webp`,
    now = Date.now()
  await env.MEDIA.put(media, image.body, {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=31536000,immutable',
    },
  })
  const browseUrl = `${new URL(request.url).origin}/wall/${id}`
  const result = {
    target: 'cloudflare',
    status: 'succeeded',
    wallId: id,
    browseUrl,
    wallName: name,
    publishedAt: now / 1000,
    targets: { cloudflare: { status: 'succeeded', wallId: id, browseUrl } },
  }
  const holds = items.map((h, i) => {
    const p = h.polygon.map((point: number[]) => [
        point[0] / e.width,
        point[1] / e.height,
      ]),
      xs = p.map((q: number[]) => q[0]),
      ys = p.map((q: number[]) => q[1])
    return env.DB.prepare(
      `INSERT OR IGNORE INTO holds (wall_id,id,x,y,radius,kind,polygon_json)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM walls WHERE id=?)`,
    ).bind(
      id,
      `H${String(i + 1).padStart(3, '0')}`,
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
      Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ) / 2,
      h.kind ?? 'hold',
      JSON.stringify(p),
      id,
    )
  })
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO walls (id,wall_number,name,description,image_path,image_width,image_height,geometry_type,angle_options_json,owner_id,visibility,published,created_at,updated_at)
      SELECT ?,(SELECT COALESCE(MAX(wall_number),0)+1 FROM walls),?,'',?,?,?,'polygon',?,?, 'public',1,?,?
      WHERE EXISTS (SELECT 1 FROM lab_calibrations c JOIN lab_experiments e ON c.experiment_id=e.id WHERE c.id=? AND c.deleted_at IS NULL AND e.deleted_at IS NULL)`,
    ).bind(
      id,
      name,
      `/api/v1/media/${media}`,
      e.width,
      e.height,
      JSON.stringify([20, 25, 30, 35, 40, 45]),
      owner,
      now,
      now,
      c.id,
    ),
    ...holds,
    env.DB.prepare(
      'UPDATE lab_calibrations SET publish=? WHERE id=? AND publish IS NULL AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM walls WHERE id=?)',
    ).bind(JSON.stringify(result), c.id, id),
  ])
  const saved = await env.DB.prepare(
    'SELECT publish FROM lab_calibrations WHERE id=?',
  )
    .bind(c.id)
    .first<Row>()
  if (!saved?.publish) {
    await env.MEDIA.delete(media)
    fail('NOT_FOUND', '校准已删除。', 404)
  }
  return json(JSON.parse(saved.publish), 201)
}
