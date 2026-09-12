type Entry = { expires: number; value?: unknown; ready: boolean; pending?: Promise<unknown> }
type Stored = { key: string; expires: number; value: unknown }
type Options = { staleTtl?: number; maxBytes?: number; storage?: { read(): unknown; write(value: Stored[]): void } }
const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value))
const revoked = (error: any) => /FORBIDDEN|PERMISSION|NOT_FOUND|NOT_PUBLIC|LOGIN_REQUIRED|UNAUTHORIZED|WALL_DELETING|WALL_DELETED|DOCUMENT_NOT_EXIST|DOCUMENT[^\n]*NOT EXIST/.test(`${error?.code || ''} ${error?.message || ''} ${error?.rawMessage || ''}`.toUpperCase())
/** Strict reads by default; browsing may opt into bounded persistent SWR. */
export class ReadCache {
  private entries = new Map<string, Entry>()
  private listeners = new Set<(key: string) => void>()
  private saveTimer?: ReturnType<typeof setTimeout>
  generation = 0
  constructor(private ttl = 30_000, private limit = 100, private options: Options = {}) {
    try {
      const rows = options.storage?.read()
      if (Array.isArray(rows)) for (const row of rows.slice(-limit)) {
        if (typeof row.key === 'string' && Number.isFinite(row.expires) && row.expires <= Date.now() + ttl && row.expires + (options.staleTtl || 0) > Date.now()) {
          this.entries.set(row.key, { expires: row.expires, value: copy(row.value), ready: true })
        }
      }
    } catch { /* Corrupt or unavailable storage is a cache miss. */ }
  }
  subscribe(listener: (key: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private notify(key: string) { for (const listener of this.listeners) listener(key) }
  clear(notify = false) {
    this.generation++; this.entries.clear()
    // Persist invalidation immediately, including if the app exits during a write.
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    try { this.options.storage?.write([]) } catch { /* optional cache */ }
    if (notify) this.notify('*')
  }
  peek<T>(key: string): T | undefined { const entry=this.entries.get(key); return entry?.ready ? copy(entry.value as T) : undefined }
  forget(key: string) { this.entries.delete(key); this.save() }
  seed(key: string, value: unknown) {
    this.put(key, { expires: Date.now() + this.ttl, value: copy(value), ready: true })
    this.save()
  }
  private put(key: string, entry: Entry) {
    this.entries.delete(key); this.entries.set(key, entry)
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
  }
  private save() {
    if (!this.options.storage || this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      const rows: Stored[] = []
      let bytes = 4
      for (const [key, entry] of [...this.entries].reverse()) {
        if (!entry.ready || entry.expires + (this.options.staleTtl || 0) <= Date.now()) continue
        const row = { key, expires: entry.expires, value: entry.value }
        const size = JSON.stringify(row).length * 2 + 2
        if (bytes + size > (this.options.maxBytes || 2 * 1024 * 1024)) continue
        bytes += size; rows.unshift(row)
      }
      try { this.options.storage!.write(rows) } catch { /* Quota must not block browsing. */ }
    }, 0)
  }
  read<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    let entry = this.entries.get(key)
    const stale = !!entry?.ready && entry.expires + (this.options.staleTtl || 0) > Date.now()
    if (entry?.ready && entry.expires > Date.now()) return Promise.resolve(copy(entry.value as T))
    if (entry?.pending) return stale ? Promise.resolve(copy(entry.value as T)) : entry.pending.then(value => copy(value as T))
    if (!entry || !stale) { entry = { expires: 0, ready: false }; this.put(key, entry) }
    const current = entry, generation = this.generation
    const pending = Promise.resolve().then(fetch).then(value => {
      if (generation === this.generation && this.entries.get(key) === current) {
        const changed = !current.ready || JSON.stringify(current.value) !== JSON.stringify(value)
        current.value = copy(value); current.ready = true; current.expires = Date.now() + this.ttl
        current.pending = undefined; this.save()
        if (stale && changed) this.notify(key)
      }
      return copy(value)
    }, error => {
      if (generation === this.generation && this.entries.get(key) === current) {
        current.pending = undefined
        if (!stale || revoked(error)) {
          this.entries.delete(key); this.save()
          if (stale) this.notify(key)
        }
      }
      throw error
    })
    current.pending = pending
    if (stale) { void pending.catch(() => {}); return Promise.resolve(copy(current.value as T)) }
    return pending
  }
}
