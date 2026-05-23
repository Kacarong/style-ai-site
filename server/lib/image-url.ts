// Convert a signed inference URL like
//   http://localhost:8000/storage/<id>?t=<token>
// into a same-origin proxy URL the browser can fetch reliably:
//   /api/image/<id>?t=<token>
//
// Why proxy: the inference URL's hostname (STORAGE_PUBLIC_BASE_URL) may not
// resolve correctly from the browser (e.g. localhost vs 127.0.0.1, or the
// inference server only listening on a Tailnet IP). Routing through Next.js
// removes the ambiguity — the browser only talks to the site origin it's
// already on, and Next.js forwards to inference using server-side env.
//
// Pure URL manipulation — safe in both server and client components.

export function toProxyImageUrl(inferenceUrl: string): string {
  try {
    const u = new URL(inferenceUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'storage' || !parts[1]) return inferenceUrl;
    const id = parts[1];
    const t = u.searchParams.get('t') ?? '';
    return `/api/image/${encodeURIComponent(id)}?t=${encodeURIComponent(t)}`;
  } catch {
    return inferenceUrl;
  }
}
