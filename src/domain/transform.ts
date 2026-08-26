import type { Point,ViewTransform } from './types.js'
export const imageToScreen=([x,y]:Point,t:ViewTransform):Point=>[x*t.scale+t.offsetX,y*t.scale+t.offsetY]
export const screenToImage=([x,y]:Point,t:ViewTransform):Point=>[(x-t.offsetX)/t.scale,(y-t.offsetY)/t.scale]
export const normalize=([x,y]:Point,width:number,height:number):Point=>[x/width,y/height]
export const denormalize=([x,y]:Point,width:number,height:number):Point=>[x*width,y*height]
export const clampTransform=(t:ViewTransform,viewportWidth:number,viewportHeight:number,imageWidth:number,imageHeight:number):ViewTransform=>{const width=imageWidth*t.scale;const height=imageHeight*t.scale;const minX=Math.min(0,viewportWidth-width);const minY=Math.min(0,viewportHeight-height);const centerX=(viewportWidth-width)/2;const centerY=(viewportHeight-height)/2;return{...t,offsetX:width<viewportWidth?centerX:Math.max(minX,Math.min(0,t.offsetX)),offsetY:height<viewportHeight?centerY:Math.max(minY,Math.min(0,t.offsetY))}}
export function zoomAroundAnchor(t:ViewTransform,nextScale:number,anchor:Point):ViewTransform{const image=screenToImage(anchor,t);return{scale:nextScale,offsetX:anchor[0]-image[0]*nextScale,offsetY:anchor[1]-image[1]*nextScale}}
