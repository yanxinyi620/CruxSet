// @ts-nocheck
import { browseProblems } from '../domain/browse.js'
import { call } from './cloud.js'
import type { Problem } from '../domain/types.js'
import { wallManager } from './walls.js'
export const saveProblem = (wallId: string, draft: Partial<Problem>) => call<{ id: string; number: string }>('saveProblem', { wallId, draft })
export const updateProblem = (id: string, draft: Partial<Problem>) => call<{ id: string; number: string }>('updateProblem', { id, draft })
export const deleteProblem = (id: string) => wallManager('deleteProblem', { id }) as Promise<{ ok: boolean }>
export type PublicProblem = Problem & { setterName?: string }
export const listProblems=async(filter:Partial<Pick<Problem,'wallId'|'angle'|'grade'>>={})=>browseProblems(await wallManager('listProblems', filter.wallId ? {wallId:filter.wallId} : {}),filter) as PublicProblem[]
export const listMyProblems=()=>wallManager('listMyProblems') as Promise<Problem[]>
export const getProblem=(id:string)=>wallManager('getProblem',{id}) as Promise<PublicProblem>
