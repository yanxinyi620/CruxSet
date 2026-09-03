function fail (code) { throw new Error(code) }

function validateRouteMetadata (draft) {
  if (!draft || (draft.name !== undefined && (typeof draft.name !== 'string' || draft.name.length > 80)) || (draft.description !== undefined && (typeof draft.description !== 'string' || draft.description.length > 500))) fail('INVALID_ROUTE_METADATA')
}

module.exports = { validateRouteMetadata }
