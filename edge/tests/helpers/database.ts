import { createRequire } from 'node:module'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
import { readFileSync, readdirSync } from 'node:fs'
export function database() {
  const sqlite = new DatabaseSync(':memory:')
  const dir = new URL('../../migrations/', import.meta.url)
  for (const file of readdirSync(dir).sort()) sqlite.exec(readFileSync(new URL(file, dir), 'utf8'))
  const prepare = (sql: string) => {
    let values: unknown[] = []
    const statement = {
      bind: (...args: unknown[]) => { values = args; return statement },
      all: async () => ({ success: true, results: sqlite.prepare(sql).all(...values as never[]) }),
      first: async (column?: string) => { const row = sqlite.prepare(sql).get(...values as never[]); return row ? column ? row[column] : row : null },
      run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...values as never[]) }),
    }
    return statement
  }
  return { sqlite, db: { prepare, batch: async (statements: Array<ReturnType<typeof prepare>>) => {
    sqlite.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.all()); sqlite.exec('COMMIT'); return results } catch (e) { sqlite.exec('ROLLBACK'); throw e }
  } } as unknown as D1Database }
}
