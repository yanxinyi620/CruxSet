// @ts-nocheck
import type { Wall, WallSummary, ManagementWallSummary } from '../domain/types.js'
import { call } from './cloud.js'
export const wallManager=(action:string,data:Record<string,unknown>={})=>call<any>('wallManager',{action,data})
export const listWalls=()=>wallManager('listBrowseWalls') as Promise<WallSummary[]>
export const listMyWalls=()=>wallManager('listMyWalls') as Promise<ManagementWallSummary[]>
export const listAdminWalls=()=>wallManager('listAdminWalls') as Promise<ManagementWallSummary[]>
export const getWall=(id:string)=>wallManager('getWall',{id}) as Promise<Wall>
export const deleteWall=(wallId:string)=>wallManager('deleteWall',{wallId}) as Promise<{ok:true;cleanupPending?:boolean;deletionPending?:boolean}>
export const getWallImageUrl=(fileID:string)=>call<{url:string}>('getWallImageUrl',{fileID}).then(result=>result.url)
export const inspectWallDeletion = (wallId:string) => wallManager('inspectWallDeletion',{wallId}) as Promise<{problemCount:number}>
export const retryCleanup = () => wallManager('retryCleanup')
export const adminWall = (action:string,data:Record<string,unknown>={}) => call<any>('adminWall',{action,data})
export const listDrafts = () => adminWall('listDrafts') as Promise<Wall[]>
export const createWall = (data:Record<string,unknown>) => adminWall('createWall',data) as Promise<Wall>
export const saveWallHolds = (wallId:string,holds:Wall['holds']) => adminWall('updateWallHolds',{wallId,holds}) as Promise<Wall>
export const publishWall = (wallId:string) => adminWall('publishWall',{wallId}) as Promise<Wall>
export const uploadWallImage = (data:{base64:string;contentType:string;requestId:string}) => adminWall('uploadImage',data) as Promise<{fileID:string;imageWidth:number;imageHeight:number}>

export const reclaimUploads = () => adminWall('reclaimUploads')
