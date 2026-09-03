export type RuntimeMode = 'mock' | 'cloudbase'

export const runtimeMode: RuntimeMode = 'cloudbase'

const mockModes: RuntimeMode[] = ['mock']

// Vitest/Node has no wx global; keep domain tests deterministic while the
// Developer Tools runtime still uses the configured CloudBase mode.
export const isMockMode = () => mockModes.includes(runtimeMode) || !(globalThis as { wx?: unknown }).wx
