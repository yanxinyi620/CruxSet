// @ts-nocheck
import { call } from './cloud.js'
import type { Problem } from '../domain/types.js'
import { wallManager } from './walls.js'
export const saveProblem = (wallId: string, draft: Partial<Problem>) => call<{ id: string; number: string }>('saveProblem', { wallId, draft })
export const updateProblem = (id: string, draft: Partial<Problem>) => call<{ id: string; number: string }>('updateProblem', { id, draft })
export const deleteProblem = (id: string) => wallManager('deleteProblem', { id }) as Promise<{ ok: boolean }>
export type PublicProblem = Problem & { setterName?: string }
export const listProblems=(filter:Partial<Pick<Problem,'wallId'|'angle'|'grade'>>={})=>wallManager('listProblems',filter as Record<string,unknown>) as Promise<PublicProblem[]>
export const listMyProblems=()=>wallManager('listMyProblems') as Promise<Problem[]>
export const getProblem=(id:string)=>wallManager('getProblem',{id}) as Promise<PublicProblem>
