export type RuntimeMode = 'mock' | 'cloudbase'

export const runtimeMode: RuntimeMode = 'cloudbase'

const mockModes: RuntimeMode[] = ['mock']

export const isMockMode = () => mockModes.includes(runtimeMode)
