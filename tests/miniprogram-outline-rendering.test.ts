// @ts-nocheck
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../wechat/miniprogram/services/image-cache.js', () => ({wallImagePath: vi.fn(), invalidateWallImage: vi.fn()}))
afterEach(() => vi.unstubAllGlobals())

async function draw(hold, activeHolds, dimImage = false) {
  let definition
  vi.stubGlobal('Component', value => { definition = value })
  vi.resetModules()
  await import('../wechat/miniprogram/components/wall-canvas/index.js')
  const strokes = [], ctx = {
    clearRect:vi.fn(), beginPath:vi.fn(), moveTo:vi.fn(), lineTo:vi.fn(), closePath:vi.fn(),
    fillRect:vi.fn(), arc:vi.fn(), rect:vi.fn(), clip:vi.fn(), save:vi.fn(), restore:vi.fn(), fill:vi.fn(),
    stroke:vi.fn(() => strokes.push([ctx.lineWidth,ctx.strokeStyle])),
  }
  vi.stubGlobal('wx', {createSelectorQuery:()=>({in(){return this},select(){return this},fields(){return this},exec(callback){callback([{node:{getContext:()=>ctx},width:300,height:400}])}})})
  definition.methods.draw.call({properties:{wall:{imageWidth:1000,imageHeight:500,holds:[hold]},activeHolds,dimImage},data:{transform:{scale:.1,offsetX:0,offsetY:0}}})
  return {ctx,strokes}
}
it('draws three exterior strokes without filling the rock or inflating small circles',async()=>{
  const {ctx,strokes}=await draw({id:'h1',x:.5,y:.5,radius:.01},{start:['h1']})
  expect(ctx.fill).not.toHaveBeenCalled()
  expect(strokes).toEqual([[8,'#ffffff'],[6,'#3fb96a'],[2,'#ffffff']])
  expect(ctx.rect).toHaveBeenCalledWith(0,0,300,400)
  expect(ctx.clip).toHaveBeenCalledWith('evenodd')
  for(const call of ctx.arc.mock.calls) expect(call[2]).toBe(1)
  expect(ctx.save).toHaveBeenCalledOnce()
  expect(ctx.restore).toHaveBeenCalledOnce()
})
it('keeps normalized polygon geometry and accepts detail-page role assignments',async()=>{
  const {ctx,strokes}=await draw({id:'h1',polygon:[[.1,.2],[.3,.2],[.3,.4]]},{h1:'finish'})
  expect(ctx.moveTo).toHaveBeenCalledWith(10,10)
  expect(ctx.lineTo).toHaveBeenCalledWith(30,20)
  expect(strokes[1]).toEqual([6,'#8f5fd9'])
  expect(ctx.clip).toHaveBeenCalledWith('evenodd')
})
it('does not outline unassigned rocks',async()=>{
  const {ctx,strokes}=await draw({id:'h1',x:.5,y:.5,radius:.01},{})
  expect(strokes).toEqual([])
  expect(ctx.fill).not.toHaveBeenCalled()
})

it('dims outside assigned rocks before drawing bright outlines',async()=>{
  const {ctx,strokes}=await draw({id:'h1',x:.5,y:.5,radius:.01},{start:['h1']},true)
  expect(ctx.fillRect).toHaveBeenCalledWith(0,0,300,400)
  expect(ctx.fillRect.mock.invocationCallOrder[0]).toBeLessThan(ctx.stroke.mock.invocationCallOrder[0])
  expect(ctx.clip).toHaveBeenCalledTimes(2)
  expect(strokes).toEqual([[8,'#ffffff'],[6,'#3fb96a'],[2,'#ffffff']])
})
