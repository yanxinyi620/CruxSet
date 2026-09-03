import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('shows wall management creation tools only to administrators', () => {
  const source = readFileSync('web/src/main.ts', 'utf8')

  expect(source).toContain('const wallCreationActions = isAdmin')
  expect(source).toContain('wallPublicationNote = isAdmin')
  expect(source).toContain('panel === "new-wall" && isAdmin')
  expect(source).toContain('panel === "drafts" && isAdmin')
})
