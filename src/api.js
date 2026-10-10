// Backend base URL. Set VITE_API_URL in .env.local for dev, and in Render for prod.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

/**
 * One turn of conversation with a professor.
 * `history` is the opaque array the previous reply returned; pass it straight back.
 */
export async function chat(professor, message, history = [], signal) {
  const res = await fetch(`${API_URL}/api/chat/${professor}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, history }),
    signal,
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* non-JSON error body; the status line will do */
    }
    throw new Error(detail)
  }
  return res.json()
}
