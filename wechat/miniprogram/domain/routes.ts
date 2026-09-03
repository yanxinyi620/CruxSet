import type { FootRule, Grade, HoldRole, Problem, ProblemHolds, Wall } from './types.js'

const roles: HoldRole[] = ['start', 'foot', 'hand', 'assist', 'finish']
const footRules: FootRule[] = ['feet_follow', 'specified', 'all']
const grades = new Set(Array.from({ length: 13 }, (_, i) => `V${i}`))

export interface ProblemDraft { id:string; number:string; wallId:string; name?:string; description?:string; angle:number; grade:string; footRule?:string; holds:Partial<ProblemHolds>; createdBy:string; now?:number }
export function createProblem(draft:ProblemDraft,wall:Wall):Problem {
  if(draft.wallId!==wall.id) throw new Error('wall mismatch')
  if(!wall.angleOptions.includes(draft.angle)) throw new Error('invalid angle')
  if(!grades.has(draft.grade)) throw new Error('invalid grade')
  const footRule=draft.footRule??'feet_follow'; if(!footRules.includes(footRule as FootRule)) throw new Error('invalid foot rule')
  if((draft.description?.length??0)>500) throw new Error('description too long')
  const holds=Object.fromEntries(roles.map(role=>[role,[...(draft.holds[role]??[])]])) as unknown as ProblemHolds
  if(!holds.start.length) throw new Error('start is required'); if(!holds.finish.length) throw new Error('finish is required')
  if(footRule==='specified'&&!holds.foot.length) throw new Error('specified requires foot holds')
  const ids=Object.values(holds).flat(); if(new Set(ids).size!==ids.length) throw new Error('a hold can only have one role')
  const available=new Set(wall.holds.map(h=>h.id)); for(const id of ids) if(!available.has(id)) throw new Error(`unknown hold: ${id}`)
  const now=draft.now??Date.now(); return {...draft,grade:draft.grade as Grade,footRule:footRule as FootRule,holds,createdAt:now,updatedAt:now}
}
export function filterProblems(problems:Problem[],f:Partial<Pick<Problem,'wallId'|'angle'|'grade'>>):Problem[]{return problems.filter(p=>Object.entries(f).every(([k,v])=>v===undefined||p[k as keyof Problem]===v)).sort((a,b)=>a.number.localeCompare(b.number))}
export function searchProblems(problems:Problem[],query:string):Problem[]{const q=query.trim().toLocaleLowerCase();return q?problems.filter(p=>p.number.toLocaleLowerCase().includes(q)||p.name?.toLocaleLowerCase().includes(q)):problems}
