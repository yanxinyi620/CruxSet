export function apiError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status })
}
