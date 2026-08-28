import type { Hold, HoldKind } from './types.js'

const clone = (holds: Hold[]) => holds.map(hold => ({ ...hold, polygon: hold.polygon?.map(point => [...point] as [number, number]) }))
export class LayoutEditor {
  private holds: Hold[]; private history: Hold[][] = []
  constructor(initial: Hold[]) { this.holds = clone(initial) }
  private checkpoint() { this.history.push(clone(this.holds)); if (this.history.length > 50) this.history.shift() }
  add(input: { x: number; y: number; radius?: number; kind?: HoldKind }): Hold { this.checkpoint(); const next = this.holds.reduce((max, hold) => Math.max(max, Number(hold.id.slice(1)) || 0), 0) + 1; const hold: Hold = { id: `H${String(next).padStart(3, '0')}`, x: Math.max(0, Math.min(1, input.x)), y: Math.max(0, Math.min(1, input.y)), radius: input.radius ?? .018, kind: input.kind ?? 'hold' }; this.holds.push(hold); return { ...hold } }
  /** 记录一次可撤销的变更起点；配合 setPosition/setRadius 在连续拖拽中只入栈一次。 */
  beginChange() { this.checkpoint() }
  /** 无检查点地移动岩点（拖拽过程中连续调用，不会刷满撤销历史）。 */
  setPosition(id: string, x: number, y: number) { const hold = this.require(id); hold.x = Math.max(0, Math.min(1, x)); hold.y = Math.max(0, Math.min(1, y)) }
  /** 无检查点地调整半径（滑杆实时预览用）。 */
  setRadius(id: string, radius: number) { this.require(id).radius = Math.max(.001, radius) }
  move(id: string, x: number, y: number) { this.checkpoint(); this.require(id); this.setPosition(id, x, y) }
  resize(id: string, radius: number) { this.checkpoint(); this.require(id); this.setRadius(id, radius) }
  remove(id: string) { this.checkpoint(); this.holds = this.holds.filter(hold => hold.id !== id) }
  undo() { const previous = this.history.pop(); if (previous) this.holds = previous }
  canUndo() { return this.history.length > 0 }
  value() { return clone(this.holds) }
  private require(id: string) { const hold = this.holds.find(item => item.id === id); if (!hold) throw new Error(`unknown hold: ${id}`); return hold }
}
