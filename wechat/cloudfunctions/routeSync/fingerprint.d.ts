export type SyncGeometry = {geometryHash:string;idToHash:Record<string,string>;hashToId:Record<string,string>}
export type SyncWire = {fingerprint:string;angle:number;grade:string;footRule:string;name:string;description:string;holds:Record<string,string[]>}
declare const core: {
 roles: string[];
 geometry(wall:Record<string,any>,hash:(s:string)=>string|Promise<string>):Promise<SyncGeometry>;
 exportRoute(wall:Record<string,any>,route:Record<string,any>,hash:(s:string)=>string|Promise<string>,prepared?:SyncGeometry):Promise<SyncWire>;
 importRoute(wall:Record<string,any>,route:Record<string,any>,hash:(s:string)=>string|Promise<string>,prepared?:SyncGeometry):Promise<Omit<SyncWire,'fingerprint'>>;
}
export default core
