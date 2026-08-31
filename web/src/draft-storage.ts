const prefix = 'cruxset:draft:'
export const saveDraft = (key: string, value: unknown) => {
  try { sessionStorage.setItem(prefix + key, JSON.stringify(value)) } catch { /* storage may be unavailable */ }
}
export const loadDraft = <T>(key: string): T | undefined => {
  try { const raw = sessionStorage.getItem(prefix + key); return raw ? JSON.parse(raw) as T : undefined } catch { return undefined }
}
export const clearDraft = (key: string) => { try { sessionStorage.removeItem(prefix + key) } catch { /* noop */ } }
