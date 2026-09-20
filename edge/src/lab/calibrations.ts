import { candidates, digest, fail, type ReadyEnv, type Row } from './common.js'
import { cleanupStatement } from './gc.js'

const canonical = (value: any): string => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value)

export function calibrationView(c: Row) {
  return {
    id: c.id, sourceTaskId: c.source_task_id, candidateCount: c.candidate_count,
    changes: JSON.parse(c.changes), createdAt: c.created_at / 1000, updatedAt: c.created_at / 1000,
    publish: c.publish ? JSON.parse(c.publish) : undefined,
  }
}

async function reusable(env: ReadyEnv, row: Row | null): Promise<Row | null> {
  // Keep the existing workflow: a deleted public wall can be recreated by saving a new snapshot.
  if (row?.publish) {
    const receipt = JSON.parse(row.publish)
    if (!(await env.DB.prepare('SELECT id FROM walls WHERE id=?').bind(receipt.wallId).first())) return null
  }
  return row
}

export async function saveCalibration(env: ReadyEnv, e: Row, b: Row) {
  const items = candidates(b.candidates, e.width, e.height)
  const changes = b.changes && typeof b.changes === 'object' && !Array.isArray(b.changes) ? b.changes : {}
  const t = typeof b.sourceTaskId === 'string'
    ? await env.DB.prepare("SELECT * FROM lab_tasks WHERE id=? AND experiment_id=? AND status='succeeded' AND deleted_at IS NULL")
      .bind(b.sourceTaskId, e.id).first<Row>() : null
  const explicit = b.sourceCalibrationId !== undefined && b.sourceCalibrationId !== null
  if (explicit && typeof b.sourceCalibrationId !== 'string') fail('INVALID_INPUT', '校准来源无效。')
  const old = explicit
    ? await env.DB.prepare('SELECT * FROM lab_calibrations WHERE id=? AND experiment_id=? AND deleted_at IS NULL')
      .bind(b.sourceCalibrationId, e.id).first<Row>()
    : await env.DB.prepare(`SELECT * FROM lab_calibrations WHERE experiment_id=? AND deleted_at IS NULL
        ${t ? 'AND source_task_id=?' : ''} ORDER BY created_at DESC,id DESC LIMIT 1`)
      .bind(e.id, ...(t ? [t.id] : [])).first<Row>()
  if ((explicit && !old) || (!t && !old)) fail('NOT_FOUND', '成功任务或已保存校准不存在。', 404)
  const useOld = explicit || !t
  const displayKey = useOld ? old!.display_key : t!.output_prefix + 'display.webp'
  const imageSource = useOld ? old!.image_source_key || old!.display_key : displayKey
  const contentHash = await digest(canonical({imageSource, items, changes}))
  const findExisting = async () => reusable(env, await env.DB.prepare(`SELECT * FROM lab_calibrations
    WHERE experiment_id=? AND content_hash=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(e.id, contentHash).first<Row>())
  const existing = await findExisting()
  if (existing) return {row: existing, reused: true}

  const now = Date.now(), token = crypto.randomUUID()
  const lease = await env.DB.prepare(`INSERT INTO lab_calibration_save_locks VALUES (?,?,?,?)
    ON CONFLICT(experiment_id,content_hash) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
    WHERE lab_calibration_save_locks.expires_at<=? RETURNING token`)
    .bind(e.id, contentHash, token, now + 10 * 60000, now).first()
  if (!lease) fail('SAVE_IN_PROGRESS', '相同校准正在保存，请稍后重试。', 409)
  const id = crypto.randomUUID(), key = `lab/${e.id}/calibrations/${id}/`
  let startedWriting = false
  try {
    const prior = await findExisting()
    if (prior) return {row: prior, reused: true}
    // Upgrade a legacy snapshot lazily, without rewriting its files.
    if (old && !old.content_hash && (old.image_source_key || old.display_key) === imageSource && await reusable(env, old)) {
      const source = await env.MEDIA.get(old.candidates_key)
      if (source && await digest(canonical({imageSource, items: JSON.parse(await source.text()).items, changes: JSON.parse(old.changes)})) === contentHash) {
        const upgraded = await env.DB.prepare('UPDATE lab_calibrations SET content_hash=? WHERE id=? AND deleted_at IS NULL RETURNING *')
          .bind(contentHash, old.id).first<Row>()
        if (upgraded) return {row: upgraded, reused: true}
      }
    }
    const display = await env.MEDIA.get(displayKey)
    if (!display) fail('NOT_FOUND', '展示图不存在。', 404)
    startedWriting = true
    await env.MEDIA.put(key + 'candidates.json', JSON.stringify({items}), {httpMetadata: {contentType: 'application/json'}})
    await env.MEDIA.put(key + 'display.webp', display.body, {httpMetadata: {contentType: 'image/webp'}})
    const sourceTask = useOld ? old!.source_task_id : t!.id
    const saved = await env.DB.prepare(`INSERT INTO lab_calibrations
      (id,experiment_id,source_task_id,candidates_key,display_key,candidate_count,changes,created_at,content_hash,image_source_key)
      SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM lab_tasks WHERE id=? AND deleted_at IS NULL) THEN ? ELSE NULL END,?,?,?,?,?,?,?
      WHERE EXISTS(SELECT 1 FROM lab_experiments WHERE id=? AND deleted_at IS NULL)
      AND EXISTS(SELECT 1 FROM lab_calibration_save_locks WHERE experiment_id=? AND content_hash=? AND token=? AND expires_at>?) RETURNING *`)
      .bind(id, e.id, sourceTask, sourceTask, key + 'candidates.json', key + 'display.webp', items.length,
        JSON.stringify(changes), Date.now(), contentHash, imageSource, e.id, e.id, contentHash, token, Date.now()).first<Row>()
    if (!saved) fail('SAVE_EXPIRED', '保存已失效或实验已删除，请重新加载后再试。', 409)
    return {row: saved, reused: false}
  } catch (error) {
    if (startedWriting) await cleanupStatement(env.DB, key).run()
    throw error
  } finally {
    await env.DB.prepare('DELETE FROM lab_calibration_save_locks WHERE experiment_id=? AND content_hash=? AND token=?')
      .bind(e.id, contentHash, token).run()
  }
}
