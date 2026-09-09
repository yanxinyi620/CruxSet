// @ts-nocheck
import type { Wall } from '../domain/types.js'
import { call } from './cloud.js'
export const wallManager=(action:string,data:Record<string,unknown>={})=>call<any>('wallManager',{action,data})
export const listWalls=()=>wallManager('listBrowseWalls') as Promise<Wall[]>
export const listMyWalls=()=>wallManager('listMyWalls') as Promise<Wall[]>
export const listAdminWalls=()=>wallManager('listAdminWalls') as Promise<Wall[]>
export const getWall=(id:string)=>wallManager('getWall',{id}) as Promise<Wall>
export const deleteWall=(wallId:string)=>wallManager('deleteWall',{wallId}) as Promise<{ok:true}>
export const getWallImageUrl=(fileID:string)=>call<{url:string}>('getWallImageUrl',{fileID}).then(result=>result.url)
