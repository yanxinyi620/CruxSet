import {expect,it} from 'vitest'
import {clampTransform,imageToScreen,screenToImage,zoomAroundAnchor} from '../src/domain/transform.js'
it('round trips coordinates',()=>{const t={scale:2.5,offsetX:30,offsetY:-4};const image:[number,number]=[120,90];const result=screenToImage(imageToScreen(image,t),t);expect(result[0]).toBeCloseTo(image[0]);expect(result[1]).toBeCloseTo(image[1])})
it('keeps zoom anchor stationary',()=>{const t={scale:2,offsetX:10,offsetY:20};const anchor:[number,number]=[100,80];const image=screenToImage(anchor,t);expect(imageToScreen(image,zoomAroundAnchor(t,4,anchor))).toEqual(anchor)})
it('clamps pan to the visible image bounds',()=>{expect(clampTransform({scale:2,offsetX:500,offsetY:-500},300,400,300,400)).toEqual({scale:2,offsetX:0,offsetY:-400});expect(clampTransform({scale:.5,offsetX:0,offsetY:0},300,400,300,400)).toEqual({scale:.5,offsetX:75,offsetY:100})})
