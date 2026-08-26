import type { Hold, HoldKind } from './types.js'

const clone = (holds: Hold[]) => holds.map(hold => ({ ...hold, polygon: hold.polygon?.map(point => [...point] as [number, number]) }))
export class LayoutEditor {
  private holds: Hold[]; private history: Hold[][] = []
  constructor(initial: Hold[]) { this.holds = clone(initial) }
  private checkpoint() { this.history.push(clone(this.holds)); if (this.history.length > 50) this.history.shift() }
  add(input: { x: number; y: number; radius?: number; kind?: HoldKind }): Hold { this.checkpoint(); const next = this.holds.reduce((max, hold) => Math.max(max, Number(hold.id.slice(1)) || 0), 0) + 1; const hold: Hold = { id: `H${String(next).padStart(3, '0')}`, x: Math.max(0, Math.min(1, input.x)), y: Math.max(0, Math.min(1, input.y)), radius: input.radius ?? .018, kind: input.kind ?? 'hold' }; this.holds.push(hold); return { ...hold } }
  move(id: string, x: number, y: number) { this.checkpoint(); const hold = this.require(id); hold.x = Math.max(0, Math.min(1, x)); hold.y = Math.max(0, Math.min(1, y)) }
  resize(id: string, radius: number) { this.checkpoint(); this.require(id).radius = Math.max(.001, radius) }
  remove(id: string) { this.checkpoint(); this.holds = this.holds.filter(hold => hold.id !== id) }
  undo() { const previous = this.history.pop(); if (previous) this.holds = previous }
  value() { return clone(this.holds) }
  private require(id: string) { const hold = this.holds.find(item => item.id === id); if (!hold) throw new Error(`unknown hold: ${id}`); return hold }
}
