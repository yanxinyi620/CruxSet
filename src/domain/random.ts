export class RandomSession<T> {
  private remaining: T[] = []
  constructor(private readonly candidates: T[], private readonly rng: () => number = Math.random) {}
  next(): T {
    if (!this.remaining.length) { this.remaining = [...this.candidates]; for (let i = this.remaining.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]] } }
    const result = this.remaining.shift(); if (result === undefined) throw new Error('no candidates'); return result
  }
}
