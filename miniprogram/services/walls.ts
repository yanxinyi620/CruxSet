// @ts-nocheck
import type { Wall } from '../domain/types.js'
import { call } from './cloud.js'
export const wallManager=(action:string,data:Record<string,unknown>={})=>call<any>('wallManager',{action,data})
export const listWalls=()=>wallManager('listBrowseWalls') as Promise<Wall[]>
export const listMyWalls=()=>wallManager('listMyWalls') as Promise<Wall[]>
export const getWall=(id:string)=>wallManager('getWall',{id}) as Promise<Wall>
