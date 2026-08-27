export type RuntimeMode = 'mock' | 'cloudbase'

export const runtimeMode: RuntimeMode = 'mock'

export const isMockMode = () => runtimeMode === 'mock'
