import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['tests/**/*.test.ts', 'edge/tests/**/*.test.ts'] } })
