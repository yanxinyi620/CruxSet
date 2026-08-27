// @ts-nocheck
import { call } from './cloud.js'
import type { Problem } from '../domain/types.js'
import { wallManager } from './walls.js'
import { isMockMode } from '../config/runtime.js'
import { mockRepository } from './mock-repository.js'
export const saveProblem = (wallId: string, layoutId: string, draft: Partial<Problem>) => isMockMode()?mockRepository.createProblem(wallId,layoutId,draft):call<{ id: string; number: string }>('saveProblem', { wallId, layoutId, draft })
export const deleteProblem = (id: string) => isMockMode()?mockRepository.deleteProblem(id):call<{ ok: boolean }>('deleteProblem', { id })
export const listProblems=(filter:Partial<Pick<Problem,'wallId'|'layoutId'|'angle'|'grade'>>={})=>isMockMode()?mockRepository.listProblems(filter):wallManager('listProblems',filter as Record<string,unknown>) as Promise<Problem[]>
export const getProblem=(id:string)=>isMockMode()?mockRepository.getProblem(id):wallManager('getProblem',{id}) as Promise<Problem>
