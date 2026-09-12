type Entry = { expires: number; value: Promise<unknown> }
const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value))
/** Session-only, bounded cache. Clear on both sides of a write to discard racing reads. */
export class ReadCache {
  private entries = new Map<string, Entry>()
  generation = 0
  constructor(private ttl = 30_000, private limit = 100) {}
  clear() { this.generation++; this.entries.clear() }
  seed(key: string, value: unknown) {
    this.put(key, { expires: Date.now() + this.ttl, value: Promise.resolve(copy(value)) })
  }
  private put(key: string, entry: Entry) {
    this.entries.delete(key); this.entries.set(key, entry)
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
  }
  read<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key)
    if (cached && cached.expires > Date.now()) return cached.value.then(value => copy(value as T))
    const entry: Entry = { expires: Infinity, value: Promise.resolve().then(fetch) }
    this.put(key, entry)
    entry.value = entry.value.then(value => { entry.expires = Date.now() + this.ttl; return copy(value) }, error => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
      throw error
    })
    return entry.value.then(value => copy(value as T))
  }
}
