import { expect, it } from 'vitest'
import { createProblem } from '../src/domain/routes.js'
import { createProblem as miniCreateProblem } from '../miniprogram/domain/routes.js'

it('uses the same route rule implementation on both clients', () => {
  expect(miniCreateProblem).toBe(createProblem)
})
