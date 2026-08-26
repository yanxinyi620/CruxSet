import type { HoldRole, ProblemHolds } from './types.js'

const roles: HoldRole[] = ['start', 'foot', 'hand', 'assist', 'finish']
type Snapshot = ProblemHolds

const copy = (holds: ProblemHolds): ProblemHolds => Object.fromEntries(roles.map(role => [role, [...holds[role]]])) as unknown as ProblemHolds

export class ProblemEditor {
  private current: ProblemHolds
  private history: Snapshot[] = []
  constructor(initial: Partial<ProblemHolds> = {}) { this.current = copy(Object.fromEntries(roles.map(role => [role, [...(initial[role] ?? [])]])) as unknown as ProblemHolds) }
  toggle(id: string, role: HoldRole) {
    this.history.push(copy(this.current)); if (this.history.length > 50) this.history.shift()
    const existing = roles.find(candidate => this.current[candidate].includes(id))
    if (existing === role) this.current[role] = this.current[role].filter(item => item !== id)
    else { for (const candidate of roles) this.current[candidate] = this.current[candidate].filter(item => item !== id); this.current[role].push(id) }
  }
  clear() { this.history.push(copy(this.current)); this.current = copy({ start: [], foot: [], hand: [], assist: [], finish: [] }) }
  undo() { const previous = this.history.pop(); if (previous) this.current = previous }
  value() { return { holds: copy(this.current) } }
  serialize() { return JSON.stringify(this.current) }
  static restore(serialized: string) { return new ProblemEditor(JSON.parse(serialized) as ProblemHolds) }
}
