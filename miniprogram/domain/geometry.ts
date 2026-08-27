import type {Hold,Point} from './types.js'
export const circleHitTest=(point:Point,hold:Hold)=>(point[0]-hold.x)**2+(point[1]-hold.y)**2<=hold.radius**2
const bboxContains=(point:Point,bbox:readonly[number,number,number,number])=>point[0]>=bbox[0]&&point[0]<=bbox[2]&&point[1]>=bbox[1]&&point[1]<=bbox[3]
export const polygonHitTest=(point:Point,hold:Hold)=>Boolean(hold.polygon?.length&&(!hold.bbox||bboxContains(point,hold.bbox))&&pointInPolygon(point,hold.polygon as Point[]))
export function pointInPolygon(point:Point,polygon:Point[]):boolean{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[xi,yi]=polygon[i],[xj,yj]=polygon[j];if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)inside=!inside}return inside}
export function nearestHold(point:Point,holds:Hold[],maxDistance:number):Hold|undefined{return holds.map(hold=>({hold,d:Math.hypot(point[0]-hold.x,point[1]-hold.y)})).filter(x=>x.d<=maxDistance).sort((a,b)=>a.hold.kind===b.hold.kind?a.d-b.d||a.hold.radius-b.hold.radius:a.hold.kind==='hold'?-1:1)[0]?.hold}
