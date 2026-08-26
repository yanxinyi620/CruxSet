import type { Hold, Problem, FootRule, HoldType } from './types.js'
const types: HoldType[] = ['start','hand','assist','foot','finish']
export function createProblem(input: Omit<Problem, 'id'|'footRule'|'holds'|'createdAt'> & { holds: Hold[] }, selected: Partial<Record<HoldType,string[]>>, footRule: FootRule = 'feet_follow'): Problem {
  if (!Number.isFinite(input.angle) || input.angle < 0 || input.angle > 90 || !input.grade.trim()) throw new Error('invalid route metadata')
  const available = new Set(input.holds.filter(h => h.layoutId === input.layoutId).map(h => h.id))
  const grouped = Object.fromEntries(types.map(type => [type, selected[type] ?? []])) as Record<HoldType,string[]>
  for (const id of Object.values(grouped).flat()) if (!available.has(id)) throw new Error(`unknown hold: ${id}`)
  if (!Object.values(grouped).flat().length) throw new Error('route needs at least one hold')
  return { ...input, id: input.number, footRule, holds: grouped, createdAt: new Date().toISOString() }
}
export function filterProblems(problems: Problem[], f: Partial<Pick<Problem,'wallId'|'layoutId'|'angle'|'grade'>>): Problem[] { return problems.filter(p => Object.entries(f).every(([k,v]) => v === undefined || p[k as keyof Problem] === v)).sort((a,b) => a.number.localeCompare(b.number)) }
export function searchProblems(problems: Problem[], query: string): Problem[] { const q = query.trim().toLowerCase(); return q ? problems.filter(p => p.number.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q)) : problems }
