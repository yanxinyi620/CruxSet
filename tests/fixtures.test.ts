import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { decode } from 'jpeg-js'
import { demoWall } from '../src/data/demo.js'

it('provides a self-contained demo wall with normalized holds', () => {
  expect(demoWall.imageFileId).toBe('/assets/mock/ritan-spraywall-0822.jpg')
  const image = decode(readFileSync('web/public/assets/mock/ritan-spraywall-0822.jpg'))
  expect([demoWall.imageWidth, demoWall.imageHeight]).toEqual([image.width, image.height])
  expect(demoWall.holds.length).toBeGreaterThan(10)
  expect(demoWall.holds.every(h => h.x >= 0 && h.x <= 1 && h.y >= 0 && h.y <= 1)).toBe(true)
})
