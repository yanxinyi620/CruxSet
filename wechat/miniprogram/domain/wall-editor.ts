import type { Hold, HoldKind } from './types.js'
const clone = (holds: Hold[]) => holds.map(hold => ({ ...hold, bbox: hold.bbox ? [...hold.bbox] as Hold['bbox'] : undefined, polygon: hold.polygon?.map(point => [...point] as [number, number]) }))
export class WallEditor {
  private holds: Hold[]
  private history: Hold[][] = []
  private future: Hold[][] = []
  constructor(initial: Hold[]) { this.holds = clone(initial) }
  private checkpoint() { this.history.push(clone(this.holds)); if (this.history.length > 50) this.history.shift(); this.future = [] }
  add(input: { x: number; y: number; radius?: number; kind?: HoldKind }): Hold {
    this.checkpoint()
    const next = this.holds.reduce((max, hold) => Math.max(max, Number(hold.id.slice(1)) || 0), 0) + 1
    const hold: Hold = { id: `H${String(next).padStart(3, '0')}`, x: Math.max(0, Math.min(1, input.x)), y: Math.max(0, Math.min(1, input.y)), radius: input.radius ?? .018, kind: input.kind ?? 'hold' }
    this.holds.push(hold); return { ...hold }
  }
  move(id: string, x: number, y: number) { this.require(id); this.checkpoint(); const h = this.require(id); h.x = Math.max(0, Math.min(1, x)); h.y = Math.max(0, Math.min(1, y)); delete h.polygon; delete h.bbox }
  resize(id: string, radius: number) { this.require(id); this.checkpoint(); const h = this.require(id); h.radius = Math.max(.001, Math.min(1, radius)); delete h.polygon; delete h.bbox }
  remove(id: string) { this.require(id); this.checkpoint(); this.holds = this.holds.filter(h => h.id !== id) }
  replace(holds: Hold[]) { this.checkpoint(); this.holds = clone(holds) }
  clear() { this.replace([]) }
  undo() { const previous = this.history.pop(); if (previous) { this.future.push(clone(this.holds)); this.holds = previous } }
  redo() { const next = this.future.pop(); if (next) { this.history.push(clone(this.holds)); this.holds = next } }
  canUndo() { return this.history.length > 0 }
  canRedo() { return this.future.length > 0 }
  value() { return clone(this.holds) }
  private require(id: string) { const hold = this.holds.find(h => h.id === id); if (!hold) throw new Error(`unknown hold: ${id}`); return hold }
}
