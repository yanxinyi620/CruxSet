import { expect, it } from 'vitest'
import { resolveDetailTarget, detailReturnTarget } from '../web/src/route-detail-navigation.js'

it('resolves independent addresses to the full wall browser', () => {
  expect(resolveDetailTarget('p1', [{id:'p1',wallId:'w1'}])).toEqual({name:'route-browser',wallId:'w1'})
  expect(resolveDetailTarget('missing', [{id:'p1',wallId:'w1'}])).toBeNull()
})
it('returns to the original expanded my-routes group after refresh or paging', () => {
  const query = new URLSearchParams('from=my-problems&returnWall=w1&problem=p2')
  expect(detailReturnTarget(query, 'w2')).toEqual({route:{name:'me'},query:{panel:'my-problems',expanded:'w1'}})
})
it('returns public and independent details to the current wall route list', () => {
  expect(detailReturnTarget(new URLSearchParams(), 'w2')).toEqual({route:{name:'route-browser',wallId:'w2'},query:{}})
})
