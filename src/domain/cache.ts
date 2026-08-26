export const layoutCacheKey = (layoutId: string, version: number) => `layout:${layoutId}:${version}`
export const shouldUseLayoutCache = (cachedVersion: number | undefined, currentVersion: number) => cachedVersion === currentVersion
