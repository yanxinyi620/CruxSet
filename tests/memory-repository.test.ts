import { expect, it } from 'vitest'
import { MemoryProblemRepository } from '../src/repository/memory-repository.js'
it('stores routes and rejects duplicate numbers', async () => {
  const repo = new MemoryProblemRepository(); const p = { id:'1', number:'CS-000001' } as any
  await repo.create(p); expect(await repo.getAll()).toEqual([p]); await expect(repo.create(p)).rejects.toThrow()
})
