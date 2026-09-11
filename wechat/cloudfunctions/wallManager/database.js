// Vendored in each deployable function; CloudBase uploads functions independently.
async function all (query) {
  const result = []
  for (let offset = 0; ; offset += 100) {
    const page = (await query.skip(offset).limit(100).get()).data
    result.push(...page)
    if (page.length < 100) return result
  }
}
async function find (db, collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null
  } catch (error) {
    // Do not swallow network, permission or missing-collection failures.
    if (/document(?:[\s\S]*?)(?:not exist|not found|does not exist)/i.test(String(error.message || error.errMsg || ''))) return null
    throw error
  }
}
async function wallNumberSeed (db) {
  const walls = await all(db.collection('walls'))
  return Math.max(0, ...walls.map(w => Number.isInteger(w.wallNumber) && w.wallNumber > 0 ? w.wallNumber : 0))
}
async function nextWallNumber (transaction, observedMax) {
  // Scanning happens before the transaction. Every allocator writes this document,
  // so concurrent initializers/retries cannot reuse a number from a stale scan.
  const counter = await find(transaction, 'counters', 'wall_number')
  const value = Math.max(counter?.value || 0, observedMax || 0) + 1
  await transaction.collection('counters').doc('wall_number').set({ data: { id: 'wall_number', value } })
  return value
}
async function bootstrapWallNumbers (db) {
  const walls = await all(db.collection('walls'))
  const observedMax = Math.max(0, ...walls.map(w => Number.isInteger(w.wallNumber) && w.wallNumber > 0 ? w.wallNumber : 0))
  const missing = walls.filter(w => !Number.isInteger(w.wallNumber) || w.wallNumber <= 0).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)))
  for (const candidate of missing) {
    // A migration of any size stays under the 100-operation transaction ceiling.
    // Re-read each wall and the shared counter so concurrent bootstrap is harmless.
    await db.runTransaction(async transaction => {
      const wall = await find(transaction, 'walls', candidate.id || candidate._id)
      if (!wall || wall.deleting || Number.isInteger(wall.wallNumber) && wall.wallNumber > 0) return
      const wallNumber = await nextWallNumber(transaction, observedMax)
      await transaction.collection('walls').doc(wall.id || wall._id).update({ data: { wallNumber } })
    })
  }
  return observedMax
}
module.exports = { all, find, nextWallNumber, wallNumberSeed, bootstrapWallNumbers }
