import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { sweepCleanup } from '../src/lab/gc.js'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

it('preserves legacy cleanup records, due times and exact media keys', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  try {
    for (const file of readdirSync(dir).sort().filter(f => f < '0017_lab_gc_schedule.sql')) {
      sqlite.exec(readFileSync(new URL(file, dir), 'utf8'))
    }
    const now = Date.now(), old = now - 25 * 3600000, recent = now - 3600000
    sqlite.prepare('INSERT INTO lab_gc VALUES (?,?)').run('lab/old/', old)
    sqlite.prepare('INSERT INTO lab_gc VALUES (?,?)').run('media_x.webp', recent)
    sqlite.prepare('INSERT INTO lab_gc VALUES (?,?)').run('lab-publish-requests/old/', recent)
    sqlite.exec(readFileSync(new URL('0017_lab_gc_schedule.sql', dir), 'utf8'))
    expect(sqlite.prepare('SELECT * FROM lab_gc WHERE prefix=?').get('media_x.webp')).toMatchObject({
      kind: 'object', created_at: recent, next_attempt_at: recent, finalize_after: recent + 86400000,
    })
    const db = {prepare(sql: string) {
      let args: unknown[] = []
      const stmt = {
        bind(...values: unknown[]) {args = values; return stmt},
        async first() {return sqlite.prepare(sql).get(...args)},
        async all() {return {results: sqlite.prepare(sql).all(...args)}},
        async run() {return sqlite.prepare(sql).run(...args)},
      }
      return stmt
    }} as unknown as D1Database
    const list = vi.fn(async () => ({objects: [], truncated: false})), remove = vi.fn()
    await sweepCleanup({DB: db, MEDIA: {list, delete: remove} as unknown as R2Bucket})
    expect(sqlite.prepare('SELECT * FROM lab_gc WHERE prefix=?').get('lab/old/')).toBeUndefined()
    expect(sqlite.prepare('SELECT * FROM lab_gc WHERE prefix=?').get('media_x.webp').next_attempt_at).toBe(recent + 2 * 3600000)
    expect(list).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('media_x.webp')
    expect(remove).toHaveBeenCalledWith(['lab-publish-requests/old/display.webp', 'lab-publish-requests/old/snapshot.json'])
  } finally {sqlite.close()}
})
