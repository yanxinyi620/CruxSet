const imageCache = new Map<string, Promise<HTMLImageElement>>()

export const loadCachedImage = (source: string): Promise<HTMLImageElement> => {
  const existing = imageCache.get(source)
  if (existing) return existing

  const image = new Image()
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => {
      imageCache.delete(source)
      reject(new Error('IMAGE_LOAD_FAILED'))
    }
  })
  imageCache.set(source, pending)
  image.src = source
  return pending
}

export const resetImageCacheForTests = () => imageCache.clear()
