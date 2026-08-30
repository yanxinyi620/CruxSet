// @ts-nocheck
import type { Wall } from '../domain/types.js'
import { call } from './cloud.js'
import { isMockMode } from '../config/runtime.js'
import { mockRepository } from './mock-repository.js'
export const wallManager=(action:string,data:Record<string,unknown>={})=>call<any>('wallManager',{action,data})
export const adminWall=(action:string,data:Record<string,unknown>={})=>call<any>('adminWall',{action,data})
export const listWalls=()=>isMockMode()?mockRepository.listWalls():wallManager('listBrowseWalls') as Promise<Wall[]>
export const listMyWalls=()=>isMockMode()?mockRepository.listMyWalls():wallManager('listMyWalls') as Promise<Wall[]>
export const getWall=(id:string)=>isMockMode()?mockRepository.getWall(id):wallManager('getWall',{id}) as Promise<Wall>
export const createWall=(data:Partial<Wall>)=>isMockMode()?mockRepository.createWall(data):adminWall('createWall',data as Record<string,unknown>) as Promise<Wall>
export const updateWall=(id:string,patch:Partial<Wall>)=>isMockMode()?mockRepository.updateWall(id,patch):adminWall('updateWall',{id,...patch}) as Promise<Wall>
export const publishWall=(id:string)=>isMockMode()?mockRepository.publishWall(id):adminWall('publishWall',{id}) as Promise<Wall>
export const deleteWall=(wallId:string)=>isMockMode()?mockRepository.deleteWall(wallId):wallManager('deleteWall',{wallId}) as Promise<{ok:true}>
export const uploadWallImage=(filePath:string,cloudPath=`walls/${Date.now()}.jpg`)=>isMockMode()?mockRepository.uploadWallImage(filePath):new Promise<{fileID:string}>((resolve,reject)=>wx.cloud.uploadFile({cloudPath,filePath,success:resolve,fail:reject}))
export const getWallImageUrl=(fileID:string)=>isMockMode()?mockRepository.getWallImageUrl(fileID):call<{url:string}>('getWallImageUrl',{fileID}).then(result=>result.url)
