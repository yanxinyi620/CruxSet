/** Local lab has no multi-user authentication; only expose its integrated entry on local hosts. */
export function isLocalLabHost(hostname: string): boolean {
  if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) return true
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  return parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
}
