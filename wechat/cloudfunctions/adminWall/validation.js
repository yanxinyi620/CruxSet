const supportedAngles = new Set([20, 25, 30, 35, 40, 45])
const holdKinds = new Set(['hold', 'volume'])
const normalized = value => Number.isFinite(value) && value >= 0 && value <= 1

const holdsAreValid = holds => Array.isArray(holds) && new Set(holds.map(hold => hold?.id)).size === holds.length && holds.every(hold => hold && /^H\d{3,}$/.test(hold.id) && holdKinds.has(hold.kind) && normalized(hold.x) && normalized(hold.y) && Number.isFinite(hold.radius) && hold.radius > 0 && hold.radius <= 1)
const angleOptionsAreValid = values => Array.isArray(values) && values.length > 0 && values.every(value => Number.isFinite(value) && supportedAngles.has(value))
const stringFieldsAreValid = data => ['name', 'description', 'imageFileId', 'displayImageFileId'].every(field => data[field] === undefined || typeof data[field] === 'string')
const completeWall = data => data && typeof data === 'object' && stringFieldsAreValid(data) && typeof data.name === 'string' && data.name && typeof data.imageFileId === 'string' && data.imageFileId && Number.isFinite(data.imageWidth) && data.imageWidth > 0 && Number.isFinite(data.imageHeight) && data.imageHeight > 0 && ['circle', 'polygon'].includes(data.geometryType) && holdsAreValid(data.holds) && angleOptionsAreValid(data.angleOptions)

const validateWallUpdate = (wall, patch, action) => {
  if (action === 'updateWallHolds' && !holdsAreValid(patch.holds)) throw new Error('INVALID_WALL_HOLDS')
  if (!stringFieldsAreValid(patch) || (patch.angleOptions !== undefined && !angleOptionsAreValid(patch.angleOptions)) || !completeWall({ ...wall, ...patch })) throw new Error('INVALID_WALL_DATA')
}

module.exports = { completeWall, holdsAreValid, validateWallUpdate }
