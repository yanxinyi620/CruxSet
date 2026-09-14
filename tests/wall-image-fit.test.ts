import { expect, it } from 'vitest'
import { fitImageTransform, clampTransform } from '../wechat/miniprogram/domain/transform.js'

it.each([[1200,600],[600,1200],[100,2000]])('covers and centers %s by %s without blank space', (width,height) => {
  const t=fitImageTransform(360,420,width,height,'cover')
  expect(width*t.scale).toBeGreaterThanOrEqual(360)
  expect(height*t.scale).toBeGreaterThanOrEqual(420)
  expect(t.offsetX).toBeCloseTo((360-width*t.scale)/2)
  expect(t.offsetY).toBeCloseTo((420-height*t.scale)/2)
  const moved=clampTransform({...t,offsetX:10000,offsetY:-10000},360,420,width,height)
  expect(moved.offsetX).toBeLessThanOrEqual(0)
  expect(moved.offsetY+height*t.scale).toBeGreaterThanOrEqual(420)
})
it('keeps the complete image visible in the save preview',()=>{
  const t=fitImageTransform(360,220,1200,600,'contain')
  expect(t).toEqual({scale:.3,offsetX:0,offsetY:20})
})
