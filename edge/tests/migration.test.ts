import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('business schema', () => {
  it('defines the online entities and prevents duplicate wall-local problem numbers', async () => {
    const sql = await readFile(new URL('../migrations/0001_business.sql', import.meta.url), 'utf8')

    for (const table of ['users', 'admins', 'walls', 'holds', 'problems', 'counters', 'static_wall_publishes', 'asset_refs']) {
      expect(sql).toContain(`CREATE TABLE ${table}`)
    }
    expect(sql).toContain('UNIQUE(wall_id, number)')
    expect(sql).toContain('FOREIGN KEY (wall_id, hold_id) REFERENCES holds(wall_id, id)')
  })
})
