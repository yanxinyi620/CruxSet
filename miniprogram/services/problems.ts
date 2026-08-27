// @ts-nocheck
import { call } from './cloud.js'
import type { Problem } from '../domain/types.js'
import { wallManager } from './walls.js'
export const saveProblem = (wallId: string, layoutId: string, draft: Partial<Problem>) => call<{ id: string; number: string }>('saveProblem', { wallId, layoutId, draft })
export const deleteProblem = (id: string) => call<{ ok: boolean }>('deleteProblem', { id })
export const listProblems=(filter:Partial<Pick<Problem,'wallId'|'layoutId'|'angle'|'grade'>>={})=>wallManager('listProblems',filter as Record<string,unknown>) as Promise<Problem[]>
export const getProblem=(id:string)=>wallManager('getProblem',{id}) as Promise<Problem>
