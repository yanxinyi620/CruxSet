import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const publishFunction = require(resolve(process.cwd(), 'cloudfunctions/segmentationPublish/index.js')) as {
  _validatePayload: (payload: Record<string, unknown>) => unknown
  _payloadFromHttpEvent: (event: Record<string, unknown>) => Record<string, unknown>
}

const payload = (polygon: number[][] = [[.1, .1], [.9, .1], [.1, .9]]) => ({
  publishRequestId: 'request-1', sourceExperimentId: 'experiment-1', sourceCalibrationId: 'calibration-1',
  wallName: 'Wall', imageWidth: 100, imageHeight: 100, imageFileId: 'cloud://wall/image.png', ownerOpenid: 'openid-owner',
  holds: [{ id: 'H001', sourceId: 'source-1', kind: 'hold', polygon, bbox: [.1, .1, .9, .9], x: .3666666667, y: .3666666667, radius: Math.sqrt(.32 / Math.PI) }],
})

it('rejects self-intersecting polygons at the Cloud Function boundary', () => {
  expect(() => publishFunction._validatePayload(payload([[.1, .1], [.9, .9], [.2, .8], [.8, .1], [.1, .7]]))).toThrow('INVALID_HOLDS')
})

it('rejects holds whose derived bbox or radius does not match the polygon', () => {
  expect(() => publishFunction._validatePayload(payload())).not.toThrow()
  expect(() => publishFunction._validatePayload({ ...payload(), holds: [{ ...payload().holds[0], bbox: [.1, .1, .8, .9] }] })).toThrow('INVALID_HOLDS')
})

it('parses JSON HTTP trigger bodies before validating the publish payload', () => {
  expect(publishFunction._payloadFromHttpEvent({ body: JSON.stringify(payload()) })).toEqual(payload())
})
