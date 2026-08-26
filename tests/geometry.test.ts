import {expect,it} from 'vitest'
import {circleHitTest,nearestHold,pointInPolygon} from '../src/domain/geometry.js'
it('hits circles and polygons',()=>{const hold={id:'H1',x:.5,y:.5,radius:.1,kind:'hold' as const};expect(circleHitTest([.55,.55],hold)).toBe(true);expect(pointInPolygon([.5,.5],[[.4,.4],[.6,.4],[.6,.6],[.4,.6]])).toBe(true)})
it('snaps to closest and prioritizes hold over volume',()=>{const volume={id:'V',x:.5,y:.5,radius:.2,kind:'volume' as const};const hold={id:'H',x:.51,y:.5,radius:.02,kind:'hold' as const};expect(nearestHold([.5,.5],[volume,hold],.03)?.id).toBe('H')})
