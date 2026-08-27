import { expect, it } from 'vitest'
import { mockCurrentUserId, repositoryForMode } from '../miniprogram/services/mock-repository.js'

it('selects the stable mock identity and repository in mock mode', () => {
  expect(mockCurrentUserId).toBe('usr_mock_owner')
  expect(repositoryForMode('mock')).toBeDefined()
})
