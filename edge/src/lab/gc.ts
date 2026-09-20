import type { ReadyEnv } from './common.js'

const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const LEASE = 5 * MINUTE
const RETRY_MINUTES = [5, 15, 30, 60]
type Kind = 'prefix' | 'object' | 'snapshot'
interface CleanupRow {
  prefix: string
  created_at: number
  kind: Kind
  next_attempt_at: number
  finalize_after: number
  phase: number
  failures: number
  version: number
  lease_token: string
}

/** A statement so business deletion and durable cleanup can share a D1 transaction. */
export function cleanupStatement(
  db: D1Database,
  prefix: string,
  options: {
    kind?: Kind
    now?: number
    guard?: { sql: string; values: (string | number)[] }
  } = {},
): D1PreparedStatement {
  const now = options.now ?? Date.now()
  const guard = options.guard ?? { sql: '1', values: [] }
  return db.prepare(`INSERT INTO lab_gc
    (prefix,created_at,kind,next_attempt_at,finalize_after)
    SELECT ?,?,?,?,? WHERE ${guard.sql}
    ON CONFLICT(prefix) DO UPDATE SET
      next_attempt_at=MIN(lab_gc.next_attempt_at,excluded.next_attempt_at),
      finalize_after=MAX(lab_gc.finalize_after,excluded.finalize_after),
      kind=excluded.kind,phase=0,failures=0,version=lab_gc.version+1`)
    .bind(prefix, now, options.kind ?? 'prefix', now, now + DAY, ...guard.values)
}

/** Process just this target, at most one page; never scan the global queue here. */
export async function cleanTarget(env: ReadyEnv, prefix: string) {
  const now = Date.now(), token = crypto.randomUUID()
  const row = await env.DB.prepare(`UPDATE lab_gc SET lease_token=?,lease_until=?
    WHERE prefix=? AND next_attempt_at<=? AND lease_until<=? RETURNING *`)
    .bind(token, now + LEASE, prefix, now, now).first<CleanupRow>()
  if (!row) return
  try {
    let more = false
    if (row.kind === 'object') {
      await env.MEDIA.delete(row.prefix)
    } else if (row.kind === 'snapshot') {
      await env.MEDIA.delete([row.prefix + 'display.webp', row.prefix + 'snapshot.json'])
    } else {
      const listed = await env.MEDIA.list({prefix: row.prefix, limit: 500})
      if (listed.objects.length) await env.MEDIA.delete(listed.objects.map(o => o.key))
      more = listed.truncated
    }
    const finished = Date.now()
    const finalAt = row.finalize_after || row.created_at + DAY
    if (!more && finished >= finalAt) {
      await env.DB.prepare('DELETE FROM lab_gc WHERE prefix=? AND version=? AND lease_token=?')
        .bind(prefix, row.version, token).run()
    } else {
      // A late enqueue moves finalAt and therefore the two-hour check together.
      const recheckAt = finalAt - DAY + 2 * HOUR
      const next = more ? finished + 5 * MINUTE : finished < recheckAt ? recheckAt : finalAt
      const phase = more ? row.phase : finished < recheckAt ? 1 : 2
      await env.DB.prepare(`UPDATE lab_gc SET next_attempt_at=?,phase=?,failures=0
        WHERE prefix=? AND version=? AND lease_token=?`)
        .bind(next, phase, prefix, row.version, token).run()
    }
  } catch {
    const delay = RETRY_MINUTES[Math.min(row.failures, RETRY_MINUTES.length - 1)] * MINUTE
    await env.DB.prepare(`UPDATE lab_gc SET next_attempt_at=?,failures=failures+1
      WHERE prefix=? AND version=? AND lease_token=?`)
      .bind(Date.now() + delay, prefix, row.version, token).run()
    console.error('lab_gc_retry', {prefix, attempt: row.failures + 1, retryAfterMs: delay})
  } finally {
    // Release our lease even when a new enqueue has invalidated our version.
    await env.DB.prepare('UPDATE lab_gc SET lease_token=NULL,lease_until=0 WHERE prefix=? AND lease_token=?')
      .bind(prefix, token).run()
  }
}

export async function sweepCleanup(env: ReadyEnv) {
  const now = Date.now()
  const rows = await env.DB.prepare(`SELECT prefix FROM lab_gc
    WHERE next_attempt_at<=? AND lease_until<=?
    ORDER BY next_attempt_at,created_at,prefix LIMIT 30`)
    .bind(now, now).all<{prefix: string}>()
  for (const row of rows.results) await cleanTarget(env, row.prefix)
}
