type MaskContext = {
  save(): void; restore(): void; beginPath(): void;
  rect(x:number,y:number,width:number,height:number): void;
  clip(rule:'evenodd'): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x:number,y:number,width:number,height:number): void;
}

/** Intersect each rock's exterior, preserving the union of bright interiors. */
export function dimOutsideHolds(ctx:MaskContext,width:number,height:number,paths:ReadonlyArray<()=>void>) {
  ctx.save()
  for (const appendPath of paths) {
    ctx.beginPath()
    ctx.rect(0,0,width,height)
    appendPath()
    ctx.clip('evenodd')
  }
  ctx.fillStyle='rgba(0,0,0,0.5)'
  ctx.fillRect(0,0,width,height)
  ctx.restore()
}
