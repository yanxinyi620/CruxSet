import { expect, it, vi } from 'vitest'
import { dimOutsideHolds } from '../wechat/miniprogram/domain/canvas-mask.js'

it('excludes every selected rock independently so overlapping interiors remain bright',()=>{
  const events:string[]=[]
  const ctx={save:()=>events.push('save'),restore:()=>events.push('restore'),beginPath:()=>events.push('begin'),rect:vi.fn(),clip:(rule:string)=>events.push(rule),fillStyle:'',fillRect:vi.fn(()=>events.push('dim'))}
  dimOutsideHolds(ctx,300,400,[()=>events.push('rock1'),()=>events.push('rock2')])
  expect(events).toEqual(['save','begin','rock1','evenodd','begin','rock2','evenodd','dim','restore'])
  expect(ctx.fillStyle).toBe('rgba(0,0,0,0.5)')
  expect(ctx.fillRect).toHaveBeenCalledWith(0,0,300,400)
})
it('dims the entire canvas when no rock has been selected',()=>{
  const ctx={save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn(),fillStyle:'',fillRect:vi.fn()}
  dimOutsideHolds(ctx,300,400,[])
  expect(ctx.clip).not.toHaveBeenCalled()
  expect(ctx.fillRect).toHaveBeenCalledWith(0,0,300,400)
})
