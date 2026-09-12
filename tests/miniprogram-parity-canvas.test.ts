// @ts-nocheck
import { beforeEach, expect, it, vi } from 'vitest'
let definition,component
beforeEach(async()=>{
 vi.resetModules();vi.stubGlobal('Component',v=>definition=v)
 await import('../wechat/miniprogram/components/wall-canvas/index.js')
 component={...definition.methods,data:{transform:{scale:1,offsetX:0,offsetY:0},viewportWidth:100,viewportHeight:100},properties:{wall:{id:'w',imageFileId:'cloud://a',imageWidth:100,imageHeight:100,holds:[]}},setData(v){Object.assign(this.data,v)},triggerEvent:vi.fn(),render:vi.fn(),initCanvas:vi.fn()}
})
it('initializes after the canvas node becomes ready',()=>{
 expect(definition.lifetimes.ready).toBeTypeOf('function')
 definition.lifetimes.ready.call(component)
 expect(component.initCanvas).toHaveBeenCalled()
})
it('preserves zoom and decoded image when only hold geometry changes',()=>{
 const wall=component.properties.wall
 definition.properties.wall.observer.call(component,wall)
 component.initCanvas.mockClear();component.loadedImage={decoded:true};component.data.transform.scale=3
 definition.properties.wall.observer.call(component,{...wall,holds:[{id:'H001'}]})
 expect(component.initCanvas).not.toHaveBeenCalled()
 expect(component.loadedImage).toEqual({decoded:true})
 expect(component.data.transform.scale).toBe(3)
})
it('does not crash when one finger remains after a pinch',()=>{
 component.fitScale=1
 component.onTouchStart({touches:[{x:20,y:20},{x:60,y:60}]})
 component.onTouchMove({touches:[{x:10,y:10},{x:70,y:70}]})
 component.onTouchEnd({touches:[{x:10,y:10}],changedTouches:[{x:70,y:70}]})
 expect(()=>component.onTouchMove({touches:[{x:20,y:10}]})).not.toThrow()
 expect(component.triggerEvent).not.toHaveBeenCalled()
})
