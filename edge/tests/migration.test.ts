import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

describe('business schema', () => {
  it('defines the online entities and prevents duplicate wall-local problem numbers', async () => {
    const sql = await readFile(new URL('../migrations/0001_business.sql', import.meta.url), 'utf8')

    for (const table of ['users', 'admins', 'walls', 'holds', 'problems', 'counters', 'static_wall_publishes', 'asset_refs']) {
      expect(sql).toContain(`CREATE TABLE ${table}`)
    }
    expect(sql).toContain('UNIQUE(wall_id, number)')
    expect(sql).toContain('FOREIGN KEY (wall_id, hold_id) REFERENCES holds(wall_id, id)')
  })

  it('indexes problem_holds by wall_id for wall deletion', async () => {
    const sql = await readFile(new URL('../migrations/0008_problem_holds_wall_id.sql', import.meta.url), 'utf8')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS problem_holds_wall_id_idx')
    expect(sql).toContain('ON problem_holds(wall_id)')

    const db = new DatabaseSync(':memory:')
    const migrations = ['0001_business.sql', '0002_auth.sql', '0003_hold_polygons.sql', '0004_route_options.sql', '0005_password_reset.sql', '0006_login_rate_limit.sql', '0007_segmentation_publishes.sql']
    for (const migration of migrations) db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
    db.exec(sql)
    const plan = db.prepare('EXPLAIN QUERY PLAN DELETE FROM problem_holds WHERE wall_id = ?').all('wall_1')
    expect(plan.map((row: { detail: string }) => row.detail).join(' ')).toContain('USING COVERING INDEX problem_holds_wall_id_idx')
    expect(plan.map((row: { detail: string }) => row.detail).join(' ')).not.toContain('SCAN problem_holds')
  })
})
