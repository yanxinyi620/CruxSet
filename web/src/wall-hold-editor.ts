import type { Hold, HoldKind, Point } from '../../wechat/miniprogram/domain/types.js'

const clone = (holds: Hold[]) => holds.map(hold => ({ ...hold, polygon: hold.polygon?.map(([x, y]) => [x, y] as Point) }))

export class WallHoldEditor {
  private holds: Hold[]
  private history: Hold[][] = []
  private future: Hold[][] = []
  constructor(initial: Hold[]) { this.holds = clone(initial) }
  private checkpoint() { this.history.push(clone(this.holds)); if (this.history.length > 50) this.history.shift(); this.future = [] }
  add(input: { x: number; y: number; radius?: number; kind?: HoldKind }) { this.checkpoint(); const next = this.holds.reduce((max, hold) => Math.max(max, Number(hold.id.slice(1)) || 0), 0) + 1; const hold: Hold = { id: `H${String(next).padStart(3, '0')}`, x: Math.max(0, Math.min(1, input.x)), y: Math.max(0, Math.min(1, input.y)), radius: input.radius ?? .018, kind: input.kind ?? 'hold' }; this.holds.push(hold); return { ...hold } }
  beginChange() { this.checkpoint() }
  setPosition(id: string, x: number, y: number) { const hold = this.require(id); hold.x = Math.max(0, Math.min(1, x)); hold.y = Math.max(0, Math.min(1, y)); delete hold.polygon }
  setRadius(id: string, radius: number) { const hold = this.require(id); hold.radius = Math.max(.001, radius); delete hold.polygon }
  remove(id: string) { this.checkpoint(); this.holds = this.holds.filter(hold => hold.id !== id) }
  replace(holds: Hold[]) { this.checkpoint(); this.holds = clone(holds) }
  undo() { const previous = this.history.pop(); if (previous) { this.future.push(clone(this.holds)); this.holds = previous } }
  redo() { const next = this.future.pop(); if (next) { this.history.push(clone(this.holds)); this.holds = next } }
  canUndo() { return this.history.length > 0 }
  canRedo() { return this.future.length > 0 }
  value() { return clone(this.holds) }
  private require(id: string) { const hold = this.holds.find(item => item.id === id); if (!hold) throw new Error(`unknown hold: ${id}`); return hold }
}
