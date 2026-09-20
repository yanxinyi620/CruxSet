import { afterEach, expect, it, vi } from 'vitest'
import { database } from './helpers/database.js'
import { sweep } from '../src/lab/tasks.js'

const HOUR = 3600000
const START = 1800000000000
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(START)
  const {db, sqlite} = database()
  const objects = new Set<string>()
  const list = vi.fn(async ({prefix, limit}: {prefix: string; limit: number}) => {
    const keys = [...objects].filter(k => k.startsWith(prefix)).sort()
    return {objects: keys.slice(0, limit).map(key => ({key})), truncated: keys.length > limit}
  })
  const remove = vi.fn(async (keys: string | string[]) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) objects.delete(key)
  })
  const env = {DB: db, MEDIA: {list, delete: remove} as unknown as R2Bucket}
  const add = (prefix: string) => sqlite.prepare('INSERT INTO lab_gc(prefix,created_at) VALUES (?,?)').run(prefix, START)
  return {env, sqlite, objects, list, remove, add}
}

it('only lists at initial cleanup, two hours and 24 hours', async () => {
  const f = fixture(); f.add('lab/e/'); f.objects.add('lab/e/input.webp')
  await sweep(f.env)
  expect(f.objects.size).toBe(0)
  for (let minute = 5; minute < 120; minute += 5) {
    vi.setSystemTime(START + minute * 60000); await sweep(f.env)
  }
  expect(f.list).toHaveBeenCalledTimes(1)
  vi.setSystemTime(START + 2 * HOUR); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(2)
  vi.setSystemTime(START + 24 * HOUR); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(3)
  expect(f.sqlite.prepare('SELECT * FROM lab_gc').all()).toHaveLength(0)
})

it('does not let 30 waiting records prevent a new target from being cleaned', async () => {
  const f = fixture()
  for (let n = 0; n < 30; n++) f.add(`lab/${n}/`)
  await sweep(f.env)
  f.add('lab/new/'); f.objects.add('lab/new/input.webp')
  await sweep(f.env)
  expect(f.objects.has('lab/new/input.webp')).toBe(false)
  expect(f.list).toHaveBeenCalledTimes(31)
})

it('backs off failures instead of retrying every scheduled tick', async () => {
  const f = fixture(); f.add('lab/e/')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  f.list.mockRejectedValue(new Error('unavailable'))
  await sweep(f.env)
  vi.setSystemTime(START + 5 * 60000); await sweep(f.env)
  vi.setSystemTime(START + 10 * 60000); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(2)
  vi.setSystemTime(START + 20 * 60000); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(3)
})

it('claims a target before storage access so concurrent sweeps do not duplicate it', async () => {
  const f = fixture(); f.add('lab/e/')
  await Promise.all([sweep(f.env), sweep(f.env)])
  expect(f.list).toHaveBeenCalledTimes(1)
})

it('continues large prefixes on the next tick before scheduling a long wait', async () => {
  const f = fixture(); f.add('lab/e/')
  for (let n = 0; n < 501; n++) f.objects.add(`lab/e/${n}`)
  await sweep(f.env); expect(f.objects.size).toBe(1)
  vi.setSystemTime(START + 5 * 60000); await sweep(f.env)
  expect(f.objects.size).toBe(0)
  vi.setSystemTime(START + 10 * 60000); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(2)
})

import { cleanupStatement, cleanTarget } from '../src/lab/gc.js'

it('reawakens an existing record and extends protection when a late upload arrives', async () => {
  const f = fixture()
  await cleanupStatement(f.env.DB, 'lab/e/').run(); await sweep(f.env)
  vi.setSystemTime(START + 23 * HOUR)
  await cleanupStatement(f.env.DB, 'lab/e/').run()
  f.objects.add('lab/e/late.webp')
  await sweep(f.env)
  expect(f.objects.size).toBe(0)
  vi.setSystemTime(START + 24 * HOUR); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(2)
  vi.setSystemTime(START + 25 * HOUR); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(3)
  vi.setSystemTime(START + 47 * HOUR); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(4)
  expect(f.sqlite.prepare('SELECT * FROM lab_gc').all()).toHaveLength(0)
})

it('does not discard a new cleanup request received during the final pass', async () => {
  const f = fixture()
  await cleanupStatement(f.env.DB, 'lab/e/').run()
  vi.setSystemTime(START + 24 * HOUR)
  f.list.mockImplementationOnce(async () => {
    await cleanupStatement(f.env.DB, 'lab/e/').run()
    return {objects: [], truncated: false}
  })
  await sweep(f.env)
  expect(f.sqlite.prepare('SELECT * FROM lab_gc').get()).toMatchObject({
    finalize_after: START + 48 * HOUR, version: 2, lease_until: 0,
  })
  f.objects.add('lab/e/late.webp')
  await sweep(f.env)
  expect(f.objects.size).toBe(0)
  expect(f.sqlite.prepare('SELECT * FROM lab_gc').get()).toBeTruthy()
})

it('retains an overdue record through failures and caps retries at one hour', async () => {
  const f = fixture(); await cleanupStatement(f.env.DB, 'lab/e/').run()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.setSystemTime(START + 24 * HOUR)
  f.remove.mockRejectedValue(new Error('delete unavailable'))
  f.objects.add('lab/e/input.webp')
  let now = Date.now()
  for (const delay of [5, 15, 30, 60, 60]) {
    await sweep(f.env)
    const row = f.sqlite.prepare('SELECT * FROM lab_gc').get()
    expect(row.next_attempt_at).toBe(now + delay * 60000)
    now += delay * 60000; vi.setSystemTime(now)
  }
  f.remove.mockImplementation(async keys => {
    for (const key of typeof keys === 'string' ? [keys] : keys) f.objects.delete(key)
  })
  await sweep(f.env)
  expect(f.objects.size).toBe(0)
  expect(f.sqlite.prepare('SELECT * FROM lab_gc').all()).toHaveLength(0)
})

it('reclaims an expired lease but leaves an active lease alone', async () => {
  const f = fixture(); await cleanupStatement(f.env.DB, 'lab/e/').run()
  f.sqlite.prepare('UPDATE lab_gc SET lease_token=?,lease_until=?').run('crashed-worker', START + 5 * 60000)
  await sweep(f.env); expect(f.list).not.toHaveBeenCalled()
  vi.setSystemTime(START + 5 * 60000); await sweep(f.env)
  expect(f.list).toHaveBeenCalledTimes(1)
})

it('deletes a known object without listing or deleting keys that share its prefix', async () => {
  const f = fixture()
  f.objects.add('media_x.webp'); f.objects.add('media_x.webp.keep')
  await cleanupStatement(f.env.DB, 'media_x.webp', {kind: 'object'}).run()
  await cleanTarget(f.env, 'media_x.webp')
  expect(f.objects.has('media_x.webp')).toBe(false)
  expect(f.objects.has('media_x.webp.keep')).toBe(true)
  expect(f.list).not.toHaveBeenCalled()
})

it('updates legacy target kind on a new enqueue', async () => {
  const f = fixture(); f.add('lab-publish-requests/old/')
  await cleanupStatement(f.env.DB, 'lab-publish-requests/old/', {kind: 'snapshot'}).run()
  await sweep(f.env)
  expect(f.list).not.toHaveBeenCalled()
  expect(f.remove).toHaveBeenCalledWith(['lab-publish-requests/old/display.webp', 'lab-publish-requests/old/snapshot.json'])
})
