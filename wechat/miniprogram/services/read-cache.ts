type Entry = { expires: number; value: unknown }
type Stored = Entry & { key: string }
type Pending = { promise: Promise<unknown> }
export type ReadOptions = { force?: boolean }
export type CacheDiagnostic = { status: 'restored' | 'persisted' | 'storage-read-failed' | 'storage-write-failed' | 'storage-removed'; entries: number; bytes?: number; attempt?: number }
type Options = {
  staleTtl?: number; maxBytes?: number
  storage?: { read(): unknown; write(value: Stored[]): void; remove?(): void }
  onDiagnostic?: (event: CacheDiagnostic) => void
}
const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value))
export const isReadRevoked = (error: any) => /FORBIDDEN|PERMISSION|NOT_FOUND|NOT_PUBLIC|LOGIN_REQUIRED|UNAUTHORIZED|WALL_DELETING|WALL_DELETED|DOCUMENT_NOT_EXIST|DOCUMENT[^\n]*NOT EXIST/.test(`${error?.code || ''} ${error?.message || ''} ${error?.rawMessage || ''}`.toUpperCase())
const utf8Bytes = (text: string) => {
  let bytes = 0
  for (const character of text) {
    const point = character.codePointAt(0)!
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return bytes
}
/** Completed values use LRU; in-flight requests are independent of value capacity. */
export class ReadCache {
  private entries = new Map<string, Entry>()
  private pending = new Map<string, Pending>()
  private listeners = new Set<(key: string) => void>()
  private errorListeners = new Set<(key: string, error: unknown) => void>()
  private saveTimer?: ReturnType<typeof setTimeout>
  generation = 0
  constructor(private ttl = 30_000, private limit = 100, private options: Options = {}) {
    try {
      const rows = options.storage?.read()
      if (Array.isArray(rows)) for (const row of rows.slice(-limit)) {
        if (row && typeof row.key === 'string' && Number.isFinite(row.expires) && row.expires <= Date.now() + ttl && this.usable(row)) {
          this.entries.set((row as Stored).key, { expires: row.expires, value: copy(row.value) })
        }
      }
      if (options.storage) this.report({ status: 'restored', entries: this.entries.size })
    } catch { this.report({ status: 'storage-read-failed', entries: 0 }) }
  }
  private usable(entry?: Entry): entry is Entry { return !!entry && entry.expires + (this.options.staleTtl || 0) > Date.now() }
  private report(event: CacheDiagnostic) { try { this.options.onDiagnostic?.(event) } catch { /* Diagnostics are optional. */ } }
  subscribe(listener: (key: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  subscribeErrors(listener: (key: string, error: unknown) => void) { this.errorListeners.add(listener); return () => { this.errorListeners.delete(listener) } }
  private notify(key: string) { for (const listener of this.listeners) listener(key) }
  clear(notify = false) { this.invalidate(() => true, notify) }
  invalidate(matches: (key: string) => boolean, notify = false) {
    this.generation++
    for (const key of this.entries.keys()) if (matches(key)) this.entries.delete(key)
    for (const key of this.pending.keys()) if (matches(key)) this.pending.delete(key)
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    this.persist()
    if (notify) this.notify('*')
  }
  private touch(key: string, entry: Entry) { this.entries.delete(key); this.entries.set(key, entry) }
  peek<T>(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!this.usable(entry)) return undefined
    this.touch(key, entry); this.save()
    return copy(entry.value as T)
  }
  findValue<T>(select: (key: string, value: any) => T | undefined): T | undefined {
    for (const [key, entry] of this.entries) {
      if (!this.usable(entry)) continue
      const value = select(key, entry.value)
      if (value !== undefined) return copy(value)
    }
  }
  forget(key: string) { this.entries.delete(key); this.pending.delete(key); this.save() }
  seed(key: string, value: unknown) {
    // Optional detail preloading must not evict walls or pending parent lists.
    if (this.pending.has(key) || !this.entries.has(key) && this.entries.size + this.pending.size >= this.limit) return
    const entry = { expires: Date.now() + this.ttl, value: copy(value) }
    if (this.entries.has(key)) this.entries.set(key, entry)
    else this.entries = new Map([[key, entry], ...this.entries])
    this.save()
  }
  private put(key: string, entry: Entry) {
    this.touch(key, entry)
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
  }
  private save() {
    if (!this.options.storage || this.saveTimer) return
    this.saveTimer = setTimeout(() => { this.saveTimer = undefined; this.persist() }, 0)
  }
  private persist() {
    const storage = this.options.storage
    if (!storage) return
    let rows: Stored[] = [], bytes = 2
    for (const [key, entry] of [...this.entries].reverse()) {
      if (!this.usable(entry)) continue
      const row = { key, expires: entry.expires, value: entry.value }
      const size = utf8Bytes(JSON.stringify(row)) + (rows.length ? 1 : 0)
      if (bytes + size > (this.options.maxBytes ?? 900 * 1024)) continue
      bytes += size; rows.unshift(row)
    }
    for (let attempt = 1; ; attempt++) {
      try {
        storage.write(rows)
        this.report({ status: 'persisted', entries: rows.length, bytes, attempt }); return
      } catch {
        this.report({ status: 'storage-write-failed', entries: rows.length, bytes, attempt })
        if (!rows.length) {
          try { if (storage.remove) { storage.remove(); this.report({ status: 'storage-removed', entries: 0 }) } } catch { /* Browsing and writes still work in memory. */ }
          return
        }
        // Drop older values first; even a failed invalidation never writes removed data back.
        rows = rows.slice(Math.ceil(rows.length / 2)); bytes = utf8Bytes(JSON.stringify(rows))
      }
    }
  }
  read<T>(key: string, fetch: () => Promise<T>, options: ReadOptions = {}): Promise<T> {
    const entry = this.entries.get(key), usable = this.usable(entry)
    if (usable) { this.touch(key, entry); this.save() }
    if (!options.force && entry && entry.expires > Date.now()) return Promise.resolve(copy(entry.value as T))
    const existing = this.pending.get(key)
    if (existing) return usable && !options.force ? Promise.resolve(copy(entry.value as T)) : existing.promise.then(value => copy(value as T))
    if (!usable) this.entries.delete(key)
    const current: Pending = { promise: Promise.resolve() }
    this.pending.set(key, current)
    const pending = Promise.resolve().then(fetch).then(value => {
      if (this.pending.get(key) === current) {
        this.pending.delete(key)
        const changed = !usable || JSON.stringify(entry.value) !== JSON.stringify(value)
        this.put(key, { value: copy(value), expires: Date.now() + this.ttl }); this.save()
        if (usable && changed) this.notify(key)
      }
      return copy(value)
    }, error => {
      if (this.pending.get(key) === current) {
        this.pending.delete(key)
        if (!usable || isReadRevoked(error)) {
          this.entries.delete(key); this.save()
          if (usable) this.notify(key)
        }
        if (usable) for (const listener of this.errorListeners) listener(key, error)
      }
      throw error
    })
    current.promise = pending
    if (usable && !options.force) { void pending.catch(() => {}); return Promise.resolve(copy(entry.value as T)) }
    return pending
  }
}
