// @ts-nocheck
/** A page-local canvas normalizes camera orientation and exports bounded JPEGs. */
export function imageCanvas(page): Promise<any> {
  return new Promise((resolve,reject)=>wx.createSelectorQuery().in(page).select('#imageProcessor').fields({node:true,size:true}).exec(rows=>rows[0]?.node ? resolve(rows[0].node) : reject(new Error('CANVAS_UNAVAILABLE'))))
}
export async function drawImagePixels(page, path: string, maxDim = 640) {
  const canvas=await imageCanvas(page)
  const image=canvas.createImage()
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('INVALID_IMAGE'));image.src=path})
  if (!image.width || !image.height || image.width > 10000 || image.height > 10000) throw new Error('IMAGE_TOO_LARGE')
  const ratio=Math.min(1,maxDim/Math.max(image.width,image.height))
  canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio))
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height)
  return {canvas,ctx,width:canvas.width,height:canvas.height}
}
export async function normalizeUploadImage(page, path: string): Promise<string> {
  const {canvas}=await drawImagePixels(page,path,2400)
  const result=await new Promise<any>((resolve,reject)=>wx.canvasToTempFilePath({canvas,fileType:'jpg',quality:.8,success:resolve,fail:reject},page))
  const base64=wx.getFileSystemManager().readFileSync(result.tempFilePath,'base64') as string
  if (base64.length > Math.ceil(2*1024*1024/3)*4) throw new Error('IMAGE_TOO_LARGE')
  return base64
}
