// @ts-nocheck
import type { Wall } from '../domain/types.js'
import { call } from './cloud.js'
import { isMockMode } from '../config/runtime.js'
import { mockRepository } from './mock-repository.js'
export const wallManager=(action:string,data:Record<string,unknown>={})=>call<any>('wallManager',{action,data})
export const listWalls=()=>isMockMode()?mockRepository.listWalls():wallManager('listBrowseWalls') as Promise<Wall[]>
export const listMyWalls=()=>isMockMode()?mockRepository.listMyWalls():wallManager('listMyWalls') as Promise<Wall[]>
export const getWall=(id:string)=>isMockMode()?mockRepository.getWall(id):wallManager('getWall',{id}) as Promise<Wall>
export const deleteWall=(wallId:string)=>isMockMode()?mockRepository.deleteWall(wallId):wallManager('deleteWall',{wallId}) as Promise<{ok:true}>
