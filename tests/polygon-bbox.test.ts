import { expect, it } from 'vitest'
import { polygonHitTest } from '../src/domain/geometry.js'
it('rejects points outside a polygon bbox before polygon evaluation', () => { const hold={id:'H',x:.5,y:.5,radius:.1,kind:'hold' as const,bbox:[.4,.4,.6,.6] as const,polygon:[[.4,.4],[.6,.4],[.6,.6],[.4,.6]] as [number,number][]}; expect(polygonHitTest([.5,.5],hold)).toBe(true); expect(polygonHitTest([.8,.8],hold)).toBe(false) })
